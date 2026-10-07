begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

drop index if exists public.one_in_progress_session_per_user_scenario;
create unique index one_in_progress_session_per_user_season_scenario
  on public.play_sessions (user_id, season_id, scenario_version_id)
  where status = 'in_progress';

create table if not exists public.leaderboard_snapshots (
  id bigint generated always as identity primary key,
  season_id uuid not null references public.seasons(id) on delete cascade,
  scope_type text not null,
  scope_plant_id uuid references public.plants(id),
  scope_job_role public.job_role,
  user_id uuid not null,
  nickname text not null,
  plant_display_name text not null,
  player_job_role public.job_role not null,
  hp_point integer not null check (hp_point >= 0),
  scenario_count integer not null check (scenario_count >= 0),
  rank_position integer not null check (rank_position >= 1),
  top_percent integer not null check (top_percent between 1 and 100),
  created_at timestamptz not null default now(),
  constraint leaderboard_snapshot_scope check (
    scope_type in ('overall', 'plant', 'job', 'plant_job')
  )
);

create index if not exists leaderboard_snapshots_season_scope_rank_idx
  on public.leaderboard_snapshots (season_id, scope_type, rank_position);

alter table public.leaderboard_snapshots enable row level security;

drop policy if exists "leaderboard_snapshots_admin_read" on public.leaderboard_snapshots;
create policy "leaderboard_snapshots_admin_read"
on public.leaderboard_snapshots
for select
to authenticated
using ((select private.auth_role()) = 'admin');

revoke all on public.leaderboard_snapshots from anon;
grant select on public.leaderboard_snapshots to authenticated;

create or replace view private.v_season_scores_internal as
with best_per_scenario as (
  select
    ps.season_id,
    ps.user_id,
    sv.scenario_id,
    max(ps.hp_point)::integer as best_hp
  from public.play_sessions ps
  join public.scenario_versions sv
    on sv.id = ps.scenario_version_id
  join public.seasons s
    on s.id = ps.season_id
  where ps.status = 'completed'
    and ps.hp_point is not null
    and ps.completed_at >= s.starts_at
    and ps.completed_at < s.ends_at
  group by ps.season_id, ps.user_id, sv.scenario_id
),
season_totals as (
  select
    season_id,
    user_id,
    sum(best_hp)::integer as season_hp,
    count(*)::integer as scenario_count
  from best_per_scenario
  group by season_id, user_id
),
season_identity as (
  select distinct on (ps.season_id, ps.user_id)
    ps.season_id,
    ps.user_id,
    ps.plant_id,
    ps.player_job_role
  from public.play_sessions ps
  where ps.status in ('completed', 'in_progress', 'abandoned')
  order by ps.season_id, ps.user_id, ps.started_at asc, ps.id asc
),
enriched as (
  select
    st.season_id,
    st.user_id,
    coalesce(p.nickname, '익명 사용자') as nickname,
    si.plant_id,
    coalesce(pl.display_name, '소속 없음') as plant_display_name,
    si.player_job_role,
    st.season_hp,
    st.scenario_count
  from season_totals st
  join season_identity si
    on si.season_id = st.season_id
   and si.user_id = st.user_id
  left join public.profiles p
    on p.id = st.user_id
  left join public.plants pl
    on pl.id = si.plant_id
),
ranked as (
  select
    e.*,
    dense_rank() over (
      partition by e.season_id
      order by e.season_hp desc
    )::integer as overall_rank,
    count(*) over (
      partition by e.season_id
    )::integer as overall_total,
    dense_rank() over (
      partition by e.season_id, e.plant_id
      order by e.season_hp desc
    )::integer as plant_rank,
    count(*) over (
      partition by e.season_id, e.plant_id
    )::integer as plant_total,
    dense_rank() over (
      partition by e.season_id, e.player_job_role
      order by e.season_hp desc
    )::integer as job_rank,
    count(*) over (
      partition by e.season_id, e.player_job_role
    )::integer as job_total,
    dense_rank() over (
      partition by e.season_id, e.plant_id, e.player_job_role
      order by e.season_hp desc
    )::integer as plant_job_rank,
    count(*) over (
      partition by e.season_id, e.plant_id, e.player_job_role
    )::integer as plant_job_total
  from enriched e
)
select
  r.*,
  greatest(1, ceil(100.0 * r.overall_rank / nullif(r.overall_total, 0))::integer)
    as overall_top_percent,
  greatest(1, ceil(100.0 * r.plant_rank / nullif(r.plant_total, 0))::integer)
    as plant_top_percent,
  greatest(1, ceil(100.0 * r.job_rank / nullif(r.job_total, 0))::integer)
    as job_top_percent,
  greatest(1, ceil(100.0 * r.plant_job_rank / nullif(r.plant_job_total, 0))::integer)
    as plant_job_top_percent
