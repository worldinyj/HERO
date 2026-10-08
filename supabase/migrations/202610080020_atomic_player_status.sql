begin;

-- Player activation and its immutable audit event must commit or roll back
-- together. Serialize opposing requests by locking the target profile.
-- Called only through the service-role Edge Function; database authorization
-- rechecks a live, active plant manager and their own-plant Player scope.
create or replace function public.set_player_active_atomic(
  p_actor_user_id uuid,
  p_profile_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  if p_is_active is null then
    raise exception 'profile_id_and_active_required';
  end if;

  select * into v_actor
  from public.profiles
  where id = p_actor_user_id
    and role = 'plant_manager'
    and is_active = true;

  if not found or v_actor.plant_id is null then
    raise exception 'plant_manager_required';
  end if;

  -- Even an idempotent response must not disclose/manage Player state while
  -- the plant is suspended. Lock this plant before checking target profile.
  perform 1 from public.plants
  where id = v_actor.plant_id and is_active = true
  for share;
  if not found then
    raise exception 'plant_inactive';
  end if;

  select * into v_target
  from public.profiles
  where id = p_profile_id
  for update;

  if not found
     or v_target.role <> 'player'
     or v_target.plant_id is distinct from v_actor.plant_id then
    raise exception 'player_not_found';
  end if;

  -- An idempotent request does not create another audit event.
  if v_target.is_active = p_is_active then
    return jsonb_build_object(
      'changed', false,
      'profileId', v_target.id,
      'isActive', v_target.is_active
    );
  end if;

  update public.profiles
  set is_active = p_is_active,
      updated_at = now()
  where id = v_target.id;

  -- A failure here undoes the UPDATE (including any leaderboard triggers).
  insert into public.audit_logs (
    actor_user_id, plant_id, action, entity_type, entity_id, metadata
  ) values (
    p_actor_user_id,
    v_target.plant_id,
    case when p_is_active
      then 'player.reactivated'
      else 'player.deactivated'
    end,
    'profile',
    v_target.id::text,
    jsonb_build_object(
      'real_name', v_target.real_name,
      'nickname', v_target.nickname
    )
  );

  return jsonb_build_object(
    'changed', true,
    'profileId', v_target.id,
    'isActive', p_is_active
  );
end;
$$;

revoke all on function public.set_player_active_atomic(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_player_active_atomic(uuid, uuid, boolean)
  to service_role;

comment on function public.set_player_active_atomic(uuid, uuid, boolean) is
  'Service-role-only: lock same-plant Player profile and atomically update status with an immutable audit event; no-op is not reaudited.';

commit;
