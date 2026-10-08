begin;

-- Cancellation and its audit record must commit together. This function uses
-- the same invitations row lock as accept_invitation_atomic (002) and
-- reissue_invitation_atomic (017), so overlapping requests serialize.
create or replace function public.cancel_invitation_atomic(
  p_invitation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.app_role;
  v_actor_plant uuid;
  v_invitation public.invitations%rowtype;
  v_canceled_at timestamptz;
begin
  select p.role, p.plant_id
    into v_actor_role, v_actor_plant
  from public.profiles p
  where p.id = p_actor_user_id
    and p.is_active = true;

  if not found or v_actor_role not in ('admin', 'plant_manager') then
    raise exception 'manager_or_admin_required';
  end if;

  -- Any accept/reissue/cancel transaction locks this same row.
  select * into v_invitation
  from public.invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  -- Re-authorize in the DB even if the Edge precheck passed earlier.
  if v_actor_role = 'admin' then
    if v_invitation.target_role <> 'plant_manager' then
      raise exception 'admin_invitation_scope_violation';
    end if;
  elsif v_actor_plant is null
     or v_invitation.target_role <> 'player'
     or v_invitation.plant_id is distinct from v_actor_plant then
    raise exception 'manager_scope_violation';
  end if;

  if v_invitation.accepted_at is not null then
    raise exception 'invitation_already_accepted';
  end if;

  if v_invitation.canceled_at is not null then
    raise exception 'invitation_already_canceled';
  end if;

  v_canceled_at := now();

  update public.invitations
  set canceled_at = v_canceled_at
  where id = v_invitation.id;

  insert into public.audit_logs (
    actor_user_id, plant_id, action, entity_type, entity_id, metadata
  ) values (
    p_actor_user_id,
    v_invitation.plant_id,
    'invitation.canceled',
    'invitation',
    v_invitation.id::text,
    jsonb_build_object(
      'target_role', v_invitation.target_role,
      'invitee_name', v_invitation.invitee_name,
      'job_role', v_invitation.job_role,
      'operator_role', v_actor_role
    )
  );

  return jsonb_build_object(
    'canceled', true,
    'invitationId', v_invitation.id,
    'canceledAt', v_canceled_at
  );
end;
$$;

revoke all on function public.cancel_invitation_atomic(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_invitation_atomic(uuid, uuid)
  to service_role;

comment on function public.cancel_invitation_atomic(uuid, uuid) is
  'Service-role-only atomic cancellation: lock invitation, re-authorize actor/plant and write cancellation + audit in one transaction.';

commit;
