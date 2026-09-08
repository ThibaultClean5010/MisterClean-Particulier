create table public.admin_users (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
