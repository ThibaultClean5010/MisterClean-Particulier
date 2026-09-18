import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { renderBookingEmail } from "../lib/server/emails/booking-email.ts";

// Ephemeral PostgreSQL only: no credentials, HTTP, emails or real bookings.
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
let services;
let day;
let originalBooking;
const selection = (slug, quantity = 1, addons = []) => [{ service_id: services[slug].id, quantity, addons }];
const resolve = async (items) => (await db.query("select * from resolve_booking_selection($1::jsonb)", [JSON.stringify(items)])).rows;
const slots = async (items) => (await db.query("select * from get_booking_availability_quantities($1::jsonb, $2::date)", [JSON.stringify(items), day])).rows;
async function book(items, startsAt, key = randomUUID()) {
  const { rows } = await db.query(`select create_booking_quantities(
    $1::jsonb, $2::timestamptz, 'Test', 'Customer', 'test@example.invalid', '0412345678',
    '1 Test Street', '', 'Adelaide', 'SA', '5000', '', $3, $4::uuid, 'business@example.invalid'
  ) as booking`, [JSON.stringify(items), startsAt, randomUUID(), key]);
  return rows[0].booking;
}

beforeAll(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema extensions;");
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const migrations = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of migrations.filter((file) => !file.startsWith("013_"))) {
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }
  services = Object.fromEntries((await db.query("select * from services")).rows.map((s) => [s.slug, s]));
  day = (await db.query("select ((now() at time zone 'Australia/Adelaide')::date + 3)::text as day")).rows[0].day;
  await db.query("insert into availability_exceptions(local_date, is_closed, opens_at, closes_at) values ($1::date, false, '07:00', '19:30')", [day]);
  // Create one genuine old-schema snapshot before migrating, then verify it survives.
  const oldItems = selection("dining-chair");
  const oldSlots = await slots(oldItems);
  originalBooking = await book(oldItems, oldSlots.at(-1).starts_at);
  await db.exec(await readFile(new URL("013_booking_service_addons.sql", directory), "utf8"));
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

