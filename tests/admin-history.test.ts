import { describe, expect, it } from "vitest";
import { adelaideMidnight, buildHistoryReport, historyDateKey, historyPeriod, type HistoryBooking } from "../lib/server/admin-history.js";

const now = new Date("2026-10-05T12:00:00Z");
const period = historyPeriod("month", "2026-09", now);
const row = (overrides: Partial<HistoryBooking> = {}): HistoryBooking => ({
  id: "one", reference: "MC-ONE", service_name: "2 × Sofa + Steam + Hair removal",
  starts_at: "2026-09-04T01:00:00Z", ends_at: "2026-09-04T03:00:00Z", status: "confirmed",
  price_cents: 33000, customer_first_name: "Example", customer_last_name: "Customer",
  booking_services: [{ service_id: "sofa", service_name: "Sofa up to 3 seats", quantity: 2, price_cents: 16500 }],
  ...overrides,
});
describe("private history reporting", () => {
  it("uses saved booking totals without doubling quantities or extras", () => {
    const result = buildHistoryReport([row()], period);
    expect(result.current).toMatchObject({ valueCents: 33000, visits: 1, items: 2, averageCents: 33000 });
    expect(result.services).toEqual([{ name: "Sofa up to 3 seats", items: 2, valueCents: 33000, unpricedItems: 0 }]);
    expect(result.series[3]).toMatchObject({ currentCents: 33000, currentVisits: 1 });
  });
  it("keeps cancelled appointments in history but out of all totals and breakdowns", () => {
    const result = buildHistoryReport([row({ status: "cancelled" })], period);
    expect(result.current).toMatchObject({ visits: 0, valueCents: 0, items: 0, cancelled: 1 });
    expect(result.bookings[0].status).toBe("cancelled");
    expect(result.services).toEqual([]);
    expect(result.series.every(bucket => bucket.currentCents === 0)).toBe(true);
  });
  it("excludes future appointments and visits that have not ended", () => {
    const current = historyPeriod("month", "2026-09", new Date("2026-09-04T02:00:00Z"));
    expect(buildHistoryReport([row()], current).bookings).toEqual([]);
    expect(current.partial).toBe(true);
  });
  it("compares complete prior periods, with explicit partial-period metadata", () => {
    const result = buildHistoryReport([row({ id: "old", starts_at: "2026-08-04T01:00:00Z", ends_at: "2026-08-04T03:00:00Z" })], period);
    expect(result.previous.valueCents).toBe(33000);
    expect(result.current.valueCents).toBe(0);
    expect(result.series[3].previousCents).toBe(33000);
    expect(result.bookings).toEqual([]);
    expect(result.period.partial).toBe(false);
  });
  it("treats unknown prices differently from genuine zero-dollar bookings", () => {
    const result = buildHistoryReport([row({ price_cents: null }), row({ id: "zero", price_cents: 0 })], period);
    expect(result.current).toMatchObject({ visits: 2, pricedVisits: 1, unpricedVisits: 1, averageCents: 0 });
    expect(result.bookings.find(b => b.id === "one")?.amountCents).toBeNull();
  });
  it("reconciles incomplete legacy lines without inventing service revenue", () => {
    const result = buildHistoryReport([row({ booking_services: [] })], period);
    expect(result.services[0]).toMatchObject({ name: "Other / unallocated booking totals", valueCents: 33000 });
    expect(result.services.reduce((sum, service) => sum + service.valueCents, 0)).toBe(result.current.valueCents);
  });
  it("does not count duplicate rows or unknown statuses", () => {
    expect(buildHistoryReport([row(), row(), row({ id: "invalid", status: "draft" })], period).current.visits).toBe(1);
  });
  it("uses Adelaide dates at month boundaries instead of UTC dates", () => {
    const result = buildHistoryReport([row({ starts_at: "2026-08-31T20:00:00Z", ends_at: "2026-08-31T21:00:00Z" })], period);
    expect(result.bookings[0].date).toBe("2026-09-01");
    expect(result.series[0].currentVisits).toBe(1);
    expect(historyDateKey("2026-12-31T14:00:00Z")).toBe("2027-01-01");
  });
  it("handles Adelaide daylight-saving boundaries", () => {
    expect(adelaideMidnight("2026-10-01")).toBe("2026-09-30T14:30:00.000Z");
    expect(adelaideMidnight("2026-11-01")).toBe("2026-10-31T13:30:00.000Z");
    expect(adelaideMidnight("2026-04-06")).toBe("2026-04-05T14:30:00.000Z");
  });
  it("handles year rollover, leap years and different month lengths", () => {
    expect(historyPeriod("month", "2026-01", now).previousStart).toBe("2025-12-01");
    const leap = historyPeriod("month", "2024-02", now);
    expect(leap.currentRange).toBe("2024-02-01 – 2024-02-29");
    expect(buildHistoryReport([], leap).series).toHaveLength(31);
    expect(buildHistoryReport([], historyPeriod("year", "2025", now)).series).toHaveLength(12);
  });
  it.each([["month", "2026-13"], ["day", "2026-09"], ["month", "2026-9"], ["year", "1999"], ["year", "2027"], ["month", "2026-11"]])("rejects invalid or future periods %s %s", (mode, value) => {
    expect(() => historyPeriod(mode, value, now)).toThrow("INVALID_HISTORY_PERIOD");
  });
});
