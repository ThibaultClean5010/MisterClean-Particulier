import { dispatchPendingEmails } from "../../lib/server/email-outbox.js";
import { getEnv } from "../../lib/server/env.js";
import { deleteBookingEvent } from "../../lib/server/google-calendar.js";
import { errorResponse, json, methodNotAllowed, readJson, RequestError } from "../../lib/server/http.js";
import { getSupabaseAdmin } from "../../lib/server/supabase.js";
import { cancellationSchema, parseOrThrow } from "../../lib/server/validation.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      const body = parseOrThrow(cancellationSchema, await readJson(request));
      const { data, error } = await getSupabaseAdmin().rpc("cancel_booking", {
        p_cancellation_token: body.token,
        p_business_email: getEnv().BUSINESS_EMAIL,
      });

      if (error?.message.includes("INVALID_CANCELLATION_TOKEN")) {
        throw new RequestError("INVALID_CANCELLATION_TOKEN", 404);
      }
      if (error?.message.includes("CANCELLATION_TOO_LATE")) {
        throw new RequestError("CANCELLATION_TOO_LATE", 409);
      }
      if (error) throw error;

      await dispatchPendingEmails();

      // Google Calendar — best-effort deletion
      const cancelled = data as { reference: string; status: string };
      if (cancelled.status === "cancelled") {
        const { data: bookingRow } = await getSupabaseAdmin()
          .from("bookings")
          .select("google_calendar_event_id")
          .eq("reference", cancelled.reference)
          .single();
        if (bookingRow?.google_calendar_event_id) {
          await deleteBookingEvent(bookingRow.google_calendar_event_id).catch((err: unknown) => {
            console.error("Google Calendar event deletion failed:", err);
          });
        }
      }

      return json({ booking: data });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
