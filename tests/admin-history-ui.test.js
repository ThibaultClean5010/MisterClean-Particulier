// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHistoryPanel } from "../admin/history.js";
import { buildHistoryReport, historyPeriod } from "../lib/server/admin-history.ts";
const find = selector => document.querySelector(selector);
const fixture = () => buildHistoryReport(Array.from({ length: 22 }, (_, i) => ({
  id: String(i), reference: `MC-${i}`, service_name: i === 0 ? "<img src=x onerror=alert(1)>" : "Sofa + Steam", starts_at: "2026-09-04T01:00:00Z", ends_at: "2026-09-04T03:00:00Z",
  status: i === 21 ? "cancelled" : "confirmed", price_cents: 14000, customer_first_name: "Example", customer_last_name: String(i),
  booking_services: [{ service_id: "sofa", service_name: "Sofa", quantity: 1, price_cents: 14000 }],
})), historyPeriod("month", "2026-09", new Date("2026-10-05T12:00:00Z")));
beforeEach(() => {
  window.happyDOM.settings.disableCSSFileLoading = true;
  window.happyDOM.settings.disableJavaScriptFileLoading = true;
  window.happyDOM.settings.disableJavaScriptEvaluation = true;
  document.documentElement.innerHTML = readFileSync("admin/index.html", "utf8").replace(/<link\b[^>]*>/gi, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
describe("history panel", () => {
  it("does not fetch before authenticated initialization", () => {
    const api = vi.fn(); createHistoryPanel(find("[data-history]"), api);
    expect(api).not.toHaveBeenCalled();
    expect(find("[data-history-results]").hidden).toBe(true);
  });
  it("renders charts, safe text, searchable history and pagination", async () => {
    const panel = createHistoryPanel(find("[data-history]"), vi.fn().mockResolvedValue(fixture()));
    await panel.load();
    expect(find("[data-history-metrics]").textContent).toContain("$2,940.00");
    expect(document.querySelectorAll(".history-bar-group")).toHaveLength(31);
    expect(document.querySelectorAll("[data-history-rows] tr")).toHaveLength(20);
    expect(find("[data-history-rows] img")).toBeNull();
    find("[data-history-next]").click();
    expect(find("[data-history-page]").textContent).toBe("21–22 of 22 appointments");
    find("[data-history-status-filter]").value = "cancelled";
    find("[data-history-status-filter]").dispatchEvent(new Event("change"));
    expect(find("[data-history-page]").textContent).toBe("1–1 of 1 appointments");
    expect(find("[data-history-rows]").textContent).toContain("Not counted");
    expect(find("[data-history-metrics]").textContent).toContain("$2,940.00");
    find("[data-history-search]").value = "no-match";
    find("[data-history-search]").dispatchEvent(new Event("input"));
    expect(find("[data-history-rows]").textContent).toContain("No past appointments");
  });
  it("hides stale figures on errors and edited periods", async () => {
    const api = vi.fn().mockResolvedValueOnce(fixture()).mockRejectedValueOnce(new Error("Offline"));
    const panel = createHistoryPanel(find("[data-history]"), api); await panel.load();
    find("[data-history-mode]").value = "year";
    find("[data-history-mode]").dispatchEvent(new Event("change"));
    expect(find("[data-history-results]").hidden).toBe(true);
    expect(find("[data-history-year]").disabled).toBe(false);
    await panel.load();
    expect(find("[data-history-status]").textContent).toContain("Could not load history");
    expect(api.mock.calls[1][0]).toContain("mode=year");
  });
  it("handles empty periods and expired sessions without showing fake totals", async () => {
    const empty = buildHistoryReport([], historyPeriod("month", "2026-09", new Date("2026-10-05T12:00:00Z")));
    const api = vi.fn().mockResolvedValueOnce(empty).mockRejectedValueOnce(Object.assign(new Error("UNAUTHORIZED"), { status: 401 }));
    const unauthorized = vi.fn(); const panel = createHistoryPanel(find("[data-history]"), api, unauthorized);
    await panel.load(); expect(find("[data-history-page]").textContent).toBe("0 appointments");
    await panel.load(); expect(unauthorized).toHaveBeenCalledOnce(); expect(find("[data-history-results]").hidden).toBe(true);
  });
  it("ignores older responses when the selected period changes", async () => {
    let resolveOld;
    const api = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(fixture());
    const panel = createHistoryPanel(find("[data-history]"), api);
    const old = panel.load(); const latest = panel.load(); await latest;
    const stale = fixture(); stale.period.label = "Stale report"; resolveOld(stale); await old;
    expect(find("[data-history-period]").textContent).not.toContain("Stale report");
  });
  it("warns about incomplete periods and omits misleading percentage changes", async () => {
    const data = fixture(); data.period.partial = true;
    const panel = createHistoryPanel(find("[data-history]"), vi.fn().mockResolvedValue(data));
    await panel.load();
    expect(find("[data-history-warning]").textContent).toContain("still in progress");
    expect(find("[data-history-metrics]").textContent).toContain("Previous full period");
    expect(find("[data-history-metrics]").textContent).not.toContain("%");
  });
});
