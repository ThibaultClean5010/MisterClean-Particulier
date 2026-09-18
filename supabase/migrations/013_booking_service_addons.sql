-- Optional, per-unit extras. Existing booking snapshots and base prices are unchanged.
-- Starting prices chosen per service after the owner's 2026-09-14 request
-- for market-informed rates. See README for comparisons and limitations.
-- Sofa steam supplements revised by the owner on 2026-09-18: $30 / $40 / $50.
create table public.service_addons (
  service_id uuid not null references public.services(id),
  code text not null check (code in ('steam-cleaning', 'hair-fur-removal')),
  name text not null,
  description text not null,
  price_cents integer not null check (price_cents between 1 and 100000),
  duration_minutes integer not null check (duration_minutes between 0 and 120),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  primary key (service_id, code)
);
alter table public.service_addons enable row level security;
revoke all on public.service_addons from public, anon, authenticated;
grant all on public.service_addons to service_role;

alter table public.booking_services
  add column addons jsonb not null default '[]'::jsonb check (jsonb_typeof(addons) = 'array');

insert into public.service_addons (service_id, code, name, description, price_cents, duration_minutes, sort_order)
select s.id, a.code, a.name, a.description,
  case when a.code = 'steam-cleaning' then p.steam_cents else p.fur_cents end,
  case when a.code = 'steam-cleaning' then p.steam_minutes else p.fur_minutes end,
  a.sort_order
from (values
  ('sofa-up-to-3-seats', 3000, 2500, 15, 20),
  ('sofa-4-seats',       4000, 3000, 20, 25),
  ('sofa-5-seats-plus',  5000, 4000, 25, 30),
  ('dining-chair',       1000, 1000, 10, 10),
  ('arm-chair',          1500, 1500, 10, 15),
  ('rug',                1500, 1500, 10, 15),
  ('carpet-room',        2000, 2000, 10, 15),
  ('carpet-lounge',      3000, 3000, 15, 20),
  ('mattress-single',    1500, 1000, 10, 10),
  ('mattress-queen',     2000, 1500, 15, 15),
  ('mattress-king',      2500, 2000, 15, 15)
) as p(slug, steam_cents, fur_cents, steam_minutes, fur_minutes)
join public.services s on s.slug = p.slug
cross join (values
  ('steam-cleaning', 'Steam cleaning', 'Additional steam treatment for suitable fabrics. Suitability is checked before cleaning; no extra is charged if unsuitable.', 10),
  ('hair-fur-removal', 'Hair and fur removal', 'Extra brushing and vacuuming for embedded hair and pet fur. Does not include urine or odour treatment.', 20)
) as a(code, name, description, sort_order);

create or replace function public.booking_money(p_cents integer)
returns text language sql immutable strict
set search_path = public, pg_temp
as $$
  select case when p_cents % 100 = 0 then '$' || (p_cents / 100)::text
    else '$' || to_char(p_cents / 100.0, 'FM999999990.00') end;
$$;

