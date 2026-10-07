begin;

drop policy if exists "play_sessions_owner_or_admin_read" on public.play_sessions;
create policy "play_sessions_owner_or_admin_read"
on public.play_sessions
for select
to authenticated
using (
  (
    user_id = (select auth.uid())
    and (select private.auth_role()) is not null
  )
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
        (
          ps.user_id = (select auth.uid())
          and (select private.auth_role()) is not null
        )
        or (select private.auth_role()) = 'admin'
      )
  )
);

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
  and (select private.auth_role()) is not null;

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
  and (select private.auth_role()) is not null;

comment on policy "play_sessions_owner_or_admin_read" on public.play_sessions is
  'Active users may read only their own sessions. Admins may read all sessions. Deactivated profiles are blocked.';

comment on view public.v_leaderboard_current_public is
  'Nickname-only public leaderboard for active HERO profiles. No real names, decisions, endings, or learning metrics.';

commit;
