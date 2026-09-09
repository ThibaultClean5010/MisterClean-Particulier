-- Support manually-added contacts (people who reached out directly, no booking yet).
alter table public.customers
  add column first_name text,
  add column last_name  text,
  add column phone      text;

-- Updated search function: returns both customers derived from bookings AND
-- manually-added contacts who have no booking yet.
create or replace function search_customers(q text default null)
returns table (
  email               text,
  first_name          text,
  last_name           text,
  phone               text,
  total_bookings      bigint,
  confirmed_bookings  bigint,
  last_service_at     timestamptz,
  last_service_name   text,
  next_booking_at     timestamptz,
  notes               text
)
language sql stable security definer
as $$
  with booking_emails as (
    select distinct lower(customer_email) as email from bookings
  ),
  latest as (
    -- Most recent booking per email supplies the displayed name / phone.
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
      lower(customer_email)                                                            as email,
      count(*)                                                                         as total_bookings,
      count(*) filter (where status = 'confirmed')                                    as confirmed_bookings,
      max(starts_at) filter (where status = 'confirmed' and starts_at < now())        as last_service_at,
      (array_agg(service_name order by starts_at desc)
         filter (where status = 'confirmed' and starts_at < now()))[1]                as last_service_name,
      min(starts_at) filter (where status = 'confirmed' and starts_at > now())        as next_booking_at
    from bookings
    group by lower(customer_email)
  ),
  from_bookings as (
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
    join  stats     s on s.email = l.email
    left join customers c on c.email = l.email
  ),
  from_manual as (
    -- Contacts added manually who have not booked online yet.
    select
      c.email,
      coalesce(c.first_name, '') as first_name,
      coalesce(c.last_name,  '') as last_name,
      coalesce(c.phone,      '') as phone,
      0::bigint                  as total_bookings,
      0::bigint                  as confirmed_bookings,
      null::timestamptz          as last_service_at,
      null::text                 as last_service_name,
      null::timestamptz          as next_booking_at,
      c.notes
    from customers c
    where not exists (select 1 from booking_emails be where be.email = c.email)
  ),
  all_customers as (
    select * from from_bookings
    union all
    select * from from_manual
  )
  select *
  from all_customers
  where q is null
     or q = ''
     or first_name ilike '%' || q || '%'
     or last_name  ilike '%' || q || '%'
     or (first_name || ' ' || last_name) ilike '%' || q || '%'
     or email ilike '%' || q || '%'
     or phone ilike '%' || q || '%'
  order by next_booking_at nulls last, last_service_at desc nulls last, email
  limit 100;
$$;
