begin;

-- The legacy browser sync performs unaudited bulk writes. Management now
-- goes through the service-role transaction below; monthly cron is unchanged.
revoke execute on function public.sync_open_season_scenarios() from authenticated;

create or replace function private.season_binding_revision(p_season_id uuid, p_scenario_id uuid)
returns text language sql stable set search_path = '' as $$
  select md5(coalesce(jsonb_agg(jsonb_build_array(b.scenario_version_id,b.is_active,b.simulation_seed)
    order by b.scenario_version_id)::text,'[]'))
  from public.season_scenarios b join public.scenario_versions v on v.id=b.scenario_version_id
  where b.season_id=p_season_id and v.scenario_id=p_scenario_id;
$$;
revoke all on function private.season_binding_revision(uuid,uuid) from public,anon,authenticated;

create or replace function public.admin_season_scenario_overview(p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor_user_id and role='admin' and is_active) then
    raise exception 'admin_required';
  end if;
  return (
    with active_season as (
      select * from public.seasons where status='open' and starts_at<=now() and ends_at>now()
      order by starts_at desc,id desc limit 1
    )
    select jsonb_build_object('season',
      (select jsonb_build_object('id',id,'seasonKey',season_key,'title',title,'startsAt',starts_at,'endsAt',ends_at) from active_season),
      'scenarios',coalesce((select jsonb_agg(jsonb_build_object(
        'id',sc.id,'slug',sc.slug,'title',sc.title,'isActive',sc.is_active,'isCompetitive',sc.is_competitive,
        'publishedVersionId',pv.id,'publishedVersion',pv.version,
        'revision',private.season_binding_revision(s.id,sc.id),
        'bindings',coalesce((select jsonb_agg(jsonb_build_object('versionId',v.id,'version',v.version,'status',v.status,'isActive',b.is_active) order by v.version)
          from public.season_scenarios b join public.scenario_versions v on v.id=b.scenario_version_id
          where b.season_id=s.id and v.scenario_id=sc.id),'[]'::jsonb)
      ) order by sc.title,sc.id)
      from active_season s cross join public.scenarios sc
      left join public.scenario_versions pv on pv.scenario_id=sc.id and pv.status='published'
      where sc.is_competitive or exists(select 1 from public.season_scenarios b join public.scenario_versions v on v.id=b.scenario_version_id where b.season_id=s.id and v.scenario_id=sc.id)), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.admin_season_scenario_overview(uuid) from public,anon,authenticated;
grant execute on function public.admin_season_scenario_overview(uuid) to service_role;

create or replace function public.set_season_scenario_atomic(
  p_actor_user_id uuid, p_season_id uuid, p_scenario_id uuid,
  p_version_id uuid, p_expected_revision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_scenario public.scenarios%rowtype;
  v_season public.seasons%rowtype;
  v_version public.scenario_versions%rowtype;
  v_previous jsonb;
  v_active_id uuid;
begin
  perform 1 from public.profiles where id=p_actor_user_id and role='admin' and is_active for share;
  if not found then raise exception 'admin_required'; end if;
  -- Same parent lock as publication: cannot link a concurrently archived version.
  select * into v_scenario from public.scenarios where id=p_scenario_id for update;
  if not found then raise exception 'scenario_not_found'; end if;
  select * into v_season from public.seasons where id=p_season_id for update;
  select id into v_active_id from public.seasons where status='open'
    and starts_at<=clock_timestamp() and ends_at>clock_timestamp()
    order by starts_at desc,id desc limit 1;
  if v_season.id is null or v_active_id is distinct from p_season_id then
    raise exception 'season_no_longer_open';
  end if;
  if p_expected_revision is null or private.season_binding_revision(p_season_id,p_scenario_id) is distinct from p_expected_revision then
    raise exception 'season_binding_conflict';
  end if;
  if p_version_id is not null then
    if not v_scenario.is_active or not v_scenario.is_competitive then raise exception 'scenario_not_eligible'; end if;
    select * into v_version from public.scenario_versions where id=p_version_id for update;
    if not found or v_version.scenario_id<>p_scenario_id or v_version.status<>'published' then
      raise exception 'scenario_version_not_published';
    end if;
  end if;
  select coalesce(jsonb_agg(b.scenario_version_id order by b.scenario_version_id),'[]'::jsonb)
    into v_previous from public.season_scenarios b join public.scenario_versions v on v.id=b.scenario_version_id
    where b.season_id=p_season_id and v.scenario_id=p_scenario_id and b.is_active;
  if (p_version_id is null and v_previous='[]'::jsonb)
     or (p_version_id is not null and v_previous=jsonb_build_array(p_version_id)) then
    raise exception 'binding_no_change';
  end if;
  update public.season_scenarios b set is_active=false from public.scenario_versions v
    where b.scenario_version_id=v.id and v.scenario_id=p_scenario_id and b.season_id=p_season_id and b.is_active;
  if p_version_id is not null then
    insert into public.season_scenarios(season_id,scenario_version_id,simulation_seed,is_active)
      values(p_season_id,p_version_id,encode(extensions.gen_random_bytes(32),'hex'),true)
      on conflict(season_id,scenario_version_id) do update set is_active=true;
    -- Existing seeds and rows are preserved for deterministic play and history.
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    values(p_actor_user_id,'season.scenario_binding_changed','season',p_season_id::text,
      jsonb_build_object('scenario_id',p_scenario_id,'previous_version_ids',v_previous,
        'version_id',p_version_id,'is_active',p_version_id is not null));
  return jsonb_build_object('updated',true,'seasonId',p_season_id,'scenarioId',p_scenario_id,
    'versionId',p_version_id,'isActive',p_version_id is not null);
end;
$$;
revoke all on function public.set_season_scenario_atomic(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_season_scenario_atomic(uuid,uuid,uuid,uuid,text) to service_role;

commit;
