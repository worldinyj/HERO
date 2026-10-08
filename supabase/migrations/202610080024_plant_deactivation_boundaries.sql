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

revoke all on function private.guard_active_plant_invitation() from public,anon,authenticated;
revoke all on function private.guard_active_plant_profile() from public,anon,authenticated;
revoke all on function private.guard_active_plant_session() from public,anon,authenticated;

comment on column public.plants.invitation_epoch is
  'Incremented on every active-to-inactive transition; prevents old links reviving on reactivation.';
comment on column public.invitations.plant_invitation_epoch is
  'Snapshot of plant invitation epoch at issuance; mismatches are permanently revoked.';
commit;
