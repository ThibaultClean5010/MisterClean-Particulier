import { z } from "zod";
import { requireAdmin } from "../../../lib/server/admin-auth.js";
import { dispatchPendingEmails } from "../../../lib/server/email-outbox.js";
import { getEnv } from "../../../lib/server/env.js";
import { deleteBookingEvent } from "../../../lib/server/google-calendar.js";
import { errorResponse, json, methodNotAllowed, readJson, RequestError } from "../../../lib/server/http.js";
import { getSupabaseAdmin } from "../../../lib/server/supabase.js";
import { parseOrThrow } from "../../../lib/server/validation.js";

const cancellationSchema = z.object({ bookingId: z.uuid() });

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      await requireAdmin(request);
      const body = parseOrThrow(cancellationSchema, await readJson(request));
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.rpc("cancel_booking_as_admin", {
        p_booking_id: body.bookingId,
        p_business_email: getEnv().BUSINESS_EMAIL,
      });

      if (error?.message.includes("BOOKING_NOT_FOUND")) {
        throw new RequestError("BOOKING_NOT_FOUND", 404);
      }
      if (error) throw error;

      await dispatchPendingEmails(body.bookingId);

      const cancelled = data as { reference: string; status: string };
      if (cancelled.status === "cancelled") {
        const { data: bookingRow } = await supabase
          .from("bookings")
          .select("google_calendar_event_id")
          .eq("id", body.bookingId)
          .single();
        if (bookingRow?.google_calendar_event_id) {
          await deleteBookingEvent(bookingRow.google_calendar_event_id).catch((calendarError: unknown) => {
            console.error("Google Calendar event deletion failed:", calendarError);
          });
        }
      }

      return json({ booking: cancelled });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
