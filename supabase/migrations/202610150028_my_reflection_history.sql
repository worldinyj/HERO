begin;

create index if not exists play_sessions_owner_completed_history_idx
on public.play_sessions(user_id, completed_at desc, id desc)
where status = 'completed' and completed_at is not null;

-- No user-id argument: even administrators only read their own history here.
-- Exact version content remains readable through this narrow projection after archival.
create or replace function public.my_reflection_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user is null or not exists (
    select 1 from public.profiles p where p.id = v_user and p.is_active = true
  ) then
    raise exception 'authenticated_profile_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id', h.id,
    'title', coalesce(h.content->>'title', h.title),
    'scenario_version', h.version,
    'season_title', h.season_title,
    'completed_at', h.completed_at,
    'hp_point', h.hp_point,
    'ending', h.ending,
    'reflection_state', case
      when h.selection is null then 'not_recorded'
      when h.reflection_label is null then 'unavailable'
      else 'available' end,
    'reflection_label', h.reflection_label
  ) order by h.completed_at desc, h.id desc), '[]'::jsonb)
  into v_result
  from (
    select recent.*, case
      when recent.selection = 'initial_conditions' then '상황이 시작되기 전부터'
      when recent.content->'nodes'->recent.selection->>'type' = 'decision'
        and exists (select 1 from public.session_decisions d
          where d.session_id = recent.id and d.node_id = recent.selection and d.action_type = 'choice')
      then nullif(recent.content->'nodes'->recent.selection->>'prompt', '')
      else null end as reflection_label
    from (
      select ps.id, ps.completed_at, ps.hp_point, ps.ending,
        sc.title, sv.version, sv.content, se.title as season_title,
        case when jsonb_typeof(ps.evaluation->'reflectionSelection') = 'string'
          then nullif(ps.evaluation->>'reflectionSelection', '') else null end as selection
      from public.play_sessions ps
      join public.scenario_versions sv on sv.id = ps.scenario_version_id
      join public.scenarios sc on sc.id = sv.scenario_id
      join public.seasons se on se.id = ps.season_id
      where ps.user_id = v_user and ps.status = 'completed' and ps.completed_at is not null
      order by ps.completed_at desc, ps.id desc
      limit 20
    ) recent
  ) h;
  return v_result;
end;
$$;

revoke all on function public.my_reflection_history() from public, anon;
grant execute on function public.my_reflection_history() to authenticated;
comment on function public.my_reflection_history() is
  'Read-only latest 20 own completed sessions; active owners retain personal history during plant suspension. Only exact-version reflection labels are projected, never scenario content or foreign records.';

commit;
