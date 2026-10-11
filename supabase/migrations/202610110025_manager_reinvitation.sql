begin;

-- Re-entry invitations are bound to the existing manager's Auth identity.
alter table public.invitations add column target_profile_id uuid references public.profiles(id);
alter table public.invitations add constraint invitations_bound_manager_role
  check (target_profile_id is null or target_role = 'plant_manager');
create index invitations_target_profile_idx on public.invitations(target_profile_id)
  where target_profile_id is not null;

create or replace function public.reinvite_manager_atomic(
  p_actor_user_id uuid, p_profile_id uuid, p_token_hash text, p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_manager public.profiles%rowtype;
  v_plant_name text;
  v_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invitation_token_hash';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '8 days' then
    raise exception 'invalid_invitation_expiration';
  end if;
  perform 1 from public.profiles where id = p_actor_user_id and role = 'admin' and is_active for share;
  if not found then raise exception 'admin_required'; end if;
  -- Acquire the same lock before invitation rows in issuance/accept/reissue.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_profile_id::text, 0));
  select * into v_manager from public.profiles where id = p_profile_id for update;
  if not found or v_manager.role <> 'plant_manager' or not v_manager.is_active then
    raise exception 'active_manager_required';
  end if;
  select display_name into v_plant_name from public.plants
    where id = v_manager.plant_id and is_active for share;
  if not found then raise exception 'plant_inactive'; end if;

  -- Only prior unconsumed re-entry links for this identity are revoked.
  update public.invitations set canceled_at = now()
    where target_profile_id = p_profile_id and accepted_at is null and canceled_at is null;
  insert into public.invitations (
    token_hash, plant_id, target_role, invitee_name, team_name, created_by,
    expires_at, target_profile_id
  ) values (
    p_token_hash, v_manager.plant_id, 'plant_manager', v_manager.real_name,
    v_manager.team_name, p_actor_user_id, p_expires_at, p_profile_id
  ) returning id into v_id;
  insert into public.audit_logs(actor_user_id, plant_id, action, entity_type, entity_id, metadata)
    values (p_actor_user_id, v_manager.plant_id, 'manager.reinvited', 'invitation', v_id::text,
      jsonb_build_object('target_profile_id', p_profile_id));
  return jsonb_build_object('reissued', true, 'managerProfileId', p_profile_id,
    'invitationId', v_id, 'expiresAt', p_expires_at, 'plantDisplayName', v_plant_name);
end;
$$;
revoke all on function public.reinvite_manager_atomic(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reinvite_manager_atomic(uuid, uuid, text, timestamptz) to service_role;


create or replace function public.accept_invitation_atomic(
  p_token_hash text,
  p_user_id uuid,
  p_nickname text,
  p_terms_at timestamptz,
  p_privacy_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
  v_profile public.profiles%rowtype;
  v_bound_profile uuid;
begin
  select target_profile_id into v_bound_profile from public.invitations where token_hash = p_token_hash;
  if v_bound_profile is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_bound_profile::text, 0));
  end if;
  select *
    into v_inv
  from public.invitations
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invitation_not_found';
  end if;

  if v_inv.canceled_at is not null then
    raise exception 'invitation_canceled';
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'invitation_already_used';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired';
  end if;

  if v_inv.target_role = 'admin' then
    raise exception 'admin_invitation_not_allowed';
  end if;

  if v_inv.target_profile_id is not null and v_inv.target_profile_id <> p_user_id then
    raise exception 'invitation_account_mismatch';
  end if;

  select *
    into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if v_inv.target_profile_id is not null then
    if not found or not v_profile.is_active or v_profile.role <> 'plant_manager'
       or v_profile.plant_id is distinct from v_inv.plant_id then
      raise exception 'active_manager_required';
    end if;
    -- Re-entry consumes the invitation but preserves all existing profile data,
    -- nickname, consent timestamps, role and education history.
  elsif found and v_profile.is_active then
    if v_profile.plant_id is distinct from v_inv.plant_id then
      raise exception 'active_cross_plant_profile';
    end if;

    if v_profile.role is distinct from v_inv.target_role then
      raise exception 'active_role_conflict';
    end if;

    update public.profiles
    set real_name = v_inv.invitee_name,
        nickname = p_nickname,
        job_role = v_inv.job_role,
        team_name = v_inv.team_name,
        accepted_terms_at = p_terms_at,
        accepted_privacy_at = p_privacy_at,
        updated_at = now()
    where id = p_user_id;
  elsif found then
    update public.profiles
    set plant_id = v_inv.plant_id,
        role = v_inv.target_role,
        job_role = v_inv.job_role,
        real_name = v_inv.invitee_name,
        nickname = p_nickname,
        team_name = v_inv.team_name,
        is_active = true,
        accepted_terms_at = p_terms_at,
        accepted_privacy_at = p_privacy_at,
        updated_at = now()
    where id = p_user_id;
  else
    insert into public.profiles (
      id,
      plant_id,
      role,
      job_role,
      real_name,
      nickname,
      team_name,
      is_active,
      accepted_terms_at,
      accepted_privacy_at
    )
    values (
      p_user_id,
      v_inv.plant_id,
      v_inv.target_role,
      v_inv.job_role,
      v_inv.invitee_name,
      p_nickname,
      v_inv.team_name,
      true,
      p_terms_at,
      p_privacy_at
    );
  end if;

  update public.invitations
  set accepted_at = now(),
      accepted_by = p_user_id
  where id = v_inv.id;

  insert into public.audit_logs (
    actor_user_id,
    plant_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_user_id,
    v_inv.plant_id,
    'invitation.accepted',
    'invitation',
    v_inv.id::text,
    jsonb_build_object(
      'target_role', v_inv.target_role,
      'job_role', v_inv.job_role
    )
  );

  return jsonb_build_object(
    'profile_id', p_user_id,
    'plant_id', v_inv.plant_id,
    'role', v_inv.target_role,
    'job_role', v_inv.job_role
  );
end;
$$;

revoke all on function public.accept_invitation_atomic(text, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.accept_invitation_atomic(text, uuid, text, timestamptz, timestamptz)
  to service_role;


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
  v_bound_profile uuid;
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

  select target_profile_id into v_bound_profile from public.invitations where id = p_invitation_id;
  if v_bound_profile is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_bound_profile::text, 0));
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
    team_name, created_by, expires_at, target_profile_id
  )
  values (
    p_token_hash, v_original.plant_id, v_original.target_role,
    v_original.invitee_name,
    case when v_original.target_role = 'player' then v_original.job_role else null end,
    v_original.team_name, p_actor_user_id, p_expires_at, v_original.target_profile_id
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
