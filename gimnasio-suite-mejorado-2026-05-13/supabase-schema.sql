-- Hidalgo GYM - Supabase schema
-- Ejecutar en Supabase > SQL Editor.
-- Seguridad: todas las tablas tienen RLS activo.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'coach')),
  area text check (area in ('yoga', 'pilates', 'boxeo', 'pesas')),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id text primary key default gen_random_uuid()::text,
  full_name text not null default '',
  rut text default '',
  phone text default '',
  sex text default '',
  age integer,
  complications text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id text primary key default gen_random_uuid()::text,
  program_id text not null check (program_id in ('yoga', 'pilates', 'boxeo', 'pesas')),
  name text not null,
  price integer not null default 0,
  description text default '',
  payment_day integer not null default 1 check (payment_day between 1 and 28),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id text primary key default gen_random_uuid()::text,
  program_id text not null check (program_id in ('yoga', 'pilates', 'boxeo', 'pesas')),
  name text default '',
  day integer not null check (day between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id text primary key default gen_random_uuid()::text,
  client_id text not null references public.clients(id) on delete cascade,
  program_id text not null check (program_id in ('yoga', 'pilates', 'boxeo', 'pesas')),
  plan_id text references public.plans(id) on delete set null,
  payment_date date,
  schedule_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, program_id)
);

create table if not exists public.attendance (
  id text primary key default gen_random_uuid()::text,
  program_id text not null check (program_id in ('yoga', 'pilates', 'boxeo', 'pesas')),
  attendance_date date not null,
  schedule_id text,
  local_slot_id text default '',
  client_id text not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (program_id, attendance_date, client_id, schedule_id, local_slot_id)
);

create table if not exists public.payments (
  id text primary key default gen_random_uuid()::text,
  program_id text not null check (program_id in ('yoga', 'pilates', 'boxeo', 'pesas')),
  client_id text not null references public.clients(id) on delete cascade,
  payment_date date not null,
  amount integer not null default 0,
  method text default 'Efectivo',
  note text default '',
  created_at timestamptz not null default now()
);

create or replace function public.current_profile_role()
returns text
as 'select role from public.profiles where id = auth.uid();'
language sql
stable
security definer
set search_path = public;

create or replace function public.current_profile_area()
returns text
as 'select area from public.profiles where id = auth.uid();'
language sql
stable
security definer
set search_path = public;

create or replace function public.is_admin()
returns boolean
as 'select coalesce(public.current_profile_role() = ''admin'', false);'
language sql
stable
security definer
set search_path = public;

create or replace function public.is_own_area(program text)
returns boolean
as 'select public.is_admin() or coalesce(public.current_profile_area() = program, false);'
language sql
stable
security definer
set search_path = public;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.plans enable row level security;
alter table public.schedules enable row level security;
alter table public.memberships enable row level security;
alter table public.attendance enable row level security;
alter table public.payments enable row level security;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin manage" on public.profiles;
create policy "profiles admin manage" on public.profiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "clients read by membership area" on public.clients;
create policy "clients read by membership area" on public.clients
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.memberships m
    where m.client_id = clients.id
    and m.program_id = public.current_profile_area()
  )
);

drop policy if exists "clients insert authenticated" on public.clients;
create policy "clients insert authenticated" on public.clients
for insert to authenticated
with check (true);

drop policy if exists "clients admin update delete" on public.clients;
create policy "clients admin update delete" on public.clients
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "clients admin delete" on public.clients;
create policy "clients admin delete" on public.clients
for delete to authenticated
using (public.is_admin());

drop policy if exists "plans read own area" on public.plans;
create policy "plans read own area" on public.plans
for select to authenticated
using (public.is_own_area(program_id));

drop policy if exists "plans admin manage" on public.plans;
create policy "plans admin manage" on public.plans
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "schedules read own area" on public.schedules;
create policy "schedules read own area" on public.schedules
for select to authenticated
using (public.is_own_area(program_id));

drop policy if exists "schedules coach manage own area" on public.schedules;
create policy "schedules coach manage own area" on public.schedules
for all to authenticated
using (public.is_own_area(program_id))
with check (public.is_own_area(program_id));

drop policy if exists "memberships read own area" on public.memberships;
create policy "memberships read own area" on public.memberships
for select to authenticated
using (public.is_own_area(program_id));

drop policy if exists "memberships insert own area" on public.memberships;
create policy "memberships insert own area" on public.memberships
for insert to authenticated
with check (public.is_own_area(program_id));

drop policy if exists "memberships admin update delete" on public.memberships;
create policy "memberships admin update delete" on public.memberships
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "memberships admin delete" on public.memberships;
create policy "memberships admin delete" on public.memberships
for delete to authenticated
using (public.is_admin());

drop policy if exists "attendance own area manage" on public.attendance;
create policy "attendance own area manage" on public.attendance
for all to authenticated
using (public.is_own_area(program_id))
with check (public.is_own_area(program_id));

drop policy if exists "payments admin only" on public.payments;
create policy "payments admin only" on public.payments
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create index if not exists memberships_client_idx on public.memberships(client_id);
create index if not exists memberships_program_idx on public.memberships(program_id);
create index if not exists attendance_program_date_idx on public.attendance(program_id, attendance_date);
create index if not exists payments_program_date_idx on public.payments(program_id, payment_date);
