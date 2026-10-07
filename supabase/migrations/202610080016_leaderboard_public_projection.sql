begin;

-- Keep rank windows aligned with the active player population shown by RLS
-- projections. Filtering only after rank calculation causes hidden inactive
-- accounts to inflate other players' ranks and percentile denominators.
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
  join public.profiles p
    on p.id = st.user_id
   and p.role = 'player'
   and p.is_active = true
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

-- Replace SECURITY DEFINER leaderboard views with dedicated public-facing
-- projection tables protected by RLS. These tables intentionally omit
-- user_id, real_name, decision logs, endings, and learning metrics.

create table if not exists public.leaderboard_current_public_rows (
  season_id uuid not null references public.seasons(id) on delete cascade,
  nickname text not null,
  plant_display_name text not null,
  job_role public.job_role not null,
  hp_point integer not null check (hp_point >= 0),
  scenario_count integer not null check (scenario_count >= 0),
  overall_rank integer not null check (overall_rank >= 1),
  overall_top_percent integer not null check (overall_top_percent between 1 and 100),
  plant_rank integer not null check (plant_rank >= 1),
  plant_top_percent integer not null check (plant_top_percent between 1 and 100),
  job_rank integer not null check (job_rank >= 1),
  job_top_percent integer not null check (job_top_percent between 1 and 100),
  plant_job_rank integer not null check (plant_job_rank >= 1),
  plant_job_top_percent integer not null check (plant_job_top_percent between 1 and 100),
  refreshed_at timestamptz not null default now(),
  primary key (season_id, nickname)
);

create index if not exists leaderboard_current_public_rows_overall_idx
  on public.leaderboard_current_public_rows (season_id, overall_rank, hp_point desc, nickname);

create table if not exists public.leaderboard_snapshot_public_rows (
  season_id uuid not null references public.seasons(id) on delete cascade,
  scope_type text not null check (scope_type in ('overall', 'plant', 'job', 'plant_job')),
  nickname text not null,
  plant_display_name text not null,
  job_role public.job_role not null,
  hp_point integer not null check (hp_point >= 0),
  scenario_count integer not null check (scenario_count >= 0),
  rank_position integer not null check (rank_position >= 1),
  top_percent integer not null check (top_percent between 1 and 100),
  refreshed_at timestamptz not null default now(),
  primary key (season_id, scope_type, nickname)
);

create index if not exists leaderboard_snapshot_public_rows_rank_idx
  on public.leaderboard_snapshot_public_rows
    (season_id, scope_type, rank_position, hp_point desc, nickname);

alter table public.leaderboard_current_public_rows enable row level security;
alter table public.leaderboard_snapshot_public_rows enable row level security;

revoke all on public.leaderboard_current_public_rows from public, anon, authenticated;
revoke all on public.leaderboard_snapshot_public_rows from public, anon, authenticated;
grant select on public.leaderboard_current_public_rows to authenticated;
grant select on public.leaderboard_snapshot_public_rows to authenticated;

drop policy if exists "leaderboard_current_public_rows_player_read"
  on public.leaderboard_current_public_rows;
create policy "leaderboard_current_public_rows_player_read"
on public.leaderboard_current_public_rows
for select
to authenticated
using (
  (select private.auth_role()) = 'player'
  and exists (
    select 1
    from public.seasons s
    where s.id = leaderboard_current_public_rows.season_id
      and s.status = 'open'
      and now() >= s.starts_at
      and now() < s.ends_at
  )
);

drop policy if exists "leaderboard_snapshot_public_rows_player_read"
  on public.leaderboard_snapshot_public_rows;
create policy "leaderboard_snapshot_public_rows_player_read"
on public.leaderboard_snapshot_public_rows
for select
to authenticated
using (
  (select private.auth_role()) = 'player'
  and exists (
    select 1
    from public.seasons s
    where s.id = leaderboard_snapshot_public_rows.season_id
      and s.status = 'closed'
  )
);

create or replace function private.refresh_current_leaderboard_public(
  p_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize refreshes for a season so concurrent session submissions cannot
  -- race a delete/rebuild cycle.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_season_id::text, 0)
  );

  delete from public.leaderboard_current_public_rows
  where season_id = p_season_id;

  insert into public.leaderboard_current_public_rows (
    season_id,
    nickname,
    plant_display_name,
    job_role,
    hp_point,
    scenario_count,
    overall_rank,
    overall_top_percent,
    plant_rank,
    plant_top_percent,
    job_rank,
    job_top_percent,
    plant_job_rank,
    plant_job_top_percent,
    refreshed_at
  )
  select
    i.season_id,
    i.nickname,
    i.plant_display_name,
    i.player_job_role,
    i.season_hp,
    i.scenario_count,
    i.overall_rank,
    i.overall_top_percent,
    i.plant_rank,
    i.plant_top_percent,
    i.job_rank,
    i.job_top_percent,
    i.plant_job_rank,
    i.plant_job_top_percent,
    now()
  from private.v_season_scores_internal i
  join public.seasons s
    on s.id = i.season_id
  join public.profiles p
    on p.id = i.user_id
  where i.season_id = p_season_id
    and s.status = 'open'
    and now() >= s.starts_at
    and now() < s.ends_at
    and p.is_active = true
    and p.role = 'player';
