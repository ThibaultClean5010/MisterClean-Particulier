create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes between 15 and 720),
  buffer_after_minutes integer not null default 30 check (buffer_after_minutes between 0 and 240),
  price_cents integer check (price_cents >= 0),
  price_label text,
  requires_quote boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_settings (
  singleton boolean primary key default true check (singleton),
  timezone text not null default 'Australia/Adelaide',
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes between 5 and 240),
  minimum_booking_notice_minutes integer not null default 1440 check (minimum_booking_notice_minutes >= 0),
  maximum_advance_booking_days integer not null default 90 check (maximum_advance_booking_days between 1 and 730),
  cancellation_notice_minutes integer not null default 1440 check (cancellation_notice_minutes >= 0),
  updated_at timestamptz not null default now()
);

create table public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  is_active boolean not null default true,
  check (opens_at < closes_at),
  unique (weekday, opens_at, closes_at)
);

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('booking', 'unavailability')),
  service_starts_at timestamptz not null,
  service_ends_at timestamptz not null,
  occupied_starts_at timestamptz not null,
  occupied_ends_at timestamptz not null,
  occupied_period tstzrange generated always as (
    tstzrange(occupied_starts_at, occupied_ends_at, '[)')
  ) stored,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (service_starts_at < service_ends_at),
  check (occupied_starts_at <= service_starts_at),
  check (occupied_ends_at >= service_ends_at)
);

alter table public.schedule_blocks
  add constraint schedule_blocks_no_overlap
  exclude using gist (occupied_period with &&)
  where (active);

create index schedule_blocks_active_period_idx
  on public.schedule_blocks using gist (occupied_period)
  where active;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  schedule_block_id uuid not null unique references public.schedule_blocks(id),
  service_id uuid not null references public.services(id),
  service_name text not null,
  duration_minutes integer not null,
  buffer_after_minutes integer not null,
  price_cents integer,
  price_label text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  customer_first_name text not null,
  customer_last_name text not null,
  customer_email text not null,
  customer_phone text not null,
  address_line1 text not null,
  address_line2 text,
  suburb text not null,
  state text not null default 'SA',
  postcode text not null,
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancellation_token_hash text not null unique,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (starts_at < ends_at)
);

create index bookings_starts_at_idx on public.bookings (starts_at);
create index bookings_customer_email_idx on public.bookings (lower(customer_email));

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  template text not null check (template in (
    'booking_customer_confirmation',
    'booking_business_notification',
    'booking_customer_cancellation',
    'booking_business_cancellation'
  )),
  recipient text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (booking_id, template)
);

create index email_outbox_pending_idx
  on public.email_outbox (next_attempt_at, created_at)
  where status in ('pending', 'failed');

alter table public.services enable row level security;
alter table public.business_settings enable row level security;
alter table public.opening_hours enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.bookings enable row level security;
alter table public.email_outbox enable row level security;

revoke all on all tables in schema public from anon, authenticated;
