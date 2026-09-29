import { requireAdmin } from "../../lib/server/admin-auth.js";
import history from "../../lib/server/admin-history-handler.js";
import { createBooking } from "../../lib/server/create-booking.js";
import { errorResponse, json, methodNotAllowed, readJson } from "../../lib/server/http.js";
import { getSupabaseAdmin } from "../../lib/server/supabase.js";
import { bookingSchema, parseOrThrow } from "../../lib/server/validation.js";

export default {
  async fetch(request: Request) {
    // Share one deployed function, keeping the history route read-only and private.
    const url = new URL(request.url);
    if (url.pathname === "/api/admin/history" || url.searchParams.get("report") === "history") {
      return history.fetch(request);
    }
    if (!["GET", "POST"].includes(request.method)) return methodNotAllowed(["GET", "POST"]);
    try {
      await requireAdmin(request);
      if (request.method === "POST") {
        const body = parseOrThrow(bookingSchema, await readJson(request));
        const booking = await createBooking(body);
        return json({ booking }, { status: 201 });
      }

      const now = new Date().toISOString();
      const { data, error } = await getSupabaseAdmin()
        .from("bookings")
        .select([
          "id", "reference", "service_name", "duration_minutes", "price_label", "starts_at", "ends_at",
          "customer_first_name", "customer_last_name", "customer_email", "customer_phone",
          "address_line1", "address_line2", "suburb", "state", "postcode", "notes",
        ].join(","))
        .eq("status", "confirmed")
        .gte("ends_at", now)
        .order("starts_at")
        .limit(100);
      if (error) throw error;
      return json({ bookings: data ?? [], refreshedAt: now });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
