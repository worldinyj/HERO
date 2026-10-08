begin;

-- Plant deactivation is a reversible training freeze, not data deletion.
-- Epoch rotation permanently revokes previously issued invite tokens, while
-- preserving invitation, play-session and audit history.
alter table public.plants
  add column if not exists invitation_epoch bigint not null default 0
  check (invitation_epoch >= 0);
alter table public.invitations
  add column if not exists plant_invitation_epoch bigint not null default 0
  check (plant_invitation_epoch >= 0);

-- Existing inactive plants may have pending invitations issued before this
-- epoch column existed. Those rows are assigned epoch 0 by ADD COLUMN.
-- Backfill the inactive plant epoch to 1 before any reactivation; otherwise
-- an old link could become usable again without a new invitation being issued.
-- Active plants retain epoch 0 so their legitimate invitations keep working.
-- No user-entered status or audit event is rewritten by this backfill.
update public.plants
set invitation_epoch = 1
where is_active = false and invitation_epoch = 0;

create or replace function public.set_plant_active_atomic(
  p_actor_user_id uuid, p_plant_id uuid, p_is_active boolean
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_plant public.plants%rowtype;
  v_new_epoch bigint;
  v_pending_count bigint := 0;
begin
  perform 1 from public.profiles where id=p_actor_user_id
    and role='admin' and is_active=true for share;
  if not found then raise exception 'admin_required'; end if;
  if p_is_active is null then raise exception 'plant_status_required'; end if;

  select * into v_plant from public.plants where id=p_plant_id for update;
  if not found then raise exception 'plant_not_found'; end if;
  if v_plant.is_active = p_is_active then
    return jsonb_build_object('changed',false,'plantId',v_plant.id,
      'isActive',v_plant.is_active,'invitationEpoch',v_plant.invitation_epoch);
  end if;

  if p_is_active=false then
    select count(*) into v_pending_count from public.invitations
      where plant_id=p_plant_id and accepted_at is null
        and canceled_at is null and expires_at>now();
  end if;

  update public.plants
  set is_active=p_is_active,
      invitation_epoch = invitation_epoch + case when p_is_active=false then 1 else 0 end,
      updated_at=now()
  where id=v_plant.id
  returning invitation_epoch into v_new_epoch;

  insert into public.audit_logs(
    actor_user_id,plant_id,action,entity_type,entity_id,metadata
  ) values (
    p_actor_user_id,v_plant.id,'plant.active_changed','plant',v_plant.id::text,
    jsonb_build_object('previous_active',v_plant.is_active,
      'new_active',p_is_active,'code',v_plant.code,
      'previous_invitation_epoch',v_plant.invitation_epoch,
      'new_invitation_epoch',v_new_epoch,
      'pending_invites_invalidated',v_pending_count)
  );

  return jsonb_build_object('changed',true,'plantId',v_plant.id,
    'isActive',p_is_active,'invitationEpoch',v_new_epoch);
end;
$$;

-- RLS: inactive plant operators have no active plant-wide scope. Personal
-- history remains readable under its independent owner SELECT policies.
create or replace function private.auth_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  left join public.plants pl on pl.id=p.plant_id
  where p.id=(select auth.uid()) and p.is_active=true
    and (p.role='admin' or pl.is_active=true)
$$;

create or replace function private.auth_plant()
returns uuid language sql stable security definer set search_path = ''
as $$
  select p.plant_id from public.profiles p
  join public.plants pl on pl.id=p.plant_id
  where p.id=(select auth.uid()) and p.is_active=true and pl.is_active=true
$$;

-- The trigger locks the plant row in the same transaction. It serializes
-- newly issued/accepted invitations against an Admin deactivation. Existing
-- accepted history and explicit cancellation are intentionally unaffected.
create or replace function private.guard_active_plant_invitation()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_active boolean;
  v_epoch bigint;
begin
  if tg_op='INSERT' then
    -- No OLD row exists in an INSERT trigger.
    null;
  elsif new.accepted_at is not distinct from old.accepted_at
      or new.accepted_at is null then
    return new;
  end if;
  if tg_op='INSERT' or new.accepted_at is not null then
    select is_active,invitation_epoch into v_active,v_epoch
    from public.plants where id=new.plant_id for share;
    if not found or v_active is distinct from true then
      raise exception 'plant_inactive';
    end if;
    if tg_op='INSERT' then
      new.plant_invitation_epoch := v_epoch;
    elsif new.plant_invitation_epoch <> v_epoch then
      raise exception 'plant_invitation_revoked';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists invitations_active_plant_guard on public.invitations;
create trigger invitations_active_plant_guard
  before insert or update of accepted_at on public.invitations
  for each row execute function private.guard_active_plant_invitation();

-- Defensive DB boundary: prevents a service-key function from mutating a
-- Player inside a deactivated plant even if Edge authorization raced.
create or replace function private.guard_active_plant_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_active boolean;
begin
  if new.role <> 'admin' then
    select is_active into v_active from public.plants
      where id=new.plant_id for share;
    if not found or v_active is distinct from true then
      raise exception 'plant_inactive';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_active_plant_guard on public.profiles;
create trigger profiles_active_plant_guard
  before insert or update of nickname,is_active,plant_id,role on public.profiles
  for each row execute function private.guard_active_plant_profile();

-- No new session or completion while plant disabled. In-progress rows and
-- completed history are not marked abandoned or removed on deactivation.
create or replace function private.guard_active_plant_session()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_active boolean;
begin
  if tg_op='UPDATE' then
    if new.status <> 'completed' or new.status is not distinct from old.status then
      return new;
    end if;
  end if;
  if tg_op='INSERT' or new.status='completed' then
    select is_active into v_active from public.plants
      where id=new.plant_id for share;
    if not found or v_active is distinct from true then
      raise exception 'plant_inactive';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists play_sessions_active_plant_guard on public.play_sessions;
create trigger play_sessions_active_plant_guard
  before insert or update of status on public.play_sessions
  for each row execute function private.guard_active_plant_session();


-- Suspending a plant removes organization-wide scope, but an active account
-- must retain read-only access to its own historic learning records.
-- Inactive profiles remain blocked; other users are never exposed.
drop policy if exists "play_sessions_owner_or_admin_read" on public.play_sessions;
create policy "play_sessions_owner_or_admin_read"
on public.play_sessions for select to authenticated
using (
  (
    user_id = (select auth.uid()) and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_active = true
    )
  ) or (select private.auth_role()) = 'admin'
);

