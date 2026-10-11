begin;

-- Fail rather than silently choose a winner if legacy data is inconsistent.
create unique index scenario_versions_one_published
  on public.scenario_versions(scenario_id) where status = 'published';

create or replace function public.set_scenario_status_atomic(
  p_actor_user_id uuid, p_version_id uuid,
  p_expected_status public.scenario_status, p_target_status public.scenario_status,
  p_expected_content jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_scenario_id uuid;
  v_current public.scenario_versions%rowtype;
  v_old public.scenario_versions%rowtype;
  v_allowed boolean;
begin
  perform 1 from public.profiles
    where id = p_actor_user_id and role = 'admin' and is_active for share;
  if not found then raise exception 'admin_required'; end if;
  select scenario_id into v_scenario_id from public.scenario_versions where id = p_version_id;
  if not found then raise exception 'scenario_version_not_found'; end if;
  -- Parent first: different versions of one scenario share a publication lock.
  perform 1 from public.scenarios where id = v_scenario_id for update;
  select * into v_current from public.scenario_versions where id = p_version_id for update;
  if not found then raise exception 'scenario_version_not_found'; end if;
  if v_current.scenario_id is distinct from v_scenario_id
     or v_current.status is distinct from p_expected_status then
    raise exception 'scenario_status_conflict';
  end if;
  if v_current.content is distinct from p_expected_content then
    raise exception 'scenario_content_conflict';
  end if;
  v_allowed := case v_current.status
    when 'draft' then p_target_status in ('review','archived')
    when 'review' then p_target_status in ('draft','approved','archived')
    when 'approved' then p_target_status in ('review','published','archived')
    when 'published' then p_target_status = 'archived'
    when 'archived' then p_target_status = 'draft'
    else false end;
  if v_allowed is not true then raise exception 'invalid_status_transition'; end if;
  -- Edge validates the full schema/graph before passing this exact content
  -- snapshot. Reject changed content under the lock, before any writes.
  if p_target_status = 'published' then
    if v_current.content->>'id' is distinct from 's00_tutorial'
       and (v_current.content->'incidentDebrief' is null
            or v_current.content->'incidentDebrief' = 'null'::jsonb) then
      raise exception 'scenario_incident_debrief_required';
    end if;
    for v_old in select * from public.scenario_versions
      where scenario_id = v_scenario_id and status = 'published' and id <> p_version_id
      order by id for update
    loop
      update public.scenario_versions set status = 'archived' where id = v_old.id;
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
        values(p_actor_user_id, 'scenario.status_changed', 'scenario_version', v_old.id::text,
          jsonb_build_object('from','published','to','archived','version',v_old.version,
            'replacement_version_id',p_version_id));
    end loop;
  end if;
  update public.scenario_versions set status = p_target_status,
    approved_by = case when p_target_status = 'approved' then p_actor_user_id else approved_by end,
    approved_at = case when p_target_status = 'approved' then now() else approved_at end,
    published_at = case when p_target_status = 'published' then now() else published_at end
    where id = p_version_id returning * into v_current;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values(p_actor_user_id, 'scenario.status_changed', 'scenario_version', p_version_id::text,
      jsonb_build_object('from',p_expected_status,'to',p_target_status,'version',v_current.version));
  return jsonb_build_object('id',v_current.id,'version',v_current.version,'status',v_current.status,
    'approved_at',v_current.approved_at,'published_at',v_current.published_at);
end;
$$;
revoke all on function public.set_scenario_status_atomic(uuid,uuid,public.scenario_status,public.scenario_status,jsonb)
  from public, anon, authenticated;
grant execute on function public.set_scenario_status_atomic(uuid,uuid,public.scenario_status,public.scenario_status,jsonb)
  to service_role;
comment on function public.set_scenario_status_atomic(uuid,uuid,public.scenario_status,public.scenario_status,jsonb) is
  'Service-role only: compare-and-set scenario status, serialize publication, and atomically audit replacement and target transitions.';

commit;
