begin;

create or replace function public.manager_player_rows()
returns table (
  profile_id uuid,
  real_name text,
  nickname text,
  job_role public.job_role,
  team_name text,
  is_active boolean,
  completed_scenarios bigint,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plant uuid;
begin
  if (select private.auth_role()) <> 'plant_manager' then
    raise exception 'plant_manager_required';
  end if;

  v_plant := (select private.auth_plant());

  return query
  select
    p.id,
    p.real_name,
    p.nickname,
    p.job_role,
    p.team_name,
    p.is_active,
    count(distinct sv.scenario_id) filter (where ps.status = 'completed') as completed_scenarios,
    max(coalesce(ps.completed_at, ps.started_at)) as last_activity_at
  from public.profiles p
  left join public.play_sessions ps
    on ps.user_id = p.id
   and ps.plant_id = v_plant
  left join public.scenario_versions sv
    on sv.id = ps.scenario_version_id
  where p.plant_id = v_plant
    and p.role = 'player'
  group by
    p.id,
    p.real_name,
    p.nickname,
    p.job_role,
    p.team_name,
    p.is_active
  order by p.is_active desc, p.real_name, p.nickname;
end;
$$;

revoke all on function public.manager_player_rows() from public, anon;
grant execute on function public.manager_player_rows() to authenticated;

comment on function public.manager_player_rows() is
  'Manager-only player administration list. Excludes HP, endings, metrics, and decision logs.';

commit;