from ranked r;

revoke all on private.v_season_scores_internal from public, anon, authenticated;

create or replace view public.v_leaderboard_current_public
with (security_barrier = true)
as
select
  s.id as season_id,
  s.season_key,
  s.title as season_title,
  s.starts_at,
  s.ends_at,
  i.nickname,
  i.plant_display_name,
  i.player_job_role as job_role,
  i.season_hp as hp_point,
  i.scenario_count,
  i.overall_rank,
  i.overall_top_percent,
  i.plant_rank,
  i.plant_top_percent,
  i.job_rank,
  i.job_top_percent,
  i.plant_job_rank,
  i.plant_job_top_percent
from private.v_season_scores_internal i
join public.seasons s
  on s.id = i.season_id
where s.status = 'open'
  and now() >= s.starts_at
  and now() < s.ends_at;

revoke all on public.v_leaderboard_current_public from public, anon;
grant select on public.v_leaderboard_current_public to authenticated;

create or replace view public.v_leaderboard_snapshot_public
with (security_barrier = true)
as
select
  ls.season_id,
  s.season_key,
  s.title as season_title,
  s.starts_at,
  s.ends_at,
  ls.scope_type,
  ls.nickname,
  ls.plant_display_name,
  ls.player_job_role as job_role,
  ls.hp_point,
  ls.scenario_count,
  ls.rank_position,
  ls.top_percent
from public.leaderboard_snapshots ls
join public.seasons s
  on s.id = ls.season_id
where s.status = 'closed';

revoke all on public.v_leaderboard_snapshot_public from public, anon;
grant select on public.v_leaderboard_snapshot_public to authenticated;

