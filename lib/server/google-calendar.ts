import { getEnv } from "./env.js";

export interface BookingEventInput {
  reference: string;
  startsAt: string;
  endsAt: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  address: {
    line1: string;
    line2?: string | null;
    suburb: string;
    state: string;
    postcode: string;
  };
  notes?: string | null;
  serviceNames: string[];
}

function isConfigured(): boolean {
  const env = getEnv();
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);
}

async function getAccessToken(): Promise<string> {
  const env = getEnv();
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) throw new Error(`Google token refresh failed: ${resp.status}`);
  const json = (await resp.json()) as { access_token: string };
  return json.access_token;
}

function calendarId(): string {
  return getEnv().GOOGLE_CALENDAR_ID ?? "primary";
}

export async function createBookingEvent(input: BookingEventInput): Promise<string | null> {
  if (!isConfigured()) return null;

  const token = await getAccessToken();

  const addressParts = [input.address.line1, input.address.line2, input.address.suburb, `${input.address.state} ${input.address.postcode}`, "Australia"].filter(Boolean);

  const description = [
    `Services : ${input.serviceNames.join(", ")}`,
    `Client : ${input.customer.firstName} ${input.customer.lastName}`,
    `Téléphone : ${input.customer.phone}`,
    `Email : ${input.customer.email}`,
    `Adresse : ${addressParts.join(", ")}`,
    input.notes ? `Notes : ${input.notes}` : null,
    `Référence : ${input.reference}`,
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    summary: `${input.reference} — ${input.serviceNames.join(" + ")}`,
    location: [input.address.line1, input.address.suburb, `${input.address.state} ${input.address.postcode}`].join(", "),
    description,
    start: { dateTime: input.startsAt },
    end: { dateTime: input.endsAt },
    reminders: { useDefault: true },
  };

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`Google Calendar event creation failed: ${resp.status}`);
  const event = (await resp.json()) as { id: string };
  return event.id;
}

export async function deleteBookingEvent(eventId: string): Promise<void> {
  if (!isConfigured()) return;

  const token = await getAccessToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  // 404 = event already deleted, treat as success
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Google Calendar event deletion failed: ${resp.status}`);
  }
}