-- One authoritative resolver for availability, booking totals and stored line items.
-- Client-supplied amounts/descriptions are never used.
create or replace function public.resolve_booking_selection(p_services jsonb)
returns table (
  service_id uuid, sort_order integer, service_name text, quantity integer,
  duration_minutes integer, buffer_after_minutes integer,
  price_cents integer, price_label text, addons jsonb
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_requested record;
  v_service public.services%rowtype;
  v_addons jsonb;
  v_extra_cents integer;
  v_extra_minutes integer;
  v_addon_label text;
  v_codes jsonb;
begin
  if jsonb_typeof(p_services) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'SERVICE_NOT_AVAILABLE';
  end if;
  if jsonb_array_length(p_services) not between 1 and 12 then
    raise exception using errcode = '22023', message = 'SERVICE_NOT_AVAILABLE';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_services) r(service_id uuid, quantity integer)
    where r.service_id is null or r.quantity is null or r.quantity not between 1 and 10
  ) or (
    select count(*) <> count(distinct r.service_id)
    from jsonb_to_recordset(p_services) r(service_id uuid, quantity integer)
  ) then
    raise exception using errcode = '22023', message = 'INVALID_SERVICE_QUANTITY';
  end if;
  if (select sum(r.quantity) from jsonb_to_recordset(p_services) r(quantity integer)) > 12 then
    raise exception using errcode = '22023', message = 'TOO_MANY_SERVICE_ITEMS';
  end if;

  for v_requested in select * from jsonb_to_recordset(p_services) r(service_id uuid, quantity integer, addons jsonb)
  loop
    select * into v_service from public.services s
    where s.id = v_requested.service_id and s.is_active and not s.requires_quote;
    if not found then
      raise exception using errcode = '22023', message = 'SERVICE_NOT_AVAILABLE';
    end if;
    v_codes := coalesce(v_requested.addons, '[]'::jsonb);
    if jsonb_typeof(v_codes) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'INVALID_SERVICE_ADDON';
    end if;
    if jsonb_array_length(v_codes) > 2 or exists (
      select 1 from jsonb_array_elements(v_codes) a where jsonb_typeof(a) <> 'string'
    ) or (
      select count(*) <> count(distinct a) from jsonb_array_elements_text(v_codes) a
    ) then
      raise exception using errcode = '22023', message = 'INVALID_SERVICE_ADDON';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'code', a.code, 'name', a.name, 'price_cents', a.price_cents, 'duration_minutes', a.duration_minutes
    ) order by a.sort_order, a.code), '[]'::jsonb),
      coalesce(sum(a.price_cents), 0)::integer, coalesce(sum(a.duration_minutes), 0)::integer,
      string_agg(a.name || ' +' || public.booking_money(a.price_cents) || ' per item', '; ' order by a.sort_order, a.code)
    into v_addons, v_extra_cents, v_extra_minutes, v_addon_label
    from public.service_addons a
    where a.service_id = v_service.id and a.is_active and v_codes ? a.code;
    if jsonb_array_length(v_addons) <> jsonb_array_length(v_codes) then
      raise exception using errcode = '22023', message = 'SERVICE_ADDON_NOT_AVAILABLE';
    end if;
    service_id := v_service.id;
    sort_order := v_service.sort_order;
    service_name := v_service.name || case when v_addon_label is null then '' else ' (' || v_addon_label || ')' end;
    quantity := v_requested.quantity;
    duration_minutes := v_service.duration_minutes + v_extra_minutes;
    buffer_after_minutes := v_service.buffer_after_minutes;
    price_cents := v_service.price_cents + v_extra_cents;
    price_label := public.booking_money(price_cents);
    addons := v_addons;
    return next;
  end loop;
end;
$$;

