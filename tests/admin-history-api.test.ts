import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/server/http.js";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getSupabaseAdmin: vi.fn() }));
vi.mock("../lib/server/admin-auth.js", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../lib/server/supabase.js", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
import handler from "../api/admin/bookings.js";
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  mocks.requireAdmin.mockReset().mockResolvedValue({ email: "admin@example.invalid" });
  query = {};
  for (const method of ["select", "gte", "lt", "lte", "in", "order"]) query[method] = vi.fn(() => query);
  query.range = vi.fn().mockResolvedValue({ data: [], error: null });
  mocks.getSupabaseAdmin.mockReset().mockReturnValue({ from: vi.fn(() => query) });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const get = (params = "mode=month&period=2026-09") => handler.fetch(new Request(`https://example.invalid/api/admin/history?${params}`));
describe("admin history API", () => {
  it("dispatches the rewritten route to history rather than the upcoming bookings list", async () => {
    const response = await handler.fetch(new Request("https://example.invalid/api/admin/bookings?report=history&mode=month&period=2026-09"));
    expect(response.status).toBe(200);
    expect((await response.json()).current.visits).toBe(0);
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(query.range).toHaveBeenCalledWith(0, 499);
  });
  it("keeps the rewritten endpoint read-only", async () => {
    const response = await handler.fetch(new Request("https://example.invalid/api/admin/bookings?report=history", { method: "POST" }));
    expect(response.status).toBe(405);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
  it("requires admin authentication before accessing history", async () => {
    mocks.requireAdmin.mockRejectedValue(new RequestError("UNAUTHORIZED", 401));
    expect((await get()).status).toBe(401);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
  it("is read-only and refuses mutations", async () => {
    expect((await handler.fetch(new Request("https://example.invalid/api/admin/history", { method: "POST" }))).status).toBe(405);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
  it("validates periods and never returns cacheable customer information", async () => {
    expect((await get("mode=month&period=2026-13")).status).toBe(400);
    const response = await get();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(query.select.mock.calls[0][0]).not.toMatch(/customer_email|customer_phone|address|token|notes/);
    expect(query.gte).toHaveBeenCalledWith("starts_at", "2026-07-31T14:30:00.000Z");
    expect(query.lt).toHaveBeenCalledWith("starts_at", "2026-09-30T14:30:00.000Z");
    expect(query.lte).toHaveBeenCalledWith("ends_at", "2026-10-05T12:00:00.000Z");
  });
  it("paginates beyond the database default limit", async () => {
    const row = { id: "one", reference: "MC-TEST", service_name: "Sofa", starts_at: "2026-09-01T01:00:00Z", ends_at: "2026-09-01T02:00:00Z", status: "confirmed", price_cents: 11000, customer_first_name: "Test", customer_last_name: "Customer", booking_services: [] };
    query.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ ...row, id: String(i) })), error: null })
      .mockResolvedValueOnce({ data: [{ ...row, id: "last" }], error: null });
    const response = await get();
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect((await response.json()).current.visits).toBe(501);
  });
  it("fails visibly instead of returning misleading partial totals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    query.range.mockResolvedValue({ data: null, error: new Error("Database unavailable") });
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
  });
  it("rejects oversized reports instead of silently truncating financial totals", async () => {
    query.range.mockResolvedValue({ data: Array.from({ length: 500 }, () => ({})), error: null });
    const response = await get("mode=year&period=2025");
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "HISTORY_TOO_LARGE" });
    expect(query.range).toHaveBeenCalledTimes(40);
  });
});
