import { randomBytes } from "node:crypto";
import { dispatchPendingEmails } from "./email-outbox.js";
import { getEnv } from "./env.js";
import { createBookingEvent } from "./google-calendar.js";
import { RequestError } from "./http.js";
import { getSupabaseAdmin } from "./supabase.js";
import type { BookingInput } from "./validation.js";

export async function createBooking(body: BookingInput) {
  const cancellationToken = randomBytes(32).toString("base64url");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("create_booking_quantities", {
    p_services: body.services.map(({ serviceId, quantity }) => ({ service_id: serviceId, quantity })),
    p_starts_at: body.startsAt,
    p_customer_first_name: body.customer.firstName,
    p_customer_last_name: body.customer.lastName,
    p_customer_email: body.customer.email,
    p_customer_phone: body.customer.phone,
    p_address_line1: body.address.line1,
    p_address_line2: body.address.line2,
    p_suburb: body.address.suburb,
    p_state: body.address.state,
    p_postcode: body.address.postcode,
    p_notes: body.notes,
    p_cancellation_token: cancellationToken,
    p_idempotency_key: body.idempotencyKey,
    p_business_email: getEnv().BUSINESS_EMAIL,
  });

  if (error?.code === "23P01" || error?.message.includes("SLOT_NOT_AVAILABLE")) {
    throw new RequestError("SLOT_NOT_AVAILABLE", 409);
  }
  if (error) throw error;

  const booking = data as { id: string; reference: string; starts_at: string; ends_at: string; service_names: string[] };
  await dispatchPendingEmails(booking.id);

  const gcalEventId = await createBookingEvent({
    reference: booking.reference,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    customer: body.customer,
    address: body.address,
    notes: body.notes,
    serviceNames: booking.service_names,
  }).catch((error: unknown) => {
    console.error("Google Calendar event creation failed:", error);
    return null;
  });
  if (gcalEventId) {
    await supabase.from("bookings").update({ google_calendar_event_id: gcalEventId }).eq("id", booking.id);
  }

  return booking;
}
