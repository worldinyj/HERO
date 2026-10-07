begin;

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
  and now() < s.ends_at
  and (select private.auth_role()) = 'player'
  and exists (
    select 1
    from public.profiles target_profile
    where target_profile.id = i.user_id
      and target_profile.is_active = true
      and target_profile.role = 'player'
  );

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
where s.status = 'closed'
  and (select private.auth_role()) = 'player';

comment on view public.v_leaderboard_current_public is
  'Player-only nickname leaderboard. Managers cannot read it because manager roster access would allow nickname-to-real-name score inference.';

comment on view public.v_leaderboard_snapshot_public is
  'Player-only closed-season nickname leaderboard. Manager reporting uses n>=5 aggregate functions instead of individual ranking rows.';

commit;
