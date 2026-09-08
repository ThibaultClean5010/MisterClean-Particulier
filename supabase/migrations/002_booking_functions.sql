create or replace function public.get_booking_availability(
  p_service_id uuid,
  p_local_date date
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_service public.services%rowtype;
  v_settings public.business_settings%rowtype;
begin
  select * into v_service
  from public.services
  where id = p_service_id and is_active and not requires_quote;

  if not found then
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
      w.window_end - make_interval(mins => v_service.duration_minutes),
      make_interval(mins => v_settings.slot_interval_minutes)
    ) candidate
  )
  select
    c.candidate_start,
    c.candidate_start + make_interval(mins => v_service.duration_minutes)
  from candidates c
  where c.candidate_start >= now() + make_interval(mins => v_settings.minimum_booking_notice_minutes)
    and not exists (
      select 1
      from public.schedule_blocks b
      where b.active
        and b.occupied_period && tstzrange(
          c.candidate_start,
          c.candidate_start + make_interval(mins => v_service.duration_minutes + v_service.buffer_after_minutes),
          '[)'
        )
    )
  order by c.candidate_start;
end;
$$;

create or replace function public.create_booking(
  p_service_id uuid,
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
  v_service public.services%rowtype;
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
    return jsonb_build_object(
      'id', v_existing.id,
      'reference', v_existing.reference,
      'starts_at', v_existing.starts_at,
      'ends_at', v_existing.ends_at,
      'status', v_existing.status
    );
  end if;

  select * into v_service
  from public.services
  where id = p_service_id and is_active and not requires_quote
  for share;
  if not found then
    raise exception using errcode = '22023', message = 'SERVICE_NOT_AVAILABLE';
  end if;

  select * into v_settings from public.business_settings where singleton for share;
  v_local_date := (p_starts_at at time zone v_settings.timezone)::date;

  if not exists (
    select 1 from public.get_booking_availability(p_service_id, v_local_date) a
    where a.starts_at = p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'SLOT_NOT_AVAILABLE';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);

  insert into public.schedule_blocks (
    kind, service_starts_at, service_ends_at, occupied_starts_at, occupied_ends_at
  ) values (
    'booking', p_starts_at, v_ends_at, p_starts_at,
    v_ends_at + make_interval(mins => v_service.buffer_after_minutes)
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
    v_booking_id, v_reference, v_block_id, v_service.id, v_service.name,
    v_service.duration_minutes, v_service.buffer_after_minutes, v_service.price_cents, v_service.price_label,
    p_starts_at, v_ends_at, trim(p_customer_first_name), trim(p_customer_last_name),
    lower(trim(p_customer_email)), trim(p_customer_phone), trim(p_address_line1), nullif(trim(p_address_line2), ''),
    trim(p_suburb), upper(trim(p_state)), trim(p_postcode), nullif(trim(p_notes), ''),
    encode(digest(p_cancellation_token, 'sha256'), 'hex'), p_idempotency_key
  );

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
    'status', 'confirmed'
  );
exception
  when exclusion_violation then
    raise exception using errcode = '23P01', message = 'SLOT_NOT_AVAILABLE';
end;
$$;

create or replace function public.cancel_booking(p_cancellation_token text, p_business_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_settings public.business_settings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where cancellation_token_hash = encode(digest(p_cancellation_token, 'sha256'), 'hex')
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'INVALID_CANCELLATION_TOKEN';
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object('reference', v_booking.reference, 'status', 'cancelled');
  end if;

  select * into v_settings from public.business_settings where singleton;
  if v_booking.starts_at < now() + make_interval(mins => v_settings.cancellation_notice_minutes) then
    raise exception using errcode = '22023', message = 'CANCELLATION_TOO_LATE';
  end if;

  update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_booking.id;
  update public.schedule_blocks set active = false where id = v_booking.schedule_block_id;

  insert into public.email_outbox (booking_id, template, recipient, payload)
  values
    (v_booking.id, 'booking_customer_cancellation', v_booking.customer_email, '{}'::jsonb),
    (v_booking.id, 'booking_business_cancellation', lower(trim(p_business_email)), '{}'::jsonb)
  on conflict (booking_id, template) do nothing;

  return jsonb_build_object('reference', v_booking.reference, 'status', 'cancelled');
end;
$$;

revoke all on function public.get_booking_availability(uuid, date) from public, anon, authenticated;
revoke all on function public.create_booking(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_booking(text, text) from public, anon, authenticated;
grant execute on function public.get_booking_availability(uuid, date) to service_role;
grant execute on function public.create_booking(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, uuid, text) to service_role;
grant execute on function public.cancel_booking(text, text) to service_role;
