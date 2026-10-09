begin;

-- A single profile-row lock serializes self changes with manager forced resets.
-- The policy event and immutable audit must commit alongside the nickname.
create or replace function public.change_nickname_self_atomic(
  p_user_id uuid,
  p_nickname text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.profiles%rowtype;
  v_season_id uuid;
  v_season_key text;
  v_nickname text := btrim(p_nickname);
  v_old_nickname text;
  v_forced_recovery boolean;
begin
  select * into v_player
  from public.profiles
  where id = p_user_id
    and role = 'player'
    and is_active = true
  for update;

  if not found then
    raise exception 'player_role_required';
  end if;

  -- Validate plant status before the same-name early return. Holding a
  -- shared plant lock serializes this function with Admin suspension.
  perform 1 from public.plants
  where id = v_player.plant_id and is_active = true
  for share;
  if not found then
    raise exception 'plant_inactive';
  end if;

  select s.id, s.season_key into v_season_id, v_season_key
  from public.seasons s
  where s.status = 'open'
    and s.starts_at <= now()
    and s.ends_at > now()
  order by s.starts_at desc
  limit 1
  for share;

  if not found then
    raise exception 'no_open_season';
  end if;

  if v_nickname is null or char_length(v_nickname) < 2 or char_length(v_nickname) > 12 then
    raise exception 'nickname_length';
  end if;

  if v_nickname !~ '^[가-힣A-Za-z0-9]+$' then
    raise exception 'nickname_characters';
  end if;

  if exists (
    select 1 from public.nickname_forbidden_terms f
    where f.is_active = true
      and strpos(lower(v_nickname), lower(btrim(f.term))) > 0
  ) then
    raise exception 'nickname_forbidden';
  end if;

  if v_nickname = v_player.nickname then
    return jsonb_build_object(
      'changed', false,
      'nickname', v_player.nickname,
      'resetRequired', v_player.nickname_reset_required,
      'seasonKey', v_season_key
    );
  end if;

  -- A manager reset opens an exception to the normal one-change-per-season
  -- limit. Holding the player row lock prevents two voluntary changes from
  -- passing the check concurrently.
  if not v_player.nickname_reset_required and exists (
    select 1 from public.nickname_change_events n
    where n.user_id = p_user_id
      and n.season_id = v_season_id
      and n.event_type = 'self_change'
  ) then
    raise exception 'nickname_change_limit_reached';
  end if;

  v_old_nickname := v_player.nickname;
  v_forced_recovery := v_player.nickname_reset_required;

  begin
    update public.profiles
    set nickname = v_nickname,
        nickname_reset_required = false,
        updated_at = now()
    where id = p_user_id;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;

  insert into public.nickname_change_events (
    user_id, season_id, actor_user_id, event_type,
    old_nickname, new_nickname
  ) values (
    p_user_id, v_season_id, p_user_id, 'self_change',
    v_old_nickname, v_nickname
  );

  insert into public.audit_logs (
    actor_user_id, plant_id, action, entity_type, entity_id, metadata
  ) values (
    p_user_id, v_player.plant_id, 'nickname.changed',
    'profile', p_user_id::text,
    jsonb_build_object(
      'season_id', v_season_id,
      'season_key', v_season_key,
      'forced_reset_recovery', v_forced_recovery
    )
  );

  return jsonb_build_object(
    'changed', true,
    'nickname', v_nickname,
    'seasonKey', v_season_key,
    'resetRequired', false
  );
end;
$$;

revoke all on function public.change_nickname_self_atomic(uuid, text)
  from public, anon, authenticated;
grant execute on function public.change_nickname_self_atomic(uuid, text)
  to service_role;

comment on function public.change_nickname_self_atomic(uuid, text) is
  'Service-only atomic self-nickname change: active Player, current season, validation, seasonal quota, profile/history/audit rollback together.';

commit;
