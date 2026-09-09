-- Table for cleaner-facing internal notes, keyed by normalised email.
-- Booking stats are derived from the existing bookings table at query time.
create table public.customers (
  email text primary key check (email = lower(email)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;

-- Customer list with aggregated booking stats. Accepts an optional search term.
create or replace function search_customers(q text default null)
returns table (
  email        text,
  first_name   text,
  last_name    text,
  phone        text,
  total_bookings      bigint,
  confirmed_bookings  bigint,
  last_service_at     timestamptz,
  last_service_name   text,
  next_booking_at     timestamptz,
  notes               text
)
language sql stable security definer
as $$
  with latest as (
    -- Most recent booking per email determines the displayed name / phone.
    select distinct on (lower(customer_email))
      lower(customer_email) as email,
      customer_first_name   as first_name,
      customer_last_name    as last_name,
      customer_phone        as phone
    from bookings
    order by lower(customer_email), created_at desc
  ),
  stats as (
    select
      lower(customer_email) as email,
      count(*)                                                                        as total_bookings,
      count(*) filter (where status = 'confirmed')                                   as confirmed_bookings,
      max(starts_at) filter (where status = 'confirmed' and starts_at < now())       as last_service_at,
      (array_agg(service_name order by starts_at desc)
         filter (where status = 'confirmed' and starts_at < now()))[1]               as last_service_name,
      min(starts_at) filter (where status = 'confirmed' and starts_at > now())       as next_booking_at
    from bookings
    group by lower(customer_email)
  )
  select
    l.email,
    l.first_name,
    l.last_name,
    l.phone,
    s.total_bookings,
    s.confirmed_bookings,
    s.last_service_at,
    s.last_service_name,
    s.next_booking_at,
    c.notes
  from latest l
  join stats s on s.email = l.email
  left join customers c on c.email = l.email
  where q is null
     or q = ''
     or l.first_name ilike '%' || q || '%'
     or l.last_name ilike '%' || q || '%'
     or (l.first_name || ' ' || l.last_name) ilike '%' || q || '%'
     or l.email ilike '%' || q || '%'
     or l.phone ilike '%' || q || '%'
  order by s.next_booking_at nulls last, s.last_service_at desc nulls last
  limit 100;
$$;

-- Booking history for a single customer (ordered most recent first).
create or replace function get_customer_bookings(customer_email_param text)
returns table (
  id               uuid,
  reference        text,
  service_name     text,
  duration_minutes integer,
  starts_at        timestamptz,
  ends_at          timestamptz,
  address_line1    text,
  address_line2    text,
  suburb           text,
  state            text,
  postcode         text,
  notes            text,
  status           text,
  price_cents      integer,
  price_label      text
)
language sql stable security definer
as $$
  select
    id, reference, service_name, duration_minutes,
    starts_at, ends_at,
    address_line1, address_line2, suburb, state, postcode,
    notes, status, price_cents, price_label
  from bookings
  where lower(customer_email) = lower(customer_email_param)
  order by starts_at desc
  limit 50;
$$;