end;
$$;

revoke all on function private.refresh_current_leaderboard_public(uuid)
from public, anon, authenticated;

create or replace function private.refresh_snapshot_leaderboard_public(
  p_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_season_id::text, 1)
  );

  delete from public.leaderboard_snapshot_public_rows
  where season_id = p_season_id;

  insert into public.leaderboard_snapshot_public_rows (
    season_id,
    scope_type,
    nickname,
    plant_display_name,
    job_role,
    hp_point,
    scenario_count,
    rank_position,
    top_percent,
    refreshed_at
  )
  select
    ls.season_id,
    ls.scope_type,
    ls.nickname,
    ls.plant_display_name,
    ls.player_job_role,
    ls.hp_point,
    ls.scenario_count,
    ls.rank_position,
    ls.top_percent,
    now()
  from public.leaderboard_snapshots ls
  where ls.season_id = p_season_id;
end;
$$;

revoke all on function private.refresh_snapshot_leaderboard_public(uuid)
from public, anon, authenticated;

create or replace function private.refresh_current_leaderboard_from_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' then
      perform private.refresh_current_leaderboard_public(old.season_id);
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'completed' then
      perform private.refresh_current_leaderboard_public(new.season_id);
    end if;
    return new;
  end if;

  if (
    old.status is distinct from new.status
    or old.hp_point is distinct from new.hp_point
    or old.completed_at is distinct from new.completed_at
    or old.plant_id is distinct from new.plant_id
    or old.player_job_role is distinct from new.player_job_role
  ) and (old.status = 'completed' or new.status = 'completed') then
    perform private.refresh_current_leaderboard_public(new.season_id);
    if old.season_id is distinct from new.season_id then
      perform private.refresh_current_leaderboard_public(old.season_id);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.refresh_current_leaderboard_from_session()
from public, anon, authenticated;

drop trigger if exists refresh_current_leaderboard_from_session
  on public.play_sessions;
create trigger refresh_current_leaderboard_from_session
after insert or update or delete
on public.play_sessions
for each row
execute function private.refresh_current_leaderboard_from_session();

create or replace function private.refresh_current_leaderboard_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season record;
begin
  if
    old.nickname is distinct from new.nickname
    or old.is_active is distinct from new.is_active
    or old.role is distinct from new.role
  then
    for v_season in
      select distinct ps.season_id
      from public.play_sessions ps
      join public.seasons s
        on s.id = ps.season_id
      where ps.user_id = new.id
        and ps.status = 'completed'
        and s.status = 'open'
    loop
      perform private.refresh_current_leaderboard_public(v_season.season_id);
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function private.refresh_current_leaderboard_from_profile()
from public, anon, authenticated;

drop trigger if exists refresh_current_leaderboard_from_profile
  on public.profiles;
create trigger refresh_current_leaderboard_from_profile
after update of nickname, is_active, role
on public.profiles
for each row
execute function private.refresh_current_leaderboard_from_profile();

create or replace function private.refresh_snapshot_leaderboard_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'closed' then
    perform private.refresh_snapshot_leaderboard_public(new.id);
    delete from public.leaderboard_current_public_rows
    where season_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.refresh_snapshot_leaderboard_on_close()
from public, anon, authenticated;

drop trigger if exists refresh_snapshot_leaderboard_on_close
  on public.seasons;
create trigger refresh_snapshot_leaderboard_on_close
after update of status
on public.seasons
for each row
execute function private.refresh_snapshot_leaderboard_on_close();

-- Backfill currently-open and already-closed seasons.
do $$
declare
  v_season record;
begin
  for v_season in
    select id
    from public.seasons
    where status = 'open'
  loop
    perform private.refresh_current_leaderboard_public(v_season.id);
  end loop;

  for v_season in
    select id
    from public.seasons
    where status = 'closed'
  loop
    perform private.refresh_snapshot_leaderboard_public(v_season.id);
  end loop;
end;
$$;

drop view if exists public.v_leaderboard_current_public;
drop view if exists public.v_leaderboard_snapshot_public;

comment on table public.leaderboard_current_public_rows is
  'Player-only current-season leaderboard projection. Omits user IDs, real names, decisions, endings, and learning metrics.';

comment on table public.leaderboard_snapshot_public_rows is
  'Player-only closed-season leaderboard projection. Omits user IDs, real names, decisions, endings, and learning metrics.';

commit;
