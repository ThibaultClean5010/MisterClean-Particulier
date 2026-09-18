// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = {
  id: "11111111-1111-4111-8111-111111111111", slug: "sofa-up-to-3-seats", name: "Sofa up to 3 seats",
  price_cents: 11000, price_label: "$110", duration_minutes: 75,
  addons: [
    { code: "steam-cleaning", name: "Steam cleaning", price_cents: 3000, duration_minutes: 15, description: "For suitable fabrics only." },
    { code: "hair-fur-removal", name: "Hair and fur removal", price_cents: 2500, duration_minutes: 20, description: "Embedded hair and pet fur." },
  ],
};
const slot = { starts_at: "2026-10-01T09:00:00+09:30", ends_at: "2026-10-01T12:40:00+09:30" };
let requests;
const find = (selector) => document.querySelector(selector);
const change = (element, value) => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
async function next() { find("[data-next]").click(); await settle(); }
async function loadMarkup(path) {
  const html = await readFile(resolve(path), "utf8");
  document.documentElement.innerHTML = html
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}
function fill(form) {
  for (const [name, value] of Object.entries({ firstName: "Test", lastName: "Customer", email: "test@example.invalid", phone: "0412345678", addressLine1: "1 Test Street", suburb: "Adelaide", postcode: "5000" })) {
    form.elements.namedItem(name).value = value;
  }
  const date = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  form.elements.namedItem("date").value = date;
}
beforeEach(() => {
  vi.resetModules();
  // Test the real DOM interactions without fetching fonts, styles or page scripts.
  window.happyDOM.settings.disableCSSFileLoading = true;
  window.happyDOM.settings.disableJavaScriptFileLoading = true;
  window.happyDOM.settings.disableJavaScriptEvaluation = true;
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    requests.push({ url: String(url), ...options });
    let data;
    if (url === "/api/booking/config") data = { services: [structuredClone(service)], settings: { maximum_advance_booking_days: 90 } };
    else if (String(url).startsWith("/api/booking/availability?")) data = { slots: [slot] };
    else if (options.method === "POST") data = { booking: { reference: "MC-TEST", price_label: "$330" } };
    else if (url === "/api/admin/availability") data = { weekly: [], exceptions: [] };
    else data = { bookings: [], customers: [] };
    return { ok: true, json: async () => data };
  }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe("customer addon selection", () => {
  beforeEach(async () => {
    await loadMarkup("booking/index.html");
    await import("../booking/booking.js");
    await vi.waitFor(() => expect(find(".service-option")).not.toBeNull());
  });
  it("starts unchecked, preserves extras on quantity change and clears them on removal", () => {
    const quantity = find(".service-option select");
    const steam = find('input[value="steam-cleaning"]');
    expect(find(".service-addons").disabled).toBe(true);
    expect(steam.checked).toBe(false);
    change(quantity, "2"); steam.click();
    expect(find("[data-service-selection]").textContent).toContain("180 min · $280");
    change(quantity, "3");
    expect(steam.checked).toBe(true);
    expect(find("[data-service-selection]").textContent).toContain("270 min · $420");
    change(quantity, "0");
    expect(steam.checked).toBe(false);
    expect(find("[data-service-selection]").hidden).toBe(true);
    change(quantity, "1");
    expect(steam.checked).toBe(false);
    expect(find("[data-service-selection]").textContent).toContain("75 min · $110");
  });
  it("carries both extras through availability, itemised review and confirmation", async () => {
    change(find(".service-option select"), "2");
    find('input[value="steam-cleaning"]').click(); find('input[value="hair-fur-removal"]').click();
    fill(find("form"));
    await next(); await next(); await next();
    const availability = new URL(requests.find((r) => r.url.includes("/availability?")).url, "https://example.invalid");
    expect(JSON.parse(availability.searchParams.get("addons"))).toEqual(["steam-cleaning", "hair-fur-removal"]);
    find(".slot-option").click(); await next(); await next();
    const summary = find("[data-booking-summary]").textContent;
    expect(summary).toContain("2 × Steam cleaning");
    expect(summary).toContain("2 × Hair and fur removal");
    expect(summary).toContain("+$60");
    expect(summary).toContain("+$50");
    expect(summary).toContain("220 min");
    expect(summary).toContain("$330");
    await next();
    const posted = JSON.parse(requests.find((r) => r.url === "/api/booking/reservations").body);
    expect(posted.services).toEqual([{ serviceId: service.id, quantity: 2, addons: ["steam-cleaning", "hair-fur-removal"] }]);
    expect(find('[data-step="7"]').hidden).toBe(false);
    expect(find("[data-confirmed-total]").textContent).toContain("$330 AUD");
  });
});

describe("manual admin addon selection", () => {
  it("rechecks availability after changes and submits the same selected extras", async () => {
    await loadMarkup("admin/index.html");
    await import("../admin/admin.js");
    find("[data-open-manual-booking]").click();
    await vi.waitFor(() => expect(find(".manual-service-option")).not.toBeNull());
    change(find(".manual-service-option select"), "2");
    await settle();
    find(".manual-slot-option").click();
    expect(find("[data-create-manual-booking]").disabled).toBe(false);
    find('input[value="steam-cleaning"]').click(); find('input[value="hair-fur-removal"]').click();
    expect(find("[data-create-manual-booking]").disabled).toBe(true);
    expect(find("[data-manual-selection]").textContent).toContain("220 min · $330");
    await settle();
    find(".manual-slot-option").click();
    fill(find("[data-manual-booking-form]"));
    find("[data-manual-booking-form]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    const posted = JSON.parse(requests.find((r) => r.url === "/api/admin/bookings" && r.method === "POST").body);
    expect(posted.services[0].addons).toEqual(["steam-cleaning", "hair-fur-removal"]);
    expect(posted.services[0].quantity).toBe(2);
  });
});