create or replace function private.snapshot_season(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.leaderboard_snapshots
  where season_id = p_season_id;

  insert into public.leaderboard_snapshots (
    season_id,
    scope_type,
    scope_plant_id,
    scope_job_role,
    user_id,
    nickname,
    plant_display_name,
    player_job_role,
    hp_point,
    scenario_count,
    rank_position,
    top_percent
  )
  select
    i.season_id,
    scope.scope_type,
    case
      when scope.scope_type in ('plant', 'plant_job') then i.plant_id
      else null
    end,
    case
      when scope.scope_type in ('job', 'plant_job') then i.player_job_role
      else null
    end,
    i.user_id,
    i.nickname,
    i.plant_display_name,
    i.player_job_role,
    i.season_hp,
    i.scenario_count,
    case scope.scope_type
      when 'overall' then i.overall_rank
      when 'plant' then i.plant_rank
      when 'job' then i.job_rank
      when 'plant_job' then i.plant_job_rank
    end,
    case scope.scope_type
      when 'overall' then i.overall_top_percent
      when 'plant' then i.plant_top_percent
      when 'job' then i.job_top_percent
      when 'plant_job' then i.plant_job_top_percent
    end
  from private.v_season_scores_internal i
  cross join (
    values ('overall'::text), ('plant'::text), ('job'::text), ('plant_job'::text)
  ) as scope(scope_type)
  where i.season_id = p_season_id;
end;
$$;

revoke all on function private.snapshot_season(uuid) from public, anon, authenticated;

create or replace function private.ensure_monthly_season(p_reference_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', p_reference_date)::date;
  v_month_end date := (date_trunc('month', p_reference_date) + interval '1 month')::date;
  v_season_key text := to_char(v_month_start, 'YYYY-MM');
  v_season_id uuid;
begin
  insert into public.seasons (
    season_key,
    title,
    starts_at,
    ends_at,
    status
  )
  values (
    v_season_key,
    to_char(v_month_start, 'YYYY"년" FMMM"월 시즌"'),
    (v_month_start::timestamp at time zone 'Asia/Seoul'),
    (v_month_end::timestamp at time zone 'Asia/Seoul'),
    'scheduled'
  )
  on conflict (season_key) do nothing;

  select id
    into v_season_id
  from public.seasons
  where season_key = v_season_key;

  insert into public.season_scenarios (
    season_id,
    scenario_version_id,
    simulation_seed,
    is_active
  )
  select
    v_season_id,
    latest.id,
    encode(extensions.gen_random_bytes(32), 'hex'),
    true
  from (
    select distinct on (sv.scenario_id)
      sv.id,
      sv.scenario_id
    from public.scenario_versions sv
    join public.scenarios sc
      on sc.id = sv.scenario_id
    where sv.status = 'published'
      and sc.is_active = true
      and sc.is_competitive = true
    order by sv.scenario_id, sv.version desc
  ) latest
  on conflict (season_id, scenario_version_id) do nothing;

  return v_season_id;
end;
$$;

revoke all on function private.ensure_monthly_season(date) from public, anon, authenticated;

create or replace function public.sync_open_season_scenarios()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select private.auth_role()) <> 'admin' then
    raise exception 'admin_required';
  end if;

  insert into public.season_scenarios (
    season_id,
    scenario_version_id,
    simulation_seed,
    is_active
  )
  select
    s.id,
    latest.id,
    encode(extensions.gen_random_bytes(32), 'hex'),
    true
  from public.seasons s
  cross join lateral (
    select distinct on (sv.scenario_id)
      sv.id,
      sv.scenario_id
    from public.scenario_versions sv
    join public.scenarios sc
      on sc.id = sv.scenario_id
    where sv.status = 'published'
      and sc.is_active = true
      and sc.is_competitive = true
    order by sv.scenario_id, sv.version desc
  ) latest
  where s.status = 'open'
    and now() >= s.starts_at
    and now() < s.ends_at
  on conflict (season_id, scenario_version_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.sync_open_season_scenarios() from public, anon;
grant execute on function public.sync_open_season_scenarios() to authenticated;

create or replace function private.rollover_monthly_season()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kst_date date := (now() at time zone 'Asia/Seoul')::date;
  v_closing record;
  v_current_season_id uuid;
begin
  if extract(day from v_kst_date) <> 1 then
    return;
  end if;

  for v_closing in
    select id
    from public.seasons
    where status = 'open'
      and ends_at <= now()
    for update
  loop
    update public.play_sessions
    set status = 'abandoned',
        updated_at = now()
    where season_id = v_closing.id
      and status = 'in_progress';

    perform private.snapshot_season(v_closing.id);

    update public.seasons
    set status = 'closed',
        closed_at = now()
    where id = v_closing.id;

    insert into public.audit_logs (
      actor_user_id,
      plant_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      null,
      null,
      'season.closed',
      'season',
      v_closing.id::text,
      jsonb_build_object('closed_at', now())
    );
  end loop;

  v_current_season_id := private.ensure_monthly_season(v_kst_date);

  update public.seasons
  set status = 'open'
  where id = v_current_season_id
    and starts_at <= now()
    and ends_at > now()
    and status <> 'open';

  insert into public.audit_logs (
    actor_user_id,
    plant_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  select
    null,
    null,
    'season.opened',
    'season',
    v_current_season_id::text,
    jsonb_build_object('opened_at', now())
  where not exists (
    select 1
    from public.audit_logs
    where action = 'season.opened'
      and entity_type = 'season'
      and entity_id = v_current_season_id::text
  );
end;
$$;

revoke all on function private.rollover_monthly_season() from public, anon, authenticated;

do $$
declare
  v_current_season_id uuid;
begin
  v_current_season_id := private.ensure_monthly_season(
    (now() at time zone 'Asia/Seoul')::date
  );

  update public.seasons
  set status = 'open'
  where id = v_current_season_id
    and starts_at <= now()
    and ends_at > now()
    and status <> 'open';
end;
$$;

select cron.schedule(
  'hero-season-rollover',
  '0 15 * * *',
  'select private.rollover_monthly_season();'
);

commit;
