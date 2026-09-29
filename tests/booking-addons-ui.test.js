// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = {
  id: "11111111-1111-4111-8111-111111111111", slug: "sofa-up-to-3-seats", name: "Sofa up to 3 seats",
  price_cents: 14000, price_label: "$140", duration_minutes: 90,
  description: "Steam cleaning included for suitable fabrics.",
  addons: [
    { code: "hair-fur-removal", name: "Hair and fur removal", price_cents: 2500, duration_minutes: 20, description: "Embedded hair and pet fur." },
  ],
};
const slot = { starts_at: "2026-10-01T09:00:00+09:30", ends_at: "2026-10-01T12:40:00+09:30" };
let requests;
let catalogue;
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
  catalogue = [structuredClone(service)];
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    requests.push({ url: String(url), ...options });
    let data;
    if (url === "/api/booking/config") data = { services: catalogue, settings: { maximum_advance_booking_days: 90 } };
    else if (String(url).startsWith("/api/booking/availability?")) data = { slots: [slot] };
    else if (options.method === "POST") data = { booking: { reference: "MC-TEST", price_label: "$330" } };
    else if (url === "/api/admin/availability") data = { weekly: [], exceptions: [] };
    else data = { bookings: [], customers: [] };
    return { ok: true, json: async () => data };
  }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); window.history.replaceState({}, "", "/"); });

describe("service link preselection", () => {
  it.each(["/booking/sofa-up-to-3-seats", "/booking?service=sofa-up-to-3-seats"])("preselects the service while leaving paid extras unchecked: %s", async path => {
    window.history.replaceState({}, "", path);
    await loadMarkup("booking/index.html");
    await import("../booking/booking.js");
    await vi.waitFor(() => expect(find(".service-option select")?.value).toBe("1"));
    expect(find('input[value="steam-cleaning"]')).toBeNull();
    expect(find('input[value="hair-fur-removal"]').checked).toBe(false);
    expect(find(".service-body").textContent).toContain("Steam cleaning included");
    expect(find("[data-service-selection]").textContent).toContain("90 min · $140");
    expect(requests.some(request => request.method === "POST")).toBe(false);
  });
});

describe("customer addon selection", () => {
  beforeEach(async () => {
    await loadMarkup("booking/index.html");
    await import("../booking/booking.js");
    await vi.waitFor(() => expect(find(".service-option")).not.toBeNull());
  });
  it("starts unchecked, preserves extras on quantity change and clears them on removal", () => {
    const quantity = find(".service-option select");
    const fur = find('input[value="hair-fur-removal"]');
    expect(find('input[value="steam-cleaning"]')).toBeNull();
    expect(find(".service-addons").disabled).toBe(true);
    expect(fur.checked).toBe(false);
    change(quantity, "2"); fur.click();
    expect(find("[data-service-selection]").textContent).toContain("220 min · $330");
    change(quantity, "3");
    expect(fur.checked).toBe(true);
    expect(find("[data-service-selection]").textContent).toContain("330 min · $495");
    change(quantity, "0");
    expect(fur.checked).toBe(false);
    expect(find("[data-service-selection]").hidden).toBe(true);
    change(quantity, "1");
    expect(fur.checked).toBe(false);
    expect(find("[data-service-selection]").textContent).toContain("90 min · $140");
  });
  it("charges included Steam once and carries fur through availability, review and confirmation", async () => {
    change(find(".service-option select"), "2");
    find('input[value="hair-fur-removal"]').click();
    fill(find("form"));
    await next(); await next(); await next();
    const availability = new URL(requests.find((r) => r.url.includes("/availability?")).url, "https://example.invalid");
    expect(JSON.parse(availability.searchParams.get("addons"))).toEqual(["hair-fur-removal"]);
    find(".slot-option").click(); await next(); await next();
    const summary = find("[data-booking-summary]").textContent;
    expect(summary).not.toContain("2 × Steam cleaning");
    expect(summary).toContain("2 × Hair and fur removal");
    expect(summary).toContain("$280");
    expect(summary).toContain("+$50");
    expect(summary).toContain("220 min");
    expect(summary).toContain("$330");
    await next();
    const posted = JSON.parse(requests.find((r) => r.url === "/api/booking/reservations").body);
    expect(posted.services).toEqual([{ serviceId: service.id, quantity: 2, addons: ["hair-fur-removal"] }]);
    expect(find('[data-step="7"]').hidden).toBe(false);
    expect(find("[data-confirmed-total]").textContent).toContain("$330 AUD");
  });
  it.each(["availability", "confirmation"])("asks for a refresh when an old option is rejected at %s", async (stage) => {
    change(find(".service-option select"), "1");
    fill(find("form"));
    if (stage === "confirmation") {
      await next(); await next(); await next();
      find(".slot-option").click(); await next(); await next();
    }
    fetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "SERVICE_ADDON_NOT_AVAILABLE" }) });
    if (stage === "availability") { await next(); await next(); }
    await next();
    expect(find("[data-booking-error]").textContent).toContain("refresh this page");
    expect(find('[data-step="7"]').hidden).toBe(true);
  });
});

