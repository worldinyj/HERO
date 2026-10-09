begin;

-- A single DB statement must own cancellation, replacement creation, and
-- audit records. Row locking serializes competing reissues/acceptances:
-- an INSERT/audit failure rolls back cancellation with the entire statement.
--
-- Only the Edge Function's service_role may call this API. Never hand the
-- service key to a browser; actor identity and plant scope are revalidated
-- from authoritative profiles/invitations within this transaction.
create or replace function public.reissue_invitation_atomic(
  p_invitation_id uuid,
  p_actor_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.app_role;
  v_actor_plant uuid;
  v_original public.invitations%rowtype;
  v_new_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invitation_token_hash';
  end if;

  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '8 days' then
    raise exception 'invalid_invitation_expiration';
  end if;

  select role, plant_id into v_actor_role, v_actor_plant
  from public.profiles
  where id = p_actor_user_id and is_active = true;

  if not found or v_actor_role not in ('admin', 'plant_manager') then
    raise exception 'manager_or_admin_required';
  end if;

  -- Keep this lock until audit and replacement INSERT both succeed.
  select * into v_original
  from public.invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  if v_original.accepted_at is not null then
    raise exception 'invitation_already_accepted';
  end if;

  if v_original.canceled_at is not null then
    raise exception 'invitation_already_canceled';
  end if;

  if v_actor_role = 'admin' then
    if v_original.target_role <> 'plant_manager' then
      raise exception 'admin_invitation_scope_violation';
    end if;
  elsif v_actor_plant is null
        or v_original.target_role <> 'player'
        or v_original.plant_id is distinct from v_actor_plant then
    raise exception 'manager_scope_violation';
  end if;

  update public.invitations
  set canceled_at = now()
  where id = v_original.id;

  insert into public.invitations (
    token_hash, plant_id, target_role, invitee_name, job_role,
    team_name, created_by, expires_at
  )
  values (
    p_token_hash, v_original.plant_id, v_original.target_role,
    v_original.invitee_name,
    case when v_original.target_role = 'player' then v_original.job_role else null end,
    v_original.team_name, p_actor_user_id, p_expires_at
  )
  returning id into v_new_id;

  insert into public.audit_logs (
    actor_user_id, plant_id, action, entity_type, entity_id, metadata
  )
  values
  (
    p_actor_user_id, v_original.plant_id,
    'invitation.canceled_for_reissue', 'invitation', v_original.id::text,
    jsonb_build_object(
      'replacement_invitation_id', v_new_id,
      'operator_role', v_actor_role
    )
  ),
  (
    p_actor_user_id, v_original.plant_id,
    'invitation.reissued', 'invitation', v_new_id::text,
    jsonb_build_object(
      'replaced_invitation_id', v_original.id,
      'target_role', v_original.target_role,
      'job_role', v_original.job_role,
      'operator_role', v_actor_role
    )
  );

  return jsonb_build_object(
    'reissued', true,
    'oldInvitationId', v_original.id,
    'invitationId', v_new_id,
    'expiresAt', p_expires_at
  );
end;
$$;

revoke all on function public.reissue_invitation_atomic(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reissue_invitation_atomic(uuid, uuid, text, timestamptz)
  to service_role;

comment on function public.reissue_invitation_atomic(uuid, uuid, text, timestamptz) is
  'Service-role only: transactionally reissue a scoped invitation, locking the old row and atomically writing cancellation, replacement and both audit events.';

commit;
