import { requireAdmin } from "../../lib/server/admin-auth.js";
import { createBooking } from "../../lib/server/create-booking.js";
import { errorResponse, json, methodNotAllowed, readJson } from "../../lib/server/http.js";
import { getSupabaseAdmin } from "../../lib/server/supabase.js";
import { bookingSchema, parseOrThrow } from "../../lib/server/validation.js";

export default {
  async fetch(request: Request) {
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
          "id", "reference", "service_name", "duration_minutes", "starts_at", "ends_at",
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
