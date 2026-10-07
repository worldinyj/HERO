begin;

create or replace function private.bootstrap_initial_admin(
  p_user_id uuid,
  p_real_name text,
  p_nickname text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_real_name text := btrim(coalesce(p_real_name, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
begin
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  if v_real_name = '' then
    raise exception 'real_name_required';
  end if;

  if char_length(v_nickname) < 2 or char_length(v_nickname) > 12 then
    raise exception 'nickname_length';
  end if;

  if v_nickname !~ '^[가-힣A-Za-z0-9]+$' then
    raise exception 'nickname_characters';
  end if;

  if exists (
    select 1
    from public.nickname_forbidden_terms nft
    where nft.is_active = true
      and lower(v_nickname) like '%' || lower(nft.term) || '%'
  ) then
    raise exception 'nickname_forbidden';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.role = 'admin'
  ) then
    raise exception 'admin_already_exists';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = p_user_id
  ) then
    raise exception 'auth_user_not_found';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
  ) then
    raise exception 'profile_already_exists';
  end if;

  if exists (
    select 1
    from public.profiles p
    where lower(p.nickname) = lower(v_nickname)
  ) then
    raise exception 'nickname_taken';
  end if;

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
    null,
    'admin',
    null,
    v_real_name,
    v_nickname,
    null,
    true,
    now(),
    now()
  );

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
    null,
    'admin.bootstrap_initial',
    'profile',
    p_user_id::text,
    jsonb_build_object(
      'method', 'private.bootstrap_initial_admin',
      'initial_admin', true
    )
  );

  return p_user_id;
end;
$$;

revoke all on function private.bootstrap_initial_admin(uuid, text, text)
  from public, anon, authenticated, service_role;

comment on function private.bootstrap_initial_admin(uuid, text, text) is
  'One-time initial HERO admin bootstrap. Execute only as database owner from Supabase SQL Editor after the auth user exists. Refuses execution once any admin profile exists.';

commit;
