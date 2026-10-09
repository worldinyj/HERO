begin;

-- Browsers previously wrote plants directly, bypassing append-only audit.
-- Both mutators reauthorize the active Admin in PostgreSQL.
create or replace function public.create_plant_atomic(
  p_actor_user_id uuid, p_code text, p_name text, p_display_name text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_id uuid;
begin
  perform 1 from public.profiles where id=p_actor_user_id
    and role='admin' and is_active=true for share;
  if not found then raise exception 'admin_required'; end if;
  if v_code !~ '^[A-Z0-9_-]{1,20}$' then
    raise exception 'invalid_plant_code';
  end if;
  if char_length(v_name) not between 1 and 100 then
    raise exception 'invalid_plant_name';
  end if;
  if char_length(v_display_name) not between 1 and 100 then
    raise exception 'invalid_plant_display_name';
  end if;

  begin
    insert into public.plants(code,name,display_name,is_active)
    values (v_code,v_name,v_display_name,true) returning id into v_id;
  exception when unique_violation then
    raise exception 'plant_code_taken';
  end;

  insert into public.audit_logs(
    actor_user_id,plant_id,action,entity_type,entity_id,metadata
  ) values (
    p_actor_user_id,v_id,'plant.created','plant',v_id::text,
    jsonb_build_object('code',v_code,'display_name',v_display_name)
  );

  return jsonb_build_object('created',true,'plantId',v_id,'isActive',true,
    'code',v_code,'displayName',v_display_name);
end;
$$;

create or replace function public.set_plant_active_atomic(
  p_actor_user_id uuid, p_plant_id uuid, p_is_active boolean
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_plant public.plants%rowtype;
begin
  perform 1 from public.profiles where id=p_actor_user_id
    and role='admin' and is_active=true for share;
  if not found then raise exception 'admin_required'; end if;
  if p_is_active is null then raise exception 'plant_status_required'; end if;

  select * into v_plant from public.plants
    where id=p_plant_id for update;
  if not found then raise exception 'plant_not_found'; end if;
  if v_plant.is_active=p_is_active then
    return jsonb_build_object('changed',false,
      'plantId',v_plant.id,'isActive',v_plant.is_active);
  end if;

  update public.plants
    set is_active=p_is_active,updated_at=now() where id=v_plant.id;

  insert into public.audit_logs(
    actor_user_id,plant_id,action,entity_type,entity_id,metadata
  ) values (
    p_actor_user_id,v_plant.id,'plant.active_changed','plant',v_plant.id::text,
    jsonb_build_object('previous_active',v_plant.is_active,
      'new_active',p_is_active,'code',v_plant.code)
  );

  return jsonb_build_object('changed',true,
    'plantId',v_plant.id,'isActive',p_is_active);
end;
$$;

-- Revoke browser mutations even for Admins: every write requires audit.
revoke insert,update,delete on public.plants from authenticated;
drop policy if exists "plants_admin_write" on public.plants;

revoke all on function public.create_plant_atomic(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.create_plant_atomic(uuid,text,text,text)
  to service_role;
revoke all on function public.set_plant_active_atomic(uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.set_plant_active_atomic(uuid,uuid,boolean)
  to service_role;

comment on function public.create_plant_atomic(uuid,text,text,text) is
  'Service-role-only atomic Admin plant creation and audit.';
comment on function public.set_plant_active_atomic(uuid,uuid,boolean) is
  'Service-role-only atomic Admin plant activation and audit.';
commit;
