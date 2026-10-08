begin;

-- A manager's forced nickname reset must never leave the new nickname
-- without its nickname_change_events record and immutable audit entry.
-- Lock the target first to serialize repeated resets and self changes.
create or replace function public.force_reset_nickname_atomic(
  p_actor_user_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_season_id uuid;
  v_old_nickname text;
  v_new_nickname text;
  v_attempt integer;
begin
  select * into v_actor
  from public.profiles
  where id = p_actor_user_id
    and is_active = true
    and role = 'plant_manager';

  if not found or v_actor.plant_id is null then
    raise exception 'plant_manager_required';
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

  select s.id into v_season_id
  from public.seasons s
  where s.status = 'open'
    and s.starts_at <= now()
    and s.ends_at > now()
  order by s.starts_at desc
  limit 1;

  v_old_nickname := v_target.nickname;
  for v_attempt in 1..5 loop
    v_new_nickname :=
      'PLAYER' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      update public.profiles
      set nickname = v_new_nickname,
          nickname_reset_required = true,
          updated_at = now()
      where id = v_target.id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.nickname_change_events (
    user_id, season_id, actor_user_id, event_type,
    old_nickname, new_nickname
  ) values (
    v_target.id, v_season_id, p_actor_user_id, 'manager_reset',
    v_old_nickname, v_new_nickname
  );

  insert into public.audit_logs (
    actor_user_id, plant_id, action, entity_type, entity_id, metadata
  ) values (
    p_actor_user_id, v_target.plant_id, 'nickname.force_reset',
    'profile', v_target.id::text,
    jsonb_build_object(
      'old_nickname', v_old_nickname,
      'reset_nickname', v_new_nickname,
      'season_id', v_season_id
    )
  );

  return jsonb_build_object(
    'reset', true,
    'profileId', v_target.id,
    'nickname', v_new_nickname,
    'resetRequired', true
  );
end;
$$;

revoke all on function public.force_reset_nickname_atomic(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.force_reset_nickname_atomic(uuid, uuid)
  to service_role;

comment on function public.force_reset_nickname_atomic(uuid, uuid) is
  'Service-role-only manager nickname reset: same-plant scope, row lock and atomic profile + change event + immutable audit.';

commit;