describe("paid Steam on other services", () => {
  it.each(["booking", "admin"])("keeps both paid extras for a mattress in %s without adding Steam to the sofa", async (page) => {
    catalogue.push({ id: "33333333-3333-4333-8333-333333333333", slug: "mattress-single", name: "Single mattress",
      price_cents: 9900, price_label: "$99", duration_minutes: 60, addons: [
        { code: "steam-cleaning", name: "Steam cleaning", price_cents: 1500, duration_minutes: 10 },
        { code: "hair-fur-removal", name: "Hair and fur removal", price_cents: 1000, duration_minutes: 10 },
      ] });
    await loadMarkup(`${page}/index.html`);
    if (page === "booking") await import("../booking/booking.js");
    else {
      await import("../admin/admin.js");
      find("[data-open-manual-booking]").click();
    }
    await vi.waitFor(() => expect(find(`[data-service-id="${catalogue[1].id}"]`)).not.toBeNull());
    const sofa = find(`[data-service-id="${service.id}"]`);
    const mattress = find(`[data-service-id="${catalogue[1].id}"]`);
    expect(sofa.querySelector('input[value="steam-cleaning"]')).toBeNull();
    change(sofa.querySelector("select"), "1");
    change(mattress.querySelector("select"), "1");
    mattress.querySelector('input[value="steam-cleaning"]').click();
    mattress.querySelector('input[value="hair-fur-removal"]').click();
    expect(find(page === "booking" ? "[data-service-selection]" : "[data-manual-selection]").textContent).toContain("170 min · $264");
    await settle();
  });
});

describe("manual admin addon selection", () => {
  it("rechecks availability after changes and submits the same selected extras", async () => {
    await loadMarkup("admin/index.html");
    await import("../admin/admin.js");
    find("[data-open-manual-booking]").click();
    await vi.waitFor(() => expect(find(".manual-service-option")).not.toBeNull());
    expect(find('input[value="steam-cleaning"]')).toBeNull();
    expect(find(".manual-service-option").textContent).toContain("Steam cleaning included");
    change(find(".manual-service-option select"), "2");
    await settle();
    find(".manual-slot-option").click();
    expect(find("[data-create-manual-booking]").disabled).toBe(false);
    find('input[value="hair-fur-removal"]').click();
    expect(find("[data-create-manual-booking]").disabled).toBe(true);
    expect(find("[data-manual-selection]").textContent).toContain("220 min · $330");
    await settle();
    find(".manual-slot-option").click();
    fill(find("[data-manual-booking-form]"));
    find("[data-manual-booking-form]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    const posted = JSON.parse(requests.find((r) => r.url === "/api/admin/bookings" && r.method === "POST").body);
    expect(posted.services[0].addons).toEqual(["hair-fur-removal"]);
    expect(posted.services[0].quantity).toBe(2);
  });
});
