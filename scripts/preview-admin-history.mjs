// Local visual QA only. Synthetic records, no credentials, no database and no writes.
// This script is not copied into dist and is never used by production API routes.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { buildHistoryReport, historyDateKey, historyPeriod } from "../lib/server/admin-history.ts";

const root = resolve("dist");
const now = new Date();
const currentYear = Number(historyDateKey(now).slice(0, 4));
const rows = [];
for (let year = currentYear - 1; year <= currentYear; year++) {
  for (let month = 1; month <= 12; month++) {
    for (let i = 0; i < 5 + month % 4; i++) {
      const id = `${year}-${month}-${i}`;
      const day = 2 + i * 3;
      const starts = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T01:00:00Z`;
      const quantity = i % 3 ? 1 : 2;
      const unit = (i % 2 ? 14000 : 8900) + (year === currentYear ? 2000 : 0);
      const name = i % 2 ? "Sofa + optional Steam cleaning" : "Carpet room";
      rows.push({
        id, reference: `DEMO-${id}`, service_name: `${quantity} × ${name}`, starts_at: starts,
        ends_at: new Date(Date.parse(starts) + 90 * 60_000).toISOString(), status: i === 5 ? "cancelled" : "confirmed",
        price_cents: i === 6 ? null : quantity * unit, customer_first_name: "Demo customer", customer_last_name: String(i + 1),
        booking_services: [{ service_id: i % 2 ? "sofa" : "carpet", service_name: name, quantity, price_cents: unit }],
      });
    }
  }
}
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const send = (status, data) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(data)); };
  if (request.method !== "GET") return send(405, { error: "DEMO_IS_READ_ONLY" });
  const url = new URL(request.url, "http://127.0.0.1:4174");
  try {
    if (url.pathname === "/api/admin/auth/session") return send(200, { demo: true });
    if (url.pathname === "/api/admin/availability") return send(200, { weekly: [], exceptions: [] });
    if (url.pathname === "/api/admin/bookings") return send(200, { bookings: [], refreshedAt: now.toISOString() });
    if (url.pathname === "/api/admin/customers") return send(200, { customers: [] });
    if (url.pathname === "/api/admin/history") return send(200, buildHistoryReport(rows, historyPeriod(url.searchParams.get("mode") ?? "month", url.searchParams.get("period") ?? historyDateKey(now).slice(0, 7), now)));
    if (url.pathname.startsWith("/api/")) return send(404, { error: "NOT_AVAILABLE_IN_DEMO" });
    let file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (file !== root && !file.startsWith(root + sep)) return send(403, { error: "FORBIDDEN" });
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    let content = await readFile(file);
    if (extname(file) === ".html") content = Buffer.from(content.toString().replace("Private workspace", "DEMO — fictitious data only"));
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" }); response.end(content);
  } catch { send(404, { error: "NOT_FOUND" }); }
}).listen(4174, "127.0.0.1", () => console.log("Read-only DEMO: http://127.0.0.1:4174/admin#history (synthetic data only)"));
