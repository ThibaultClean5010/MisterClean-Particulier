import { describe, expect, it } from "vitest";
import { money, selectionTotals, serviceBreakdown, servicePayload } from "../booking/service-addons.js";
import { bookingSchema, availabilityQuerySchema, toRpcServices } from "../lib/server/validation.ts";

export const sofa = {
  id: "11111111-1111-4111-8111-111111111111", slug: "sofa-up-to-3-seats", name: "Sofa up to 3 seats",
  price_cents: 11000, price_label: "$110", duration_minutes: 75, quantity: 2,
  addons: [
    { code: "steam-cleaning", name: "Steam cleaning", price_cents: 3000, duration_minutes: 15, description: "For suitable fabrics only." },
    { code: "hair-fur-removal", name: "Hair and fur removal", price_cents: 2500, duration_minutes: 20, description: "Embedded hair and pet fur." },
  ],
};

describe("addon estimates and request validation", () => {
  it("keeps the base quote when nothing is selected", () => {
    expect(selectionTotals([sofa])).toEqual({ cents: 22000, minutes: 150 });
  });
  it("multiplies extras and time by quantity, supports deselection and mixed services", () => {
    const selected = { ...sofa, selectedAddons: ["steam-cleaning", "hair-fur-removal"] };
    expect(selectionTotals([selected])).toEqual({ cents: 33000, minutes: 220 });
    expect(selectionTotals([{ ...selected, quantity: 1 }])).toEqual({ cents: 16500, minutes: 110 });
    expect(selectionTotals([{ ...selected, selectedAddons: ["steam-cleaning"] }])).toEqual({ cents: 28000, minutes: 180 });
    expect(serviceBreakdown([selected]).map((r) => r[1])).toEqual(["$220", "+$60", "+$50"]);
    expect(selectionTotals([selected, { ...sofa, quantity: 1 }])).toEqual({ cents: 44000, minutes: 295 });
    expect(selectionTotals([])).toEqual({ cents: 0, minutes: 0 });
  });
  it("handles fractional prices and quotes without turning them into free services", () => {
    expect(money(1050)).toBe("$10.50");
    expect(money(selectionTotals([{ ...sofa, price_cents: null }]).cents)).toBe("Confirmed separately");
  });
  it("sends only ids, quantities and selected codes", () => {
    const payload = servicePayload({ ...sofa, selectedAddons: ["hair-fur-removal"] });
    expect(payload).toEqual({ serviceId: sofa.id, quantity: 2, addons: ["hair-fur-removal"] });
    const parsed = availabilityQuerySchema.parse({ date: "2026-10-01", services: [payload] });
    expect(toRpcServices(parsed.services)).toEqual([{ service_id: sofa.id, quantity: 2, addons: ["hair-fur-removal"] }]);
  });
  it.each([null, "steam-cleaning", ["unknown"], ["steam-cleaning", "steam-cleaning"], [{ code: "steam-cleaning", price_cents: 0 }]])("rejects malformed addon input %j", (addons) => {
    const services = [{ serviceId: sofa.id, quantity: 1, addons }];
    expect(availabilityQuerySchema.safeParse({ date: "2026-10-01", services }).success).toBe(false);
    expect(bookingSchema.shape.services.safeParse(services).success).toBe(false);
  });
});
