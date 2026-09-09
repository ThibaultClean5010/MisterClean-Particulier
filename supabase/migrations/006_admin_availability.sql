create table public.availability_exceptions (
  local_date date primary key,
  is_closed boolean not null,
  opens_at time,
  closes_at time,
  updated_at timestamptz not null default now(),
  check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create table public.admin_availability_audit (
  id bigint generated always as identity primary key,
  admin_email text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.availability_exceptions enable row level security;
alter table public.admin_availability_audit enable row level security;
revoke all on public.availability_exceptions, public.admin_availability_audit from anon, authenticated;

create or replace function public.replace_opening_hours(p_windows jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_windows) <> 'array' or jsonb_array_length(p_windows) > 7 then
    raise exception using errcode = '22023', message = 'INVALID_OPENING_HOURS';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_windows) as w(weekday smallint, opens_at time, closes_at time)
    where w.weekday not between 0 and 6 or w.opens_at is null or w.closes_at is null or w.opens_at >= w.closes_at
  ) or (
    select count(*) <> count(distinct weekday)
    from jsonb_to_recordset(p_windows) as w(weekday smallint, opens_at time, closes_at time)
  ) then
    raise exception using errcode = '22023', message = 'INVALID_OPENING_HOURS';
  end if;

  delete from public.opening_hours where weekday between 0 and 6;
  insert into public.opening_hours (weekday, opens_at, closes_at)
  select weekday, opens_at, closes_at
  from jsonb_to_recordset(p_windows) as w(weekday smallint, opens_at time, closes_at time);
end;
$$;

create or replace function public.set_availability_exception(
  p_local_date date,
  p_is_closed boolean,
  p_opens_at time default null,
  p_closes_at time default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_local_date < (now() at time zone 'Australia/Adelaide')::date
     or (p_is_closed and (p_opens_at is not null or p_closes_at is not null))
     or (not p_is_closed and (p_opens_at is null or p_closes_at is null or p_opens_at >= p_closes_at)) then
    raise exception using errcode = '22023', message = 'INVALID_AVAILABILITY_EXCEPTION';
  end if;

  insert into public.availability_exceptions (local_date, is_closed, opens_at, closes_at, updated_at)
  values (p_local_date, p_is_closed, p_opens_at, p_closes_at, now())
  on conflict (local_date) do update set
    is_closed = excluded.is_closed,
    opens_at = excluded.opens_at,
    closes_at = excluded.closes_at,
    updated_at = now();
end;
$$;

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
      (p_local_date + e.opens_at) at time zone v_settings.timezone as window_start,
      (p_local_date + e.closes_at) at time zone v_settings.timezone as window_end
    from public.availability_exceptions e
    where e.local_date = p_local_date and not e.is_closed
    union all
    select
      (p_local_date + h.opens_at) at time zone v_settings.timezone,
      (p_local_date + h.closes_at) at time zone v_settings.timezone
    from public.opening_hours h
    where h.is_active and h.weekday = extract(dow from p_local_date)::smallint
      and not exists (select 1 from public.availability_exceptions e where e.local_date = p_local_date)
  ), candidates as (
    select candidate as candidate_start
    from windows w
    cross join lateral generate_series(
      w.window_start,
      w.window_end - make_interval(mins => v_duration_minutes),
      make_interval(mins => v_settings.slot_interval_minutes)
    ) candidate
  )
  select c.candidate_start, c.candidate_start + make_interval(mins => v_duration_minutes)
  from candidates c
  where c.candidate_start >= now() + make_interval(mins => v_settings.minimum_booking_notice_minutes)
    and not exists (
      select 1 from public.schedule_blocks b
      where b.active and b.occupied_period && tstzrange(
        c.candidate_start,
        c.candidate_start + make_interval(mins => v_duration_minutes + v_buffer_minutes),
        '[)'
      )
    )
  order by c.candidate_start;
end;
$$;

revoke all on function public.replace_opening_hours(jsonb) from public, anon, authenticated;
revoke all on function public.set_availability_exception(date, boolean, time, time) from public, anon, authenticated;
grant execute on function public.replace_opening_hours(jsonb) to service_role;
grant execute on function public.set_availability_exception(date, boolean, time, time) to service_role;
