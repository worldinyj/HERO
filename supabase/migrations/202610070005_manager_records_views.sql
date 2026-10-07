begin;

create or replace view public.v_manager_participation
with (security_barrier = true)
as
with active_season as (
  select id
  from public.seasons
  where status = 'open'
    and now() >= starts_at
    and now() < ends_at
  order by starts_at desc
  limit 1
)
select
  p.id as profile_id,
  p.plant_id,
  p.real_name,
  p.nickname,
  p.job_role,
  p.team_name,
  p.is_active,
  count(distinct sv.scenario_id) filter (
    where ps.status = 'completed'
  )::integer as completed_scenario_count,
  max(coalesce(ps.completed_at, ps.started_at)) as last_activity_at
from public.profiles p
left join active_season s
  on true
left join public.play_sessions ps
  on ps.user_id = p.id
 and ps.season_id = s.id
left join public.scenario_versions sv
  on sv.id = ps.scenario_version_id
where p.role = 'player'
  and (
    (select private.auth_role()) = 'admin'
    or (
      (select private.auth_role()) = 'plant_manager'
      and p.plant_id = (select private.auth_plant())
    )
  )
group by
  p.id,
  p.plant_id,
  p.real_name,
  p.nickname,
  p.job_role,
  p.team_name,
  p.is_active;

revoke all on public.v_manager_participation from public, anon;
grant select on public.v_manager_participation to authenticated;

create or replace view public.v_manager_participation_aggregate
with (security_barrier = true)
as
select
  plant_id,
  job_role,
  count(*)::integer as participant_count,
  count(*) filter (
    where completed_scenario_count > 0
  )::integer as completed_user_count,
  round(
    100.0 *
    count(*) filter (where completed_scenario_count > 0) /
    nullif(count(*), 0),
    1
  ) as completion_rate_percent,
  sum(completed_scenario_count)::integer as completed_scenario_total
from public.v_manager_participation
where is_active = true
group by plant_id, job_role
having count(*) >= 5;

revoke all on public.v_manager_participation_aggregate from public, anon;
grant select on public.v_manager_participation_aggregate to authenticated;

create or replace view public.v_my_season_records
with (security_barrier = true)
as
with attempts as (
  select
    ps.season_id,
    sv.scenario_id,
    count(*)::integer as attempt_count,
    max(ps.completed_at) as last_completed_at
  from public.play_sessions ps
  join public.scenario_versions sv
    on sv.id = ps.scenario_version_id
  where ps.user_id = (select auth.uid())
    and ps.status = 'completed'
  group by ps.season_id, sv.scenario_id
),
best as (
  select distinct on (ps.season_id, sv.scenario_id)
    ps.season_id,
    sv.scenario_id,
    ps.id as session_id,
    ps.hp_point,
    ps.ending,
    ps.metrics,
    ps.completed_at
  from public.play_sessions ps
  join public.scenario_versions sv
    on sv.id = ps.scenario_version_id
  where ps.user_id = (select auth.uid())
    and ps.status = 'completed'
    and ps.hp_point is not null
  order by
    ps.season_id,
    sv.scenario_id,
    ps.hp_point desc,
    ps.completed_at desc,
    ps.id desc
)
select
  s.id as season_id,
  s.season_key,
  s.title as season_title,
  s.status as season_status,
  sc.slug as scenario_slug,
  sc.title as scenario_title,
  b.session_id as best_session_id,
  b.hp_point as best_hp_point,
  b.ending as best_ending,
  b.metrics as best_metrics,
  a.attempt_count,
  a.last_completed_at
from best b
join attempts a
  on a.season_id = b.season_id
 and a.scenario_id = b.scenario_id
join public.seasons s
  on s.id = b.season_id
join public.scenarios sc
  on sc.id = b.scenario_id;

revoke all on public.v_my_season_records from public, anon;
grant select on public.v_my_season_records to authenticated;

commit;
