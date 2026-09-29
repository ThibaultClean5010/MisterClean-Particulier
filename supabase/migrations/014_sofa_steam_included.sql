-- Owner request, 2026-09-28: include Steam in the three sofa packages.
-- Apply after 013. Absolute values make this data change safe to replay.
-- Historical bookings, line-item snapshots and schedule blocks are untouched.
begin;

update public.services s
set price_cents = p.price_cents,
    price_label = public.booking_money(p.price_cents),
    duration_minutes = p.duration_minutes,
    description = 'Steam cleaning included for suitable fabrics. Fabric suitability is checked before cleaning. Hair and fur removal is an optional extra.'
from (values
  ('sofa-up-to-3-seats', 14000, 90),
  ('sofa-4-seats',       17500, 100),
  ('sofa-5-seats-plus',  22000, 145)
) as p(slug, price_cents, duration_minutes)
where s.slug = p.slug;

-- Retain the old catalogue rows for reference, but never offer or charge
-- Steam again on sofas. Other services and Hair and fur removal are unchanged.
update public.service_addons a
set is_active = false
from public.services s
where a.service_id = s.id
  and a.code = 'steam-cleaning'
  and s.slug in ('sofa-up-to-3-seats', 'sofa-4-seats', 'sofa-5-seats-plus');

commit;