describe("booking addon database rules", () => {
  it("configures both extras for all eleven bookable services only", async () => {
    const { rows } = await db.query("select s.slug, count(a.code)::int as count from services s left join service_addons a on a.service_id = s.id group by s.slug");
    expect(rows.filter((r) => r.count === 2)).toHaveLength(11);
    expect(rows.find((r) => r.slug === "staircase").count).toBe(0);
  });

  it("leaves existing prices, durations and booking snapshots unchanged", async () => {
    const { rows } = await db.query("select b.price_cents, b.duration_minutes, bs.addons from bookings b join booking_services bs on bs.booking_id = b.id where b.id = $1", [originalBooking.id]);
    expect(rows[0]).toEqual({ price_cents: 3000, duration_minutes: 20, addons: [] });
    for (const service of Object.values(services).filter((s) => !s.requires_quote)) {
      expect((await resolve([{ service_id: service.id, quantity: 1 }]))[0]).toMatchObject({ price_cents: service.price_cents, duration_minutes: service.duration_minutes, addons: [] });
    }
  });

  it("uses database prices and applies both extras per item", async () => {
    const items = selection("sofa-up-to-3-seats", 2, ["steam-cleaning", "hair-fur-removal"]);
    items[0].price_cents = 1;
    items[0].duration_minutes = 1;
    const [line] = await resolve(items);
    expect(line).toMatchObject({ price_cents: 16500, quantity: 2, duration_minutes: 110 });
    expect(line.addons).toHaveLength(2);
    const [slot] = await slots(items);
    expect((new Date(slot.ends_at) - new Date(slot.starts_at)) / 60000).toBe(220);
  });

  it("supports either extra independently at service-specific prices", async () => {
    expect((await resolve(selection("mattress-single", 1, ["steam-cleaning"])))[0].price_cents).toBe(11400);
    expect((await resolve(selection("mattress-single", 1, ["hair-fur-removal"])))[0].price_cents).toBe(10900);
    expect((await resolve(selection("sofa-5-seats-plus", 1, ["steam-cleaning"])))[0].price_cents).toBe(22000);
  });

  it.each([
    ["sofa-up-to-3-seats", 11000, 3000, 2500],
    ["sofa-4-seats", 13500, 4000, 3000],
    ["sofa-5-seats-plus", 17000, 5000, 4000],
  ])("uses the owner's revised steam price for %s without changing base or fur prices", async (slug, base, steam, fur) => {
    expect((await resolve(selection(slug)))[0].price_cents).toBe(base);
    const [line] = await resolve(selection(slug, 1, ["steam-cleaning"]));
    expect(line.price_cents).toBe(base + steam);
    expect(line.addons[0].price_cents).toBe(steam);
    expect((await resolve(selection(slug, 1, ["hair-fur-removal"])))[0].price_cents).toBe(base + fur);
  });

  it.each([
    ["unknown", ["free-cleaning"]], ["duplicate", ["steam-cleaning", "steam-cleaning"]],
    ["object", [{ code: "steam-cleaning", price_cents: 0 }]], ["not an array", "steam-cleaning"],
  ])("rejects %s addons", async (_name, addons) => {
    await expect(resolve(selection("rug", 1, addons))).rejects.toMatchObject({ code: "22023" });
  });

  it("rejects unavailable extras for the selected service", async () => {
    await db.query("update service_addons set is_active = false where service_id = $1 and code = 'steam-cleaning'", [services.rug.id]);
    await expect(resolve(selection("rug", 1, ["steam-cleaning"]))).rejects.toMatchObject({ code: "22023" });
  });

  it("stores totals, addons, one buffer and email-visible details; retries preserve the snapshot", async () => {
    const items = [...selection("sofa-up-to-3-seats", 2, ["steam-cleaning", "hair-fur-removal"]), ...selection("rug")];
    const [slot] = await slots(items);
    const key = randomUUID();
    const booking = await book(items, slot.starts_at, key);
    expect(booking).toMatchObject({ price_cents: 38000, price_label: "$380" });
    const stored = (await db.query("select * from bookings where id = $1", [booking.id])).rows[0];
    expect(stored.duration_minutes).toBe(265);
    const block = (await db.query("select extract(epoch from (occupied_ends_at - occupied_starts_at))/60 as minutes from schedule_blocks where id = $1", [stored.schedule_block_id])).rows[0];
    expect(Number(block.minutes)).toBe(295);
    expect((await db.query("select * from email_outbox where booking_id = $1", [booking.id])).rows).toHaveLength(2);
    for (const template of ["booking_customer_confirmation", "booking_business_notification", "booking_customer_cancellation", "booking_business_cancellation"]) {
      const { html } = renderBookingEmail(template, stored, { cancellation_token: "test" }, "https://example.invalid");
      expect(html).toContain("Steam cleaning +$30 per item");
      expect(html).toContain("Hair and fur removal +$25 per item");
      expect(html).toContain("$380");
    }
    await db.exec("update service_addons set price_cents = 9999, name = 'Changed catalogue name'");
    const again = await book(items, slot.starts_at, key);
    expect(again).toEqual(booking);
    const snapshots = (await db.query("select addons, price_cents from booking_services where booking_id = $1 order by position", [booking.id])).rows;
    expect(snapshots[0].price_cents).toBe(16500);
    expect(snapshots[0].addons[0].price_cents).toBe(3000);
  });

  it("removes late slots and prevents overlap with the extra work and buffer", async () => {
    const plain = selection("sofa-up-to-3-seats");
    const extras = selection("sofa-up-to-3-seats", 1, ["steam-cleaning", "hair-fur-removal"]);
    expect((await slots(extras)).length).toBeLessThan((await slots(plain)).length);
    const [slot] = await slots(extras);
    await book(extras, slot.starts_at);
    const occupiedUntil = new Date(new Date(slot.starts_at).getTime() + 140 * 60000);
    const chairSlots = await slots(selection("dining-chair"));
    expect(chairSlots.every((s) => new Date(s.starts_at) >= occupiedUntil)).toBe(true);
    await expect(book(plain, slot.starts_at)).rejects.toMatchObject({ code: "23P01" });
  });

  it("does not permit anonymous catalogue writes or booking RPC calls", async () => {
    const { rows } = await db.query(`select has_table_privilege('anon', 'service_addons', 'INSERT') as insert,
      has_function_privilege('anon', 'resolve_booking_selection(jsonb)', 'EXECUTE') as resolve,
      has_function_privilege('anon', 'get_booking_availability_quantities(jsonb,date)', 'EXECUTE') as availability`);
    expect(rows[0]).toEqual({ insert: false, resolve: false, availability: false });
  });
});
