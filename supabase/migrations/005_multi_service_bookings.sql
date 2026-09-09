-- Allows one booking to contain several distinct services while keeping one
-- atomic schedule block for the full visit.
create table public.booking_services (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  service_id uuid not null references public.services(id),
  position smallint not null check (position > 0),
  service_name text not null,
  duration_minutes integer not null check (duration_minutes between 15 and 720),
  price_cents integer check (price_cents >= 0),
  price_label text,
  primary key (booking_id, service_id),
  unique (booking_id, position)
);

insert into public.booking_services (
  booking_id, service_id, position, service_name, duration_minutes, price_cents, price_label
)
select id, service_id, 1, service_name, duration_minutes, price_cents, price_label
from public.bookings;

alter table public.booking_services enable row level security;
revoke all on public.booking_services from anon, authenticated;

create or replace function public.get_booking_availability_multi(
  p_service_ids uuid[],
  p_local_date date
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_count integer;
  v_distinct_count integer;
  v_duration_minutes integer;
  v_buffer_minutes integer;
  v_settings public.business_settings%rowtype;
begin
  if p_service_ids is null or cardinality(p_service_ids) < 1 or cardinality(p_service_ids) > 12 then
    raise exception using errcode = '22023', message = 'SERVICE_NOT_AVAILABLE';
  end if;

  select count(distinct service_id) into v_distinct_count
  from unnest(p_service_ids) as requested(service_id);
  if v_distinct_count <> cardinality(p_service_ids) then
    raise exception using errcode = '22023', message = 'DUPLICATE_SERVICE';
  end if;

  select count(*), sum(s.duration_minutes)::integer, max(s.buffer_after_minutes)
  into v_service_count, v_duration_minutes, v_buffer_minutes
  from public.services s
  where s.id = any(p_service_ids) and s.is_active and not s.requires_quote;

  if v_service_count <> cardinality(p_service_ids) then
    raise exception using errcode = '22023', message = 'SERVICE_NOT_AVAILABLE';
  end if;

  select * into v_settings from public.business_settings where singleton;

  if p_local_date < (now() at time zone v_settings.timezone)::date
     or p_local_date > (now() at time zone v_settings.timezone)::date + v_settings.maximum_advance_booking_days then
    return;
  end if;

  return query
  with windows as (
    select
      (p_local_date + h.opens_at) at time zone v_settings.timezone as window_start,
      (p_local_date + h.closes_at) at time zone v_settings.timezone as window_end
    from public.opening_hours h
    where h.is_active and h.weekday = extract(dow from p_local_date)::smallint
  ), candidates as (
    select candidate as candidate_start
    from windows w
    cross join lateral generate_series(
      w.window_start,
      w.window_end - make_interval(mins => v_duration_minutes),
      make_interval(mins => v_settings.slot_interval_minutes)
    ) candidate
  )
  select
    c.candidate_start,
    c.candidate_start + make_interval(mins => v_duration_minutes)
  from candidates c
  where c.candidate_start >= now() + make_interval(mins => v_settings.minimum_booking_notice_minutes)
    and not exists (
      select 1
      from public.schedule_blocks b
      where b.active
        and b.occupied_period && tstzrange(
          c.candidate_start,
          c.candidate_start + make_interval(mins => v_duration_minutes + v_buffer_minutes),
          '[)'
        )
    )
  order by c.candidate_start;
end;
$$;

create or replace function public.create_booking_multi(
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_customer_first_name text,
  p_customer_last_name text,
  p_customer_email text,
  p_customer_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_suburb text,
  p_state text,
  p_postcode text,
  p_notes text,
  p_cancellation_token text,
  p_idempotency_key uuid,
  p_business_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_service_count integer;
  v_distinct_count integer;
  v_duration_minutes integer;
  v_buffer_minutes integer;
  v_price_cents integer;
  v_priced_service_count integer;
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
    select coalesce(array_agg(bs.service_name order by bs.position), array[v_existing.service_name])
    into v_service_names
    from public.booking_services bs
    where bs.booking_id = v_existing.id;
    return jsonb_build_object(
      'id', v_existing.id,
      'reference', v_existing.reference,
      'starts_at', v_existing.starts_at,
      'ends_at', v_existing.ends_at,
      'status', v_existing.status,
      'service_names', v_service_names
    );
  end if;

  if p_service_ids is null or cardinality(p_service_ids) < 1 or cardinality(p_service_ids) > 12 then
    raise exception using errcode = '22023', message = 'SERVICE_NOT_AVAILABLE';
  end if;

  select count(distinct service_id) into v_distinct_count
  from unnest(p_service_ids) as requested(service_id);
  if v_distinct_count <> cardinality(p_service_ids) then
    raise exception using errcode = '22023', message = 'DUPLICATE_SERVICE';
  end if;

  perform s.id
  from public.services s
  where s.id = any(p_service_ids) and s.is_active and not s.requires_quote
  for share;

  select
    count(*),
    sum(s.duration_minutes)::integer,
    max(s.buffer_after_minutes),
    case when count(s.price_cents) = count(*) then sum(s.price_cents)::integer end,
    count(s.price_cents)::integer,
    string_agg(s.name, ', ' order by s.sort_order, s.name),
    array_agg(s.name order by s.sort_order, s.name),
    (array_agg(s.id order by s.sort_order, s.name))[1]
  into
    v_service_count, v_duration_minutes, v_buffer_minutes, v_price_cents,
    v_priced_service_count, v_service_name, v_service_names, v_primary_service_id
  from public.services s
  where s.id = any(p_service_ids) and s.is_active and not s.requires_quote;

  if v_service_count <> cardinality(p_service_ids) then
    raise exception using errcode = '22023', message = 'SERVICE_NOT_AVAILABLE';
  end if;

  if v_priced_service_count = v_service_count then
    v_price_label := case
      when v_price_cents % 100 = 0 then '$' || (v_price_cents / 100)::text
      else '$' || to_char(v_price_cents / 100.0, 'FM999999990.00')
    end;
  end if;

  select * into v_settings from public.business_settings where singleton for share;
  v_local_date := (p_starts_at at time zone v_settings.timezone)::date;

  if not exists (
    select 1 from public.get_booking_availability_multi(p_service_ids, v_local_date) a
    where a.starts_at = p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'SLOT_NOT_AVAILABLE';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration_minutes);

  insert into public.schedule_blocks (
    kind, service_starts_at, service_ends_at, occupied_starts_at, occupied_ends_at
  ) values (
    'booking', p_starts_at, v_ends_at, p_starts_at,
    v_ends_at + make_interval(mins => v_buffer_minutes)
  ) returning id into v_block_id;

  v_booking_id := gen_random_uuid();
  v_reference := 'MC-' || upper(substr(replace(v_booking_id::text, '-', ''), 1, 8));

  insert into public.bookings (
    id, reference, schedule_block_id, service_id, service_name,
    duration_minutes, buffer_after_minutes, price_cents, price_label,
    starts_at, ends_at, customer_first_name, customer_last_name,
    customer_email, customer_phone, address_line1, address_line2,
    suburb, state, postcode, notes, cancellation_token_hash, idempotency_key
  ) values (
    v_booking_id, v_reference, v_block_id, v_primary_service_id, v_service_name,
    v_duration_minutes, v_buffer_minutes, v_price_cents, v_price_label,
    p_starts_at, v_ends_at, trim(p_customer_first_name), trim(p_customer_last_name),
    lower(trim(p_customer_email)), trim(p_customer_phone), trim(p_address_line1), nullif(trim(p_address_line2), ''),
    trim(p_suburb), upper(trim(p_state)), trim(p_postcode), nullif(trim(p_notes), ''),
    encode(digest(p_cancellation_token, 'sha256'), 'hex'), p_idempotency_key
  );

  insert into public.booking_services (
    booking_id, service_id, position, service_name, duration_minutes, price_cents, price_label
  )
  select
    v_booking_id, s.id,
    (row_number() over (order by s.sort_order, s.name))::smallint,
    s.name, s.duration_minutes, s.price_cents, s.price_label
  from public.services s
  where s.id = any(p_service_ids)
  order by s.sort_order, s.name;

  insert into public.email_outbox (booking_id, template, recipient, payload)
  values
    (v_booking_id, 'booking_customer_confirmation', lower(trim(p_customer_email)),
      jsonb_build_object('cancellation_token', p_cancellation_token)),
    (v_booking_id, 'booking_business_notification', lower(trim(p_business_email)), '{}'::jsonb);

  return jsonb_build_object(
    'id', v_booking_id,
    'reference', v_reference,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'status', 'confirmed',
    'service_names', v_service_names
  );
exception
  when exclusion_violation then
    raise exception using errcode = '23P01', message = 'SLOT_NOT_AVAILABLE';
end;
$$;

revoke all on function public.get_booking_availability_multi(uuid[], date) from public, anon, authenticated;
revoke all on function public.create_booking_multi(uuid[], timestamptz, text, text, text, text, text, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.get_booking_availability_multi(uuid[], date) to service_role;
grant execute on function public.create_booking_multi(uuid[], timestamptz, text, text, text, text, text, text, text, text, text, text, text, uuid, text) to service_role;
