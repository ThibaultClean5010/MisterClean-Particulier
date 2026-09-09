import { Resend } from "resend";
import { getEnv } from "./env.js";
import { renderBookingEmail } from "./emails/booking-email.js";
import { getSupabaseAdmin } from "./supabase.js";

type OutboxRow = {
  id: string;
  template: string;
  recipient: string;
  payload: Record<string, unknown>;
  attempts: number;
  bookings: Record<string, unknown>;
};

export async function dispatchPendingEmails(bookingId?: string, limit = 10) {
  const env = getEnv();
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("email_outbox")
    .select("id, template, recipient, payload, attempts, bookings(*)")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at")
    .limit(limit);
  if (bookingId) query = query.eq("booking_id", bookingId);

  const { data, error } = await query;
  if (error) throw error;

  const resend = new Resend(env.RESEND_API_KEY);
  const results = [];
  for (const rawRow of data ?? []) {
    const row = rawRow as unknown as OutboxRow;
    await supabase.from("email_outbox").update({ status: "processing" }).eq("id", row.id);
    try {
      const content = renderBookingEmail(row.template, row.bookings, row.payload, env.PUBLIC_SITE_URL);
      const { data: sent, error: sendError } = await resend.emails.send(
        { from: env.RESEND_FROM, to: row.recipient, ...content },
        { idempotencyKey: `booking/${row.id}` },
      );
      if (sendError) throw sendError;
      await supabase.from("email_outbox").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: sent?.id,
        payload: {},
        last_error: null,
      }).eq("id", row.id);
      results.push({ id: row.id, status: "sent" });
    } catch (error) {
      const attempts = row.attempts + 1;
      const delayMinutes = Math.min(360, 2 ** attempts * 5);
      await supabase.from("email_outbox").update({
        status: "failed",
        attempts,
        last_error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown email error",
        next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, status: "failed" });
    }
  }
  return results;
}
