begin;
select plan(3);

select ok(
  exists(select 1 from pg_constraint where conname = 'schedule_blocks_no_overlap'),
  'database exclusion constraint exists'
);

insert into public.schedule_blocks (
  kind, service_starts_at, service_ends_at, occupied_starts_at, occupied_ends_at, reason
) values (
  'unavailability', '2030-01-02 00:00:00+00', '2030-01-02 01:00:00+00',
  '2030-01-02 00:00:00+00', '2030-01-02 01:30:00+00', 'concurrency test'
);

select throws_ok(
  $$insert into public.schedule_blocks (
    kind, service_starts_at, service_ends_at, occupied_starts_at, occupied_ends_at
  ) values (
    'booking', '2030-01-02 01:00:00+00', '2030-01-02 02:00:00+00',
    '2030-01-02 01:00:00+00', '2030-01-02 02:30:00+00'
  )$$,
  '23P01',
  null,
  'overlapping occupied period is rejected'
);

update public.schedule_blocks set active = false where reason = 'concurrency test';

select lives_ok(
  $$insert into public.schedule_blocks (
    kind, service_starts_at, service_ends_at, occupied_starts_at, occupied_ends_at
  ) values (
    'booking', '2030-01-02 01:00:00+00', '2030-01-02 02:00:00+00',
    '2030-01-02 01:00:00+00', '2030-01-02 02:30:00+00'
  )$$,
  'cancelled block releases the occupied period'
);

select * from finish();
rollback;
