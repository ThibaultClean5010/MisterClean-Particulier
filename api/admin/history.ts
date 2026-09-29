import { requireAdmin } from "../../lib/server/admin-auth.js";
import { buildHistoryReport, historyDateKey, historyPeriod, type HistoryBooking } from "../../lib/server/admin-history.js";
import { errorResponse, json, methodNotAllowed, RequestError } from "../../lib/server/http.js";
import { getSupabaseAdmin } from "../../lib/server/supabase.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      await requireAdmin(request);
      const params = new URL(request.url).searchParams;
      const now = new Date();
      const mode = params.get("mode") ?? "month";
      let period;
      try {
        period = historyPeriod(mode, params.get("period") ?? historyDateKey(now).slice(0, mode === "year" ? 4 : 7), now);
      } catch { throw new RequestError("INVALID_HISTORY_PERIOD", 400); }
      const rows: HistoryBooking[] = [];
      const pageSize = 500;
      const supabase = getSupabaseAdmin();
      // Read every page, not just PostgREST's default first 1,000 rows.
      for (let offset = 0; ; offset += pageSize) {
        if (offset >= 20_000) throw new RequestError("HISTORY_TOO_LARGE", 422);
        const { data, error } = await supabase.from("bookings")
          .select("id,reference,service_name,starts_at,ends_at,status,price_cents,customer_first_name,customer_last_name,booking_services(service_id,service_name,quantity,price_cents)")
          .gte("starts_at", period.queryStart).lt("starts_at", period.queryEnd).lte("ends_at", period.asOf)
          .in("status", ["confirmed", "cancelled"])
          .order("starts_at").order("id").range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data ?? []) as HistoryBooking[]);
        if (!data || data.length < pageSize) break;
      }
      return json(buildHistoryReport(rows, period));
    } catch (error) { return errorResponse(error); }
  },
};
