insert into public.business_settings (
  singleton, timezone, slot_interval_minutes, minimum_booking_notice_minutes,
  maximum_advance_booking_days, cancellation_notice_minutes
) values (true, 'Australia/Adelaide', 30, 1440, 90, 1440)
on conflict (singleton) do update set
  timezone = excluded.timezone,
  slot_interval_minutes = excluded.slot_interval_minutes,
  minimum_booking_notice_minutes = excluded.minimum_booking_notice_minutes,
  maximum_advance_booking_days = excluded.maximum_advance_booking_days,
  cancellation_notice_minutes = excluded.cancellation_notice_minutes;

delete from public.opening_hours;

insert into public.opening_hours (weekday, opens_at, closes_at) values
  (0, '07:00', '12:00'),
  (1, '07:00', '19:30'),
  (2, '07:00', '13:30'),
  (3, '07:00', '12:00'),
  (4, '07:00', '12:00'),
  (5, '07:00', '12:00'),
  (6, '07:00', '12:00');

insert into public.services (
  slug, name, duration_minutes, buffer_after_minutes, price_cents, price_label, requires_quote, sort_order
) values
  ('sofa-up-to-3-seats', 'Sofa up to 3 seats', 75, 30, 11000, '$110', false, 10),
  ('sofa-4-seats', 'Sofa 4 seats', 80, 30, 13500, '$135', false, 20),
  ('sofa-5-seats-plus', 'Sofa 5 seats and plus', 120, 30, 17000, '$170', false, 30),
  ('dining-chair', 'Dining chair', 20, 30, 3000, '$30', false, 40),
  ('arm-chair', 'Arm chair', 40, 30, 6000, '$60', false, 50),
  ('rug', 'Rug', 45, 30, 5000, '$50', false, 60),
  ('staircase', 'Staircase', 60, 30, 6000, '$60', true, 70),
  ('carpet-room', 'Carpet room up to 15 m2', 60, 30, 8900, '$89', false, 80),
  ('carpet-lounge', 'Carpet lounge over 15 m2', 80, 30, 12000, '$120', false, 90),
  ('mattress-single', 'Single mattress', 60, 30, 9900, '$99', false, 100),
  ('mattress-queen', 'Queen mattress', 60, 30, 14000, '$140', false, 110),
  ('mattress-king', 'King mattress', 80, 30, 17000, '$170', false, 120)
on conflict (slug) do update set
  name = excluded.name,
  duration_minutes = excluded.duration_minutes,
  buffer_after_minutes = excluded.buffer_after_minutes,
  price_cents = excluded.price_cents,
  price_label = excluded.price_label,
  requires_quote = excluded.requires_quote,
  sort_order = excluded.sort_order;
