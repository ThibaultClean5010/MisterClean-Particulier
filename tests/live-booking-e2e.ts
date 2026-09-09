import { randomBytes } from "node:crypto";
import cancelHandler from "../api/booking/cancel.ts";
import { dispatchPendingEmails } from "../lib/server/email-outbox.ts";
import { getEnv } from "../lib/server/env.ts";
import { getSupabaseAdmin } from "../lib/server/supabase.ts";

if (process.env.LIVE_E2E !== "1") {
  throw new Error("Set LIVE_E2E=1 to run this script against the linked production services.");
}

const testDate = "2026-09-14";
const testStart = "2026-09-14T07:00:00+09:30";
const supabase = getSupabaseAdmin();
const env = getEnv();

const { data: service, error: serviceError } = await supabase
  .from("services")
  .select("id, name")
  .eq("slug", "sofa-up-to-3-seats")
  .single();
if (serviceError) throw serviceError;

const { data: beforeSlots, error: beforeError } = await supabase.rpc("get_booking_availability_multi", {
  p_service_ids: [service.id],
  p_local_date: testDate,
});
if (beforeError) throw beforeError;
if (!beforeSlots.some((slot: { starts_at: string }) => new Date(slot.starts_at).getTime() === new Date(testStart).getTime())) {
  throw new Error("The selected live test slot is not available.");
}

const cancellationToken = randomBytes(32).toString("base64url");
const { data: booking, error: createError } = await supabase.rpc("create_booking_multi", {
  p_service_ids: [service.id],
  p_starts_at: testStart,
  p_customer_first_name: "MisterClean",
  p_customer_last_name: "E2E Test",
  p_customer_email: env.BUSINESS_EMAIL,
  p_customer_phone: "0474597325",
  p_address_line1: "1 King William Street",
  p_address_line2: "Automated test — cancelled immediately",
  p_suburb: "Adelaide",
  p_state: "SA",
  p_postcode: "5000",
  p_notes: "Automated end-to-end booking test. No service required.",
  p_cancellation_token: cancellationToken,
  p_idempotency_key: crypto.randomUUID(),
  p_business_email: env.BUSINESS_EMAIL,
});
if (createError) throw createError;
await dispatchPendingEmails(booking.id);
const { data: confirmationJob, error: outboxError } = await supabase
  .from("email_outbox")
  .select("provider_message_id, status")
  .eq("booking_id", booking.id)
  .eq("template", "booking_customer_confirmation")
  .single();
if (outboxError) throw outboxError;
if (confirmationJob.status !== "sent" || !confirmationJob.provider_message_id) {
  throw new Error("The customer confirmation email was not sent.");
}

const cancelResponse = await cancelHandler.fetch(new Request("http://localhost/api/booking/cancel", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: cancellationToken }),
}));
const cancelBody = await cancelResponse.json();
if (!cancelResponse.ok) throw new Error(`Cancellation failed: ${JSON.stringify(cancelBody)}`);

const [{ data: cancelledBooking, error: bookingError }, { data: afterSlots, error: afterError }] = await Promise.all([
  supabase.from("bookings").select("status, schedule_block_id").eq("id", booking.id).single(),
  supabase.rpc("get_booking_availability_multi", { p_service_ids: [service.id], p_local_date: testDate }),
]);
if (bookingError) throw bookingError;
if (afterError) throw afterError;
const slotRestored = afterSlots.some((slot: { starts_at: string }) => new Date(slot.starts_at).getTime() === new Date(testStart).getTime());

console.log(JSON.stringify({
  reference: booking.reference,
  creationStatus: "confirmed",
  confirmationEmail: confirmationJob.status,
  cancellationStatus: cancelledBooking.status,
  slotRestored,
}, null, 2));

if (cancelledBooking.status !== "cancelled" || !slotRestored) process.exit(1);