drop policy if exists "session_decisions_owner_or_admin_read" on public.session_decisions;
create policy "session_decisions_owner_or_admin_read"
on public.session_decisions for select to authenticated
using (
  exists (
    select 1 from public.play_sessions ps
    where ps.id = session_decisions.session_id and (
      (
        ps.user_id = (select auth.uid()) and exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.is_active = true
        )
      ) or (select private.auth_role()) = 'admin'
    )
  )
);

comment on policy "play_sessions_owner_or_admin_read" on public.play_sessions is
  'Active profile owners retain read-only personal history during plant suspension; Admin can read all. Inactive profiles and foreign owners cannot.';
comment on policy "session_decisions_owner_or_admin_read" on public.session_decisions is
  'Active profile owner can read their own historic decisions during suspension; no organization-wide access is granted.';

-- This service-definer summary already filters every learning metric by
-- auth.uid(). Use profile activity instead of organization activity as
-- read-only eligibility. Mutation APIs still reject suspended plants.
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
  if v_user is null or not exists (
    select 1 from public.profiles p
    where p.id = v_user and p.is_active = true
  ) then
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

  -- Only the currently open season is "current": UUID sorting is not a date.
  -- Join season metadata explicitly; the private ranking view has no
  -- season_key or season_title columns. This also works before first play.
  select jsonb_build_object(
    'season_key', s.season_key,
    'season_title', s.title,
    'hp_point', coalesce(i.season_hp, 0),
    'scenario_count', coalesce(i.scenario_count, 0),
    'overall_rank', i.overall_rank,
    'overall_top_percent', i.overall_top_percent,
    'plant_rank', i.plant_rank,
    'job_rank', i.job_rank
  )
  into v_current
  from public.seasons s
  left join private.v_season_scores_internal i
    on i.season_id = s.id
   and i.user_id = v_user
  where s.status = 'open'
    and now() >= s.starts_at
    and now() < s.ends_at
  order by s.starts_at desc, s.id
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


-- Return actionable pending invitations only. Revoked epochs are preserved
-- in the audit database but must never appear in Manager action lists.
create or replace function public.manager_pending_invites()
returns table (
  invitation_id uuid, invitee_name text, job_role public.job_role,
  team_name text, expires_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_plant uuid;
begin
  if (select private.auth_role()) <> 'plant_manager' then
    raise exception 'plant_manager_required';
  end if;
  v_plant := (select private.auth_plant());
  return query
  select i.id,i.invitee_name,i.job_role,i.team_name,i.expires_at,i.created_at
  from public.invitations i
  join public.plants pl on pl.id=i.plant_id
  where i.plant_id=v_plant
    and pl.is_active=true
    and i.plant_invitation_epoch=pl.invitation_epoch
    and i.target_role='player'
    and i.accepted_at is null and i.canceled_at is null
    and i.expires_at>now()
  order by i.created_at desc;
end;
$$;

revoke all on function private.guard_active_plant_invitation() from public,anon,authenticated;
revoke all on function private.guard_active_plant_profile() from public,anon,authenticated;
revoke all on function private.guard_active_plant_session() from public,anon,authenticated;

comment on column public.plants.invitation_epoch is
  'Incremented on every active-to-inactive transition; prevents old links reviving on reactivation.';
comment on column public.invitations.plant_invitation_epoch is
  'Snapshot of plant invitation epoch at issuance; mismatches are permanently revoked.';
commit;
