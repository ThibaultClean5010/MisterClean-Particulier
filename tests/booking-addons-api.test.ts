import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookingSchema } from "../lib/server/validation.js";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), emails: vi.fn(), calendar: vi.fn() }));
vi.mock("../lib/server/supabase.js", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("../lib/server/email-outbox.js", () => ({ dispatchPendingEmails: mocks.emails }));
vi.mock("../lib/server/google-calendar.js", () => ({ createBookingEvent: mocks.calendar }));
vi.mock("../lib/server/env.js", () => ({ getEnv: () => ({ BUSINESS_EMAIL: "business@example.invalid" }) }));
import availability from "../api/booking/availability.js";
import config from "../api/booking/config.js";
import reservations from "../api/booking/reservations.js";
import { createBooking } from "../lib/server/create-booking.js";

const id = "11111111-1111-4111-8111-111111111111";
const body = {
  services: [{ serviceId: id, quantity: 2, addons: ["steam-cleaning", "hair-fur-removal"] }],
  startsAt: "2026-10-01T09:00:00+09:30", idempotencyKey: "22222222-2222-4222-8222-222222222222",
  customer: { firstName: "Test", lastName: "Customer", email: "test@example.invalid", phone: "0412345678" },
  address: { line1: "1 Test Street", suburb: "Adelaide", state: "SA", postcode: "5000" },
};
function query(addons?: unknown) {
  const params = new URLSearchParams({ serviceId: id, quantity: "2", date: "2026-10-01" });
  if (addons !== undefined) params.append("addons", JSON.stringify(addons));
  return new Request(`https://example.invalid/api/booking/availability?${params}`);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.calendar.mockResolvedValue(null);
});

describe("addon API integration", () => {
  it("passes the same addons and quantities to availability", async () => {
    expect((await availability.fetch(query(body.services[0].addons))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("get_booking_availability_quantities", {
      p_services: [{ service_id: id, quantity: 2, addons: body.services[0].addons }], p_local_date: "2026-10-01",
    });
  });
  it("keeps legacy requests working without addons", async () => {
    expect((await availability.fetch(query())).status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1].p_services[0].addons).toEqual([]);
  });
  it.each([null, ["invalid"], ["steam-cleaning", "steam-cleaning"]])("rejects invalid addons %j before the RPC", async (addons) => {
    expect((await availability.fetch(query(addons))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and unmatched service/addon lists", async () => {
    const url = query().url;
    expect((await availability.fetch(new Request(`${url}&addons=not-json`))).status).toBe(400);
    expect((await availability.fetch(new Request(`${url}&addons=[]&addons=[]`))).status).toBe(400);
  });
  it("returns an actionable validation error for unavailable extras", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "22023", message: "SERVICE_ADDON_NOT_AVAILABLE" } });
    expect((await availability.fetch(query(["steam-cleaning"]))).status).toBe(400);
    await expect(createBooking(bookingSchema.parse(body))).rejects.toMatchObject({ status: 400 });
    expect(mocks.emails).not.toHaveBeenCalled();
  });
  it("persists only codes and returns the authoritative price; Calendar receives addon labels", async () => {
    const names = ["2 × Sofa up to 3 seats (Steam cleaning +$30 per item; Hair and fur removal +$25 per item)"];
    mocks.rpc.mockResolvedValue({ data: { id: "test", reference: "MC-TEST", starts_at: body.startsAt, ends_at: "2026-10-01T12:40:00+09:30", price_label: "$330", service_names: names }, error: null });
    const request = new Request("https://example.invalid/api/booking/reservations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, price_cents: 1 }) });
    const response = await reservations.fetch(request);
    expect(response.status).toBe(201);
    expect((await response.json()).booking.price_label).toBe("$330");
    expect(mocks.rpc.mock.calls[0][1].p_services).toEqual([{ service_id: id, quantity: 2, addons: body.services[0].addons }]);
    expect(mocks.emails).toHaveBeenCalledWith("test");
    expect(mocks.calendar).toHaveBeenCalledWith(expect.objectContaining({ serviceNames: names }));
  });
  it("only exposes active extras, in catalogue order", async () => {
    mocks.from.mockImplementation((table) => {
      const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), single: vi.fn() };
      chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
      const result = table === "services" ? [{ id, addons: [
        { code: "off", is_active: false, sort_order: 0 },
        { code: "hair-fur-removal", is_active: true, sort_order: 20 },
        { code: "steam-cleaning", is_active: true, sort_order: 10 },
      ] }] : { timezone: "Australia/Adelaide" };
      chain.order.mockResolvedValue({ data: result }); chain.single.mockResolvedValue({ data: result });
      return chain;
    });
    const response = await config.fetch(new Request("https://example.invalid/api/booking/config"));
    expect(response.status).toBe(200);
    expect((await response.json()).services[0].addons.map((a: { code: string }) => a.code)).toEqual(["steam-cleaning", "hair-fur-removal"]);
  });
});
