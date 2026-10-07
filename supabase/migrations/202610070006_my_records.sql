begin;

create or replace function public.my_record_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_profile jsonb;
  v_metrics jsonb;
  v_scenarios jsonb;
  v_seasons jsonb;
  v_current jsonb;
begin
  if v_user is null or (select private.auth_role()) is null then
    raise exception 'authenticated_profile_required';
  end if;

  select jsonb_build_object(
    'nickname', p.nickname,
    'real_name', p.real_name,
    'job_role', p.job_role,
    'role', p.role,
    'team_name', p.team_name
  )
  into v_profile
  from public.profiles p
  where p.id = v_user
    and p.is_active = true;

  select jsonb_build_object(
    'safety', coalesce(round(avg((ps.metrics->>'safety')::numeric), 1), 0),
    'awareness', coalesce(round(avg((ps.metrics->>'awareness')::numeric), 1), 0),
    'communication', coalesce(round(avg((ps.metrics->>'communication')::numeric), 1), 0),
    'procedure', coalesce(round(avg((ps.metrics->>'procedure')::numeric), 1), 0),
    'challenge', coalesce(round(avg((ps.metrics->>'challenge')::numeric), 1), 0),
    'completed_sessions', count(*)
  )
  into v_metrics
  from public.play_sessions ps
  where ps.user_id = v_user
    and ps.status = 'completed'
    and ps.metrics is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'scenario_slug', row_data.slug,
        'title', row_data.title,
        'best_hp', row_data.best_hp,
        'play_count', row_data.play_count,
        'last_completed_at', row_data.last_completed_at
      )
      order by row_data.last_completed_at desc
    ),
    '[]'::jsonb
  )
  into v_scenarios
  from (
    select
      sc.slug,
      sc.title,
      max(ps.hp_point) as best_hp,
      count(*) as play_count,
      max(ps.completed_at) as last_completed_at
    from public.play_sessions ps
    join public.scenario_versions sv
      on sv.id = ps.scenario_version_id
    join public.scenarios sc
      on sc.id = sv.scenario_id
    where ps.user_id = v_user
      and ps.status = 'completed'
    group by sc.id, sc.slug, sc.title
  ) row_data;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'season_key', row_data.season_key,
        'title', row_data.title,
        'hp_point', row_data.season_hp,
        'scenario_count', row_data.scenario_count,
        'status', row_data.status,
        'starts_at', row_data.starts_at,
        'ends_at', row_data.ends_at
      )
      order by row_data.starts_at desc
    ),
    '[]'::jsonb
  )
  into v_seasons
  from (
    with best_per_scenario as (
      select
        ps.season_id,
        sv.scenario_id,
        max(ps.hp_point) as best_hp
      from public.play_sessions ps
      join public.scenario_versions sv
        on sv.id = ps.scenario_version_id
      where ps.user_id = v_user
        and ps.status = 'completed'
      group by ps.season_id, sv.scenario_id
    )
    select
      s.season_key,
      s.title,
      s.status,
      s.starts_at,
      s.ends_at,
      coalesce(sum(b.best_hp), 0)::bigint as season_hp,
      count(b.scenario_id)::bigint as scenario_count
    from public.seasons s
    join best_per_scenario b
      on b.season_id = s.id
    group by s.id, s.season_key, s.title, s.status, s.starts_at, s.ends_at
  ) row_data;

  select jsonb_build_object(
    'season_key', i.season_key,
    'season_title', i.season_title,
    'hp_point', i.season_hp,
    'scenario_count', i.scenario_count,
    'overall_rank', i.overall_rank,
    'overall_top_percent', i.overall_top_percent,
    'plant_rank', i.plant_rank,
    'job_rank', i.job_rank
  )
  into v_current
  from private.v_season_scores_internal i
  where i.user_id = v_user
  order by i.season_id desc
  limit 1;

  return jsonb_build_object(
    'profile', coalesce(v_profile, '{}'::jsonb),
    'metrics', coalesce(v_metrics, jsonb_build_object(
      'safety', 0,
      'awareness', 0,
      'communication', 0,
      'procedure', 0,
      'challenge', 0,
      'completed_sessions', 0
    )),
    'scenario_records', v_scenarios,
    'season_history', v_seasons,
    'current_season', v_current
  );
end;
$$;

revoke all on function public.my_record_summary() from public, anon;
grant execute on function public.my_record_summary() to authenticated;

comment on function public.my_record_summary() is
  'Returns only the authenticated user own learning records. Metrics are educational learning-behavior indicators, not personnel evaluation data.';

commit;
