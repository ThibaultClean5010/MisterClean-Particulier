-- Stores the Google Calendar event ID so the event can be deleted on cancellation.
-- Nullable: populated asynchronously after booking creation (best-effort).
alter table public.bookings add column if not exists google_calendar_event_id text;
