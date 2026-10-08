-- Admin-only plant writes, audit rollback and browser privilege lock-down.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);
insert into auth.users(id,email) values
('e9100000-0000-0000-0000-000000000001','atomic-plant-admin@hero.test'),
('e9100000-0000-0000-0000-000000000002','atomic-plant-manager@hero.test'),
('e9100000-0000-0000-0000-000000000003','atomic-plant-inactive@hero.test');
insert into public.plants(id,code,name,display_name) values
('e9200000-0000-0000-0000-000000000001','PLANTOLD','Existing Plant','Existing');
insert into public.profiles
(id,plant_id,role,real_name,nickname,is_active) values
('e9100000-0000-0000-0000-000000000001',null,'admin','Active Admin','PTROOT',true),
('e9100000-0000-0000-0000-000000000002','e9200000-0000-0000-0000-000000000001','plant_manager','Plant Manager','PTMAN',true),
('e9100000-0000-0000-0000-000000000003',null,'admin','Inactive Admin','PTOFF',false);
select ok(not has_function_privilege('authenticated','public.create_plant_atomic(uuid,text,text,text)','EXECUTE'),'browser cannot directly call Admin plant creation');
select ok(not has_function_privilege('authenticated','public.set_plant_active_atomic(uuid,uuid,boolean)','EXECUTE'),'browser cannot directly call plant activation');
select ok(has_function_privilege('service_role','public.create_plant_atomic(uuid,text,text,text)','EXECUTE'),'service role can create plant');
select ok(has_function_privilege('service_role','public.set_plant_active_atomic(uuid,uuid,boolean)','EXECUTE'),'service role can toggle plant');
select ok(not has_table_privilege('authenticated','public.plants','INSERT'),'browser insert revoked');
select ok(not has_table_privilege('authenticated','public.plants','UPDATE'),'browser update revoked');
select ok(not has_table_privilege('authenticated','public.plants','DELETE'),'browser delete revoked');
set local role authenticated;
select throws_ok($$select public.create_plant_atomic('e9100000-0000-0000-0000-000000000001',' PLANTNEW ','New Plant','New')$$,'42501',null,'authenticated cannot spoof Admin actor through public RPC');
select throws_ok($$insert into public.plants(code,name,display_name) values ('BYPASS','Bypass','Bypass')$$,'42501',null,'authenticated cannot bypass audit with direct plant insert');
reset role;
set local role service_role;
select lives_ok($$select public.create_plant_atomic('e9100000-0000-0000-0000-000000000001',' PLANTNEW ','New Plant','New')$$,'active admin can create plant and audit atomically');
select results_eq($$select count(*) from public.plants where code='PLANTNEW' and is_active=true$$,array[1::bigint],'new plant exists');
select results_eq($$select count(*) from public.audit_logs where action='plant.created' and metadata->>'code'='PLANTNEW'$$,array[1::bigint],'creation audit written');
select throws_ok($$select public.create_plant_atomic('e9100000-0000-0000-0000-000000000001',' PLANTNEW ','New Plant','New')$$,'P0001','plant_code_taken','same plant code rejected');
select throws_ok($$select public.create_plant_atomic('e9100000-0000-0000-0000-000000000002','MANPLANT','Bad','Bad')$$,'P0001','admin_required','manager cannot create');
select throws_ok($$select public.create_plant_atomic('e9100000-0000-0000-0000-000000000003','OFFPLANT','Bad','Bad')$$,'P0001','admin_required','inactive admin cannot create');
select throws_ok($$select public.create_plant_atomic('e9100000-0000-0000-0000-000000000001','BAD CODE','Bad','Bad')$$,'P0001','invalid_plant_code','invalid code rejected');
select throws_ok($$select public.create_plant_atomic('e9100000-0000-0000-0000-000000000001','NOMAN',' ','X')$$,'P0001','invalid_plant_name','blank plant name rejected');
select throws_ok($$select public.create_plant_atomic('e9100000-0000-0000-0000-000000000001','NODISPLAY','Good',' ')$$,'P0001','invalid_plant_display_name','blank display name rejected');
select lives_ok($$select public.set_plant_active_atomic('e9100000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001',false)$$,'admin can deactivate plant');
select ok((select is_active=false from public.plants where id='e9200000-0000-0000-0000-000000000001'),'plant deactivation committed');
select results_eq($$select count(*) from public.audit_logs where action='plant.active_changed' and plant_id='e9200000-0000-0000-0000-000000000001'$$,array[1::bigint],'status change audit written once');
select is((select (public.set_plant_active_atomic('e9100000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001',false)->>'changed')::boolean),false,'same status is idempotent');
select results_eq($$select count(*) from public.audit_logs where action='plant.active_changed' and plant_id='e9200000-0000-0000-0000-000000000001'$$,array[1::bigint],'no extra audit for same status');
select throws_ok($$select public.set_plant_active_atomic('e9100000-0000-0000-0000-000000000002','e9200000-0000-0000-0000-000000000001',true)$$,'P0001','admin_required','manager cannot activate');
select throws_ok($$select public.set_plant_active_atomic('e9100000-0000-0000-0000-000000000003','e9200000-0000-0000-0000-000000000001',true)$$,'P0001','admin_required','inactive admin cannot activate');
select throws_ok($$select public.set_plant_active_atomic('e9100000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001',null)$$,'P0001','plant_status_required','null status denied');
select throws_ok($$select public.set_plant_active_atomic('e9100000-0000-0000-0000-000000000001','e9300000-0000-0000-0000-000000000001',true)$$,'P0001','plant_not_found','unknown plant denied');
reset role;
create or replace function pg_temp.reject_plant_audit() returns trigger
language plpgsql as $failure$
begin
  if new.action='plant.created' and new.metadata->>'code'='FAULTPLANT' then
    raise exception 'injected_plant_create_audit_failure';
  end if;
  if new.action='plant.active_changed' and new.plant_id='e9200000-0000-0000-0000-000000000001'::uuid then
    raise exception 'injected_plant_status_audit_failure';
  end if;
  return new;
end;
$failure$;
create trigger test_reject_plant_audit
before insert on public.audit_logs
for each row execute function pg_temp.reject_plant_audit();
set local role service_role;
select throws_ok($$select public.create_plant_atomic('e9100000-0000-0000-0000-000000000001','FAULTPLANT','Fault','Fault')$$,'P0001','injected_plant_create_audit_failure','create rolls back if audit insert fails');
select results_eq($$select count(*) from public.plants where code='FAULTPLANT'$$,array[0::bigint],'failed audit cannot leave an unaudited plant');
select throws_ok($$select public.set_plant_active_atomic('e9100000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001',true)$$,'P0001','injected_plant_status_audit_failure','status update rolls back if audit insert fails');
select ok((select is_active=false from public.plants where id='e9200000-0000-0000-0000-000000000001'),'audit failure preserves previous status');
reset role;
drop trigger test_reject_plant_audit on public.audit_logs;
set local role service_role;
select lives_ok($$select public.set_plant_active_atomic('e9100000-0000-0000-0000-000000000001','e9200000-0000-0000-0000-000000000001',true)$$,'status may be retried after failed atomic transaction');
select ok((select is_active=true from public.plants where id='e9200000-0000-0000-0000-000000000001'),'retry stores requested active state');
select results_eq($$select count(*) from public.audit_logs where action='plant.active_changed' and plant_id='e9200000-0000-0000-0000-000000000001'$$,array[2::bigint],'only successful status transitions audited');
select * from finish();
rollback;
