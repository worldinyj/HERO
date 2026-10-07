begin;

do $$ begin
  create type public.scenario_status as enum ('draft', 'review', 'approved', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.season_status as enum ('scheduled', 'open', 'closed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.play_session_status as enum ('in_progress', 'completed', 'abandoned', 'flagged');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  is_competitive boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenario_slug_format check (slug ~ '^[a-z0-9_-]+$')
);

create table if not exists public.scenario_versions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  version integer not null check (version > 0),
  status public.scenario_status not null default 'draft',
  default_perspective_role public.job_role not null,
  content jsonb not null,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (scenario_id, version)
);

create index if not exists scenario_versions_scenario_status_idx
  on public.scenario_versions (scenario_id, status, version desc);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  season_key text not null unique,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.season_status not null default 'scheduled',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint season_valid_range check (starts_at < ends_at)
);

create index if not exists seasons_active_time_idx
  on public.seasons (status, starts_at, ends_at);

create table if not exists public.season_scenarios (
  season_id uuid not null references public.seasons(id) on delete cascade,
  scenario_version_id uuid not null references public.scenario_versions(id) on delete cascade,
  simulation_seed text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (season_id, scenario_version_id),
  constraint simulation_seed_nonempty check (char_length(simulation_seed) >= 16)
);

create table if not exists public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plant_id uuid not null references public.plants(id),
  player_job_role public.job_role not null,
  perspective_role public.job_role not null,
  season_id uuid not null references public.seasons(id),
  scenario_version_id uuid not null references public.scenario_versions(id),
  simulation_seed text not null,
  presentation_seed text not null,
  replay_of uuid references public.play_sessions(id),
  replay_from_node text,
  status public.play_session_status not null default 'in_progress',
  ending text,
  metrics jsonb,
  hp_point integer,
  score_rule_version text,
  evaluation jsonb,
  integrity_flag text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint hp_point_range check (hp_point is null or hp_point between 0 and 310),
  constraint ending_value check (
    ending is null or ending in ('safe_complete', 'safe_stop', 'near_miss', 'event')
  )
);

create index if not exists play_sessions_user_season_idx
  on public.play_sessions (user_id, season_id, completed_at desc);

create index if not exists play_sessions_scenario_idx
  on public.play_sessions (scenario_version_id, season_id, status);

create unique index if not exists one_in_progress_session_per_user_scenario
  on public.play_sessions (user_id, scenario_version_id)
  where status = 'in_progress';

create table if not exists public.session_decisions (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.play_sessions(id) on delete cascade,
  seq integer not null check (seq >= 0),
  node_id text not null,
  action_type text not null,
  action_id text,
  clock_before integer not null,
  clock_after integer not null,
  created_at timestamptz not null default now(),
  unique (session_id, seq),
  constraint action_type_value check (
    action_type in ('continue', 'choice', 'info', 'card')
  )
);

create index if not exists session_decisions_session_idx
  on public.session_decisions (session_id, seq);

alter table public.scenarios enable row level security;
alter table public.scenario_versions enable row level security;
alter table public.seasons enable row level security;
alter table public.season_scenarios enable row level security;
alter table public.play_sessions enable row level security;
alter table public.session_decisions enable row level security;

drop policy if exists "scenarios_active_read" on public.scenarios;
create policy "scenarios_active_read"
on public.scenarios
for select
to authenticated
using (
  is_active = true
  and (select private.auth_role()) is not null
);

drop policy if exists "scenario_versions_published_read" on public.scenario_versions;
create policy "scenario_versions_published_read"
on public.scenario_versions
for select
to authenticated
using (
  status = 'published'
  and (select private.auth_role()) is not null
);

drop policy if exists "seasons_read" on public.seasons;
create policy "seasons_read"
on public.seasons
for select
to authenticated
using ((select private.auth_role()) is not null);

drop policy if exists "season_scenarios_read" on public.season_scenarios;
create policy "season_scenarios_read"
on public.season_scenarios
for select
to authenticated
using (
  is_active = true
  and (select private.auth_role()) is not null
);

drop policy if exists "play_sessions_owner_or_admin_read" on public.play_sessions;
create policy "play_sessions_owner_or_admin_read"
on public.play_sessions
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.auth_role()) = 'admin'
);

drop policy if exists "session_decisions_owner_or_admin_read" on public.session_decisions;
create policy "session_decisions_owner_or_admin_read"
on public.session_decisions
for select
to authenticated
using (
  exists (
    select 1
    from public.play_sessions ps
    where ps.id = session_decisions.session_id
      and (
        ps.user_id = (select auth.uid())
        or (select private.auth_role()) = 'admin'
      )
  )
);

revoke all on public.scenarios,
  public.scenario_versions,
  public.seasons,
  public.season_scenarios,
  public.play_sessions,
  public.session_decisions
from anon;

grant select on public.scenarios,
  public.scenario_versions,
  public.seasons,
  public.season_scenarios,
  public.play_sessions,
  public.session_decisions
to authenticated;

create or replace function public.complete_play_session_atomic(
  p_session_id uuid,
  p_user_id uuid,
  p_ending text,
  p_metrics jsonb,
  p_hp_point integer,
  p_score_rule_version text,
  p_evaluation jsonb,
  p_decisions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.play_sessions%rowtype;
  v_decision jsonb;
begin
  select *
    into v_session
  from public.play_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.user_id <> p_user_id then
    raise exception 'session_owner_mismatch';
  end if;

  if v_session.status = 'completed' then
    return jsonb_build_object(
      'already_completed', true,
      'session_id', v_session.id,
      'ending', v_session.ending,
      'hp_point', v_session.hp_point,
      'score_rule_version', v_session.score_rule_version,
      'evaluation', v_session.evaluation
    );
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'session_not_in_progress';
  end if;

  update public.play_sessions
  set status = 'completed',
      ending = p_ending,
      metrics = p_metrics,
      hp_point = p_hp_point,
      score_rule_version = p_score_rule_version,
      evaluation = p_evaluation,
      completed_at = now(),
      updated_at = now()
  where id = p_session_id;

  for v_decision in
    select value
    from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb))
  loop
    insert into public.session_decisions (
      session_id,
      seq,
      node_id,
      action_type,
      action_id,
      clock_before,
      clock_after
    )
    values (
      p_session_id,
      (v_decision->>'seq')::integer,
      v_decision->>'node_id',
      v_decision->>'action_type',
      nullif(v_decision->>'action_id', ''),
      (v_decision->>'clock_before')::integer,
      (v_decision->>'clock_after')::integer
    );
  end loop;

  insert into public.audit_logs (
    actor_user_id,
    plant_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_user_id,
    v_session.plant_id,
    'play_session.completed',
    'play_session',
    p_session_id::text,
    jsonb_build_object(
      'scenario_version_id', v_session.scenario_version_id,
      'season_id', v_session.season_id,
      'ending', p_ending,
      'hp_point', p_hp_point,
      'score_rule_version', p_score_rule_version
    )
  );

  return jsonb_build_object(
    'already_completed', false,
    'session_id', p_session_id,
    'ending', p_ending,
    'hp_point', p_hp_point,
    'score_rule_version', p_score_rule_version,
    'evaluation', p_evaluation
  );
end;
$$;

revoke all on function public.complete_play_session_atomic(
  uuid, uuid, text, jsonb, integer, text, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.complete_play_session_atomic(
  uuid, uuid, text, jsonb, integer, text, jsonb, jsonb
) to service_role;

commit;
