begin;

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
begin
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

  select *
    into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if found and v_profile.is_active then
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

commit;
