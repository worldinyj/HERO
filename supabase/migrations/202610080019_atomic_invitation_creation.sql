begin;

-- Atomic issuance is required for one-time URLs: never persist a usable
-- invitation without its audit event. Caller generates token and URL before
-- invoking this service-only database function; only the digest is stored.
create or replace function public.create_invitation_atomic(
  p_actor_user_id uuid,
  p_plant_id uuid,
  p_target_role public.app_role,
  p_invitee_name text,
  p_job_role public.job_role,
  p_team_name text,
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
  v_plant_name text;
  v_invitation_id uuid;
  v_name text := nullif(btrim(p_invitee_name), '');
  v_team text := nullif(btrim(p_team_name), '');
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invitation_token_hash';
  end if;
  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '8 days' then
    raise exception 'invalid_invitation_expiration';
  end if;
  if v_name is null or char_length(v_name) > 100 then
    raise exception 'invalid_invitee_name';
  end if;
  if v_team is not null and char_length(v_team) > 100 then
    raise exception 'invalid_team_name';
  end if;

  select role, plant_id into v_actor_role, v_actor_plant
  from public.profiles
  where id = p_actor_user_id and is_active = true;

  if not found or v_actor_role not in ('admin', 'plant_manager') then
    raise exception 'manager_or_admin_required';
  end if;

  if v_actor_role = 'admin' then
    if p_target_role is distinct from 'plant_manager' then
      raise exception 'admin_can_only_invite_manager';
    end if;
  elsif v_actor_plant is null
     or p_plant_id is distinct from v_actor_plant
     or p_target_role is distinct from 'player' then
    raise exception 'manager_scope_violation';
  end if;

  if p_target_role = 'player' and p_job_role is null then
    raise exception 'job_role_required';
  end if;
  if p_target_role = 'plant_manager' and p_job_role is not null then
    raise exception 'manager_job_role_forbidden';
  end if;

  -- Lock the plant against an overlapping administrative deactivation.
  select display_name into v_plant_name
  from public.plants
  where id = p_plant_id and is_active = true
  for share;

  if not found then
    raise exception 'plant_not_found';
  end if;

  insert into public.invitations (
    token_hash, plant_id, target_role, invitee_name,
    job_role, team_name, created_by, expires_at
  ) values (
    p_token_hash, p_plant_id, p_target_role, v_name,
    p_job_role, v_team, p_actor_user_id, p_expires_at
  ) returning id into v_invitation_id;

  insert into public.audit_logs (
    actor_user_id, plant_id, action, entity_type, entity_id, metadata
  ) values (
    p_actor_user_id, p_plant_id,
    'invitation.created', 'invitation', v_invitation_id::text,
    jsonb_build_object(
      'target_role', p_target_role,
      'job_role', p_job_role
    )
  );

  return jsonb_build_object(
    'invitationId', v_invitation_id,
    'expiresAt', p_expires_at,
    'plantDisplayName', v_plant_name
  );
end;
$$;

revoke all on function public.create_invitation_atomic(
  uuid, uuid, public.app_role, text, public.job_role, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.create_invitation_atomic(
  uuid, uuid, public.app_role, text, public.job_role, text, text, timestamptz
) to service_role;

comment on function public.create_invitation_atomic(
  uuid, uuid, public.app_role, text, public.job_role, text, text, timestamptz
) is 'Service-only atomic invitation issuance with DB role/scope reauthorization; token digest plus audit record commit together.';

commit;
