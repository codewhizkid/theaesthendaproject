-- Aesthenda production foundation schema
-- Run this in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table businesses enable row level security;

drop policy if exists "Business owners can manage their account" on businesses;

create policy "Business owners can manage their account" on businesses
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null,
  full_name text not null,
  email text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table professionals enable row level security;

drop policy if exists "Users can manage their professional record" on professionals;

create policy "Users can manage their professional record" on professionals
  for all to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from businesses
      where businesses.id = professionals.business_id
        and businesses.owner_user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from businesses
      where businesses.id = professionals.business_id
        and businesses.owner_user_id = auth.uid()
    )
  );

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(10,2) not null default 0,
  is_public boolean not null default false,
  is_active boolean not null default true,
  policy_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_segments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  label text not null,
  start_offset_minutes integer not null default 0,
  duration_minutes integer not null check (duration_minutes > 0),
  occupied_by_professional boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists availability_windows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  service_id uuid not null references services(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  policy_version text not null default 'v1',
  service_snapshot jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists appointment_segments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  service_segment_id uuid not null references service_segments(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists booking_holds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  service_id uuid not null references services(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'consumed', 'expired', 'released')),
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_professionals_business_id on professionals(business_id);
create index if not exists idx_clients_business_id on clients(business_id);
create index if not exists idx_services_business_id on services(business_id);
create index if not exists idx_appointments_business_id on appointments(business_id);
create index if not exists idx_appointments_professional_id on appointments(professional_id);
create index if not exists idx_booking_holds_professional_id on booking_holds(professional_id);
