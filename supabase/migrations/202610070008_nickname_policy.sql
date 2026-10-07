begin;

alter table public.profiles
  add column if not exists nickname_reset_required boolean not null default false;

create table if not exists public.nickname_forbidden_terms (
  term text primary key,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint nickname_forbidden_term_nonempty check (char_length(trim(term)) > 0)
);

insert into public.nickname_forbidden_terms (term)
values
  ('admin'),
  ('administrator'),
  ('manager'),
  ('관리자'),
  ('운영자'),
  ('공식'),
  ('system'),
  ('시스템'),
  ('fuck'),
  ('shit'),
  ('씨발'),
  ('시발'),
  ('병신'),
  ('개새끼')
on conflict (term) do nothing;

create table if not exists public.nickname_change_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  actor_user_id uuid not null references auth.users(id),
  event_type text not null,
  old_nickname text not null,
  new_nickname text not null,
  created_at timestamptz not null default now(),
  constraint nickname_change_event_type check (
    event_type in ('self_change', 'manager_reset')
  )
);

create index if not exists nickname_change_events_user_season_idx
  on public.nickname_change_events (user_id, season_id, created_at desc);

alter table public.nickname_forbidden_terms enable row level security;
alter table public.nickname_change_events enable row level security;

revoke all on public.nickname_forbidden_terms from public, anon, authenticated;
revoke all on public.nickname_change_events from public, anon, authenticated;

revoke update (nickname) on public.profiles from authenticated;

comment on column public.profiles.nickname_reset_required is
  'True after a plant manager forces an inappropriate nickname reset. User must choose a new valid nickname.';

comment on table public.nickname_change_events is
  'Immutable nickname policy events used to enforce one voluntary change per active season while allowing manager-forced reset recovery.';

commit;
