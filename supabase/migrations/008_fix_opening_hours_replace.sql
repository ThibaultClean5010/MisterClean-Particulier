-- Supabase's safe-update protection requires an explicit predicate even when
-- the function intentionally replaces the complete seven-day schedule.
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

revoke all on function public.replace_opening_hours(jsonb) from public, anon, authenticated;
grant execute on function public.replace_opening_hours(jsonb) to service_role;