create or replace function public.get_booking_availability_quantities(p_services jsonb, p_local_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_duration_minutes integer;
  v_buffer_minutes integer;
  v_settings public.business_settings%rowtype;
begin
  select sum(s.duration_minutes * s.quantity)::integer, max(s.buffer_after_minutes)
  into v_duration_minutes, v_buffer_minutes from public.resolve_booking_selection(p_services) s;
  select * into v_settings from public.business_settings where singleton;
  if p_local_date < (now() at time zone v_settings.timezone)::date
     or p_local_date > (now() at time zone v_settings.timezone)::date + v_settings.maximum_advance_booking_days then
    return;
  end if;
  return query
  with windows as (
    select (p_local_date + e.opens_at) at time zone v_settings.timezone as window_start,
      (p_local_date + e.closes_at) at time zone v_settings.timezone as window_end
    from public.availability_exceptions e where e.local_date = p_local_date and not e.is_closed
    union all
    select (p_local_date + h.opens_at) at time zone v_settings.timezone,
      (p_local_date + h.closes_at) at time zone v_settings.timezone
    from public.opening_hours h
    where h.is_active and h.weekday = extract(dow from p_local_date)::smallint
      and not exists (select 1 from public.availability_exceptions e where e.local_date = p_local_date)
  ), candidates as (
    select candidate as candidate_start from windows w
    cross join lateral generate_series(w.window_start,
      w.window_end - make_interval(mins => v_duration_minutes),
      make_interval(mins => v_settings.slot_interval_minutes)) candidate
  )
  select c.candidate_start, c.candidate_start + make_interval(mins => v_duration_minutes)
  from candidates c
  where c.candidate_start >= now() + make_interval(mins => v_settings.minimum_booking_notice_minutes)
    and not exists (
      select 1 from public.schedule_blocks b
      where b.active and b.occupied_period && tstzrange(c.candidate_start,
        c.candidate_start + make_interval(mins => v_duration_minutes + v_buffer_minutes), '[)')
    )
  order by c.candidate_start;
end;
$$;

create or replace function public.create_booking_quantities(
  p_services jsonb, p_starts_at timestamptz,
  p_customer_first_name text, p_customer_last_name text, p_customer_email text, p_customer_phone text,
  p_address_line1 text, p_address_line2 text, p_suburb text, p_state text, p_postcode text,
  p_notes text, p_cancellation_token text, p_idempotency_key uuid, p_business_email text
)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_lines jsonb;
  v_duration_minutes integer;
  v_buffer_minutes integer;
  v_price_cents integer;
  v_price_label text;
  v_service_name text;
  v_service_names text[];
  v_primary_service_id uuid;
  v_settings public.business_settings%rowtype;
  v_block_id uuid;
  v_booking_id uuid;
  v_reference text;
  v_ends_at timestamptz;
  v_existing public.bookings%rowtype;
  v_local_date date;
begin
  select * into v_existing from public.bookings where idempotency_key = p_idempotency_key;
  if found then
    select coalesce(array_agg(
      case when bs.quantity > 1 then bs.quantity::text || ' × ' || bs.service_name else bs.service_name end
      order by bs.position), array[v_existing.service_name]) into v_service_names
    from public.booking_services bs where bs.booking_id = v_existing.id;
    return jsonb_build_object('id', v_existing.id, 'reference', v_existing.reference,
      'starts_at', v_existing.starts_at, 'ends_at', v_existing.ends_at, 'status', v_existing.status,
      'service_names', v_service_names, 'price_cents', v_existing.price_cents, 'price_label', v_existing.price_label);
  end if;

  -- Validate first; hold catalogue rows while resolving and storing the booking.
  perform 1 from public.resolve_booking_selection(p_services);
  perform s.id from public.services s
    join jsonb_to_recordset(p_services) r(service_id uuid) on r.service_id = s.id
    order by s.id for share of s;
  perform a.service_id from public.service_addons a
    join jsonb_to_recordset(p_services) r(service_id uuid) on r.service_id = a.service_id
    order by a.service_id, a.code for share of a;
  select jsonb_agg(to_jsonb(s) order by s.sort_order, s.service_name) into v_lines
  from public.resolve_booking_selection(p_services) s;

  select sum(s.duration_minutes * s.quantity)::integer, max(s.buffer_after_minutes),
    case when count(s.price_cents) = count(*) then sum(s.price_cents * s.quantity)::integer end,
    string_agg(case when s.quantity > 1 then s.quantity::text || ' × ' || s.service_name else s.service_name end,
      ', ' order by s.sort_order, s.service_name),
    array_agg(case when s.quantity > 1 then s.quantity::text || ' × ' || s.service_name else s.service_name end
      order by s.sort_order, s.service_name),
    (array_agg(s.service_id order by s.sort_order, s.service_name))[1]
  into v_duration_minutes, v_buffer_minutes, v_price_cents, v_service_name, v_service_names, v_primary_service_id
  from jsonb_to_recordset(v_lines) s(service_id uuid, sort_order integer, service_name text,
    quantity integer, duration_minutes integer, buffer_after_minutes integer, price_cents integer);
  v_price_label := public.booking_money(v_price_cents);

  select * into v_settings from public.business_settings where singleton for share;
  v_local_date := (p_starts_at at time zone v_settings.timezone)::date;
  if not exists (
    select 1 from public.get_booking_availability_quantities(p_services, v_local_date) a where a.starts_at = p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'SLOT_NOT_AVAILABLE';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration_minutes);
  insert into public.schedule_blocks (kind, service_starts_at, service_ends_at, occupied_starts_at, occupied_ends_at)
  values ('booking', p_starts_at, v_ends_at, p_starts_at, v_ends_at + make_interval(mins => v_buffer_minutes))
  returning id into v_block_id;
  v_booking_id := gen_random_uuid();
  v_reference := 'MC-' || upper(substr(replace(v_booking_id::text, '-', ''), 1, 8));
  insert into public.bookings (
    id, reference, schedule_block_id, service_id, service_name, duration_minutes, buffer_after_minutes, price_cents, price_label,
    starts_at, ends_at, customer_first_name, customer_last_name, customer_email, customer_phone, address_line1, address_line2,
    suburb, state, postcode, notes, cancellation_token_hash, idempotency_key
  ) values (
    v_booking_id, v_reference, v_block_id, v_primary_service_id, v_service_name, v_duration_minutes, v_buffer_minutes, v_price_cents, v_price_label,
    p_starts_at, v_ends_at, trim(p_customer_first_name), trim(p_customer_last_name), lower(trim(p_customer_email)),
    trim(p_customer_phone), trim(p_address_line1), nullif(trim(p_address_line2), ''), trim(p_suburb), upper(trim(p_state)),
    trim(p_postcode), nullif(trim(p_notes), ''), encode(digest(p_cancellation_token, 'sha256'), 'hex'), p_idempotency_key
  );
  insert into public.booking_services (
    booking_id, service_id, position, service_name, quantity, duration_minutes, price_cents, price_label, addons
  )
  select v_booking_id, s.service_id, (row_number() over (order by s.sort_order, s.service_name))::smallint,
    s.service_name, s.quantity, s.duration_minutes, s.price_cents, s.price_label, s.addons
  from jsonb_to_recordset(v_lines) s(service_id uuid, sort_order integer, service_name text, quantity integer,
    duration_minutes integer, price_cents integer, price_label text, addons jsonb);
  insert into public.email_outbox (booking_id, template, recipient, payload)
  values (v_booking_id, 'booking_customer_confirmation', lower(trim(p_customer_email)),
      jsonb_build_object('cancellation_token', p_cancellation_token)),
    (v_booking_id, 'booking_business_notification', lower(trim(p_business_email)), '{}'::jsonb);
  return jsonb_build_object('id', v_booking_id, 'reference', v_reference, 'starts_at', p_starts_at, 'ends_at', v_ends_at,
    'status', 'confirmed', 'service_names', v_service_names, 'price_cents', v_price_cents, 'price_label', v_price_label);
exception when exclusion_violation then
  raise exception using errcode = '23P01', message = 'SLOT_NOT_AVAILABLE';
end;
$$;

revoke all on function public.booking_money(integer) from public, anon, authenticated;
revoke all on function public.resolve_booking_selection(jsonb) from public, anon, authenticated;
revoke all on function public.get_booking_availability_quantities(jsonb, date) from public, anon, authenticated;
revoke all on function public.create_booking_quantities(jsonb, timestamptz, text, text, text, text, text, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.booking_money(integer) to service_role;
grant execute on function public.resolve_booking_selection(jsonb) to service_role;
grant execute on function public.get_booking_availability_quantities(jsonb, date) to service_role;
grant execute on function public.create_booking_quantities(jsonb, timestamptz, text, text, text, text, text, text, text, text, text, text, text, uuid, text) to service_role;
