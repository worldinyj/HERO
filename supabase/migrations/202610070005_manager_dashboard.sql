begin;

create or replace function public.manager_participation_rows()
returns table (
  profile_id uuid,
  real_name text,
  nickname text,
  job_role public.job_role,
  team_name text,
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
    and p.is_active = true
  group by p.id, p.real_name, p.nickname, p.job_role, p.team_name
  order by p.real_name, p.nickname;
end;
$$;

create or replace function public.manager_pending_invites()
returns table (
  invitation_id uuid,
  invitee_name text,
  job_role public.job_role,
  team_name text,
  expires_at timestamptz,
  created_at timestamptz
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
    i.id,
    i.invitee_name,
    i.job_role,
    i.team_name,
    i.expires_at,
    i.created_at
  from public.invitations i
  where i.plant_id = v_plant
    and i.target_role = 'player'
    and i.accepted_at is null
    and i.canceled_at is null
    and i.expires_at > now()
  order by i.created_at desc;
end;
$$;

create or replace function public.manager_job_aggregates()
returns table (
  job_role public.job_role,
  participant_count bigint,
  completed_user_count bigint,
  completed_session_count bigint
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
  with player_stats as (
    select
      p.id,
      p.job_role,
      count(ps.id) filter (where ps.status = 'completed') as completed_sessions
    from public.profiles p
    left join public.play_sessions ps
      on ps.user_id = p.id
     and ps.plant_id = v_plant
    where p.plant_id = v_plant
      and p.role = 'player'
      and p.is_active = true
      and p.job_role is not null
    group by p.id, p.job_role
  )
  select
    s.job_role,
    count(*) as participant_count,
    count(*) filter (where s.completed_sessions > 0) as completed_user_count,
    sum(s.completed_sessions)::bigint as completed_session_count
  from player_stats s
  group by s.job_role
  having count(*) >= 5
  order by s.job_role;
end;
$$;

revoke all on function public.manager_participation_rows() from public, anon;
revoke all on function public.manager_pending_invites() from public, anon;
revoke all on function public.manager_job_aggregates() from public, anon;

grant execute on function public.manager_participation_rows() to authenticated;
grant execute on function public.manager_pending_invites() to authenticated;
grant execute on function public.manager_job_aggregates() to authenticated;

comment on function public.manager_participation_rows() is
  'Manager-only participation view. Intentionally excludes HP, ending, metrics, and decision logs.';

comment on function public.manager_job_aggregates() is
  'Manager-only aggregate participation stats. Groups with fewer than five active players are suppressed.';

commit;
