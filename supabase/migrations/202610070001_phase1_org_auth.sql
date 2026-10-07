begin;

create schema if not exists private;

do $$ begin
  create type public.app_role as enum ('admin', 'plant_manager', 'player');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.job_role as enum ('sro', 'ro', 'field_operator', 'supervisor', 'worker');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plant_id uuid references public.plants(id),
  role public.app_role not null default 'player',
  job_role public.job_role,
  real_name text not null,
  nickname text not null,
  team_name text,
  is_active boolean not null default true,
  accepted_terms_at timestamptz,
  accepted_privacy_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nickname_length check (char_length(nickname) between 2 and 12)
);

create unique index if not exists profiles_nickname_ci_unique
  on public.profiles (lower(nickname));

create index if not exists profiles_plant_id_idx
  on public.profiles (plant_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  plant_id uuid not null references public.plants(id),
  target_role public.app_role not null,
  invitee_name text not null,
  job_role public.job_role,
  team_name text,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  canceled_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint invite_player_requires_job_role check (
    target_role <> 'player' or job_role is not null
  ),
  constraint invite_manager_has_no_job_role check (
    target_role <> 'plant_manager' or job_role is null
  ),
  constraint admin_invite_not_supported check (
    target_role <> 'admin'
  )
);

create index if not exists invitations_plant_id_idx
  on public.invitations (plant_id);

create index if not exists invitations_created_by_idx
  on public.invitations (created_by);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id),
  plant_id uuid references public.plants(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_plant_created_idx
  on public.audit_logs (plant_id, created_at desc);

create or replace function private.auth_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active = true
$$;

create or replace function private.auth_plant()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.plant_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active = true
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.auth_role() from public, anon;
revoke all on function private.auth_plant() from public, anon;
grant execute on function private.auth_role() to authenticated;
grant execute on function private.auth_plant() to authenticated;

alter table public.plants enable row level security;
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "plants_select_scoped" on public.plants;
create policy "plants_select_scoped"
on public.plants
for select
to authenticated
using (
  (select private.auth_role()) = 'admin'
  or id = (select private.auth_plant())
);

drop policy if exists "plants_admin_write" on public.plants;
create policy "plants_admin_write"
on public.plants
for all
to authenticated
using ((select private.auth_role()) = 'admin')
with check ((select private.auth_role()) = 'admin');

drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.auth_role()) = 'admin'
  or (
    (select private.auth_role()) = 'plant_manager'
    and plant_id = (select private.auth_plant())
  )
);

drop policy if exists "profiles_self_nickname_update" on public.profiles;
create policy "profiles_self_nickname_update"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "invitations_select_scoped" on public.invitations;
create policy "invitations_select_scoped"
on public.invitations
for select
to authenticated
using (
  (select private.auth_role()) = 'admin'
  or (
    (select private.auth_role()) = 'plant_manager'
    and plant_id = (select private.auth_plant())
  )
);

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select"
on public.audit_logs
for select
to authenticated
using ((select private.auth_role()) = 'admin');

revoke all on public.plants, public.profiles, public.invitations, public.audit_logs from anon;
grant select on public.plants, public.profiles, public.invitations to authenticated;
grant insert, update, delete on public.plants to authenticated;
grant update (nickname) on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;

comment on table public.profiles is
  'HERO profile. Individual scores/choices are intentionally stored elsewhere and hidden from plant managers.';

comment on table public.invitations is
  'Invitation token plaintext is never stored. Only SHA-256 token_hash is persisted.';

commit;
