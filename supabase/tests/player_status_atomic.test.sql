-- pgTAP: player status and immutable audit must commit atomically.
-- Each fixture and fault-injection trigger is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users(id,email) values
('a1000000-0000-0000-0000-000000000001','status-manager-a@hero.test'),
('a1000000-0000-0000-0000-000000000002','status-manager-b@hero.test'),
('a1000000-0000-0000-0000-000000000003','status-player-a@hero.test'),
('a1000000-0000-0000-0000-000000000004','status-player-b@hero.test'),
('a1000000-0000-0000-0000-000000000005','status-inactive-manager@hero.test'),
('a1000000-0000-0000-0000-000000000006','status-admin@hero.test'),
('a1000000-0000-0000-0000-000000000007','status-fault-target@hero.test');

insert into public.plants(id,code,name,display_name) values
('a2000000-0000-0000-0000-000000000001','STSTAT-A','Status A','Status A'),
('a2000000-0000-0000-0000-000000000002','STSTAT-B','Status B','Status B');

insert into public.profiles(
id,plant_id,role,job_role,real_name,nickname,is_active
) values
('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','plant_manager',null,'Manager A','STSMGA',true),
('a1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','plant_manager',null,'Manager B','STSMGB',true),
('a1000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000001','player','worker','Player A','STSPAA',true),
('a1000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000002','player','worker','Player B','STSPBB',true),
('a1000000-0000-0000-0000-000000000005','a2000000-0000-0000-0000-000000000001','plant_manager',null,'Inactive Manager','STSOFF',false),
('a1000000-0000-0000-0000-000000000006',null,'admin',null,'Admin','STSADM',true),
('a1000000-0000-0000-0000-000000000007','a2000000-0000-0000-0000-000000000001','player','worker','Fault Target','STSFLT',true);
select ok(not has_function_privilege('anon','public.set_player_active_atomic(uuid,uuid,boolean)','EXECUTE'),'anonymous cannot change player status');
select ok(not has_function_privilege('authenticated','public.set_player_active_atomic(uuid,uuid,boolean)','EXECUTE'),'authenticated cannot call privileged status RPC');
select ok(has_function_privilege('service_role','public.set_player_active_atomic(uuid,uuid,boolean)','EXECUTE'),'service role may call RPC');
set local role authenticated;
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',false)$$,'42501',null,'browser cannot spoof service manager actor');
reset role;
set local role service_role;
select lives_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',false)$$,'manager can deactivate own player');
select results_eq($$select count(*) from public.profiles where id='a1000000-0000-0000-0000-000000000003' and is_active=false$$,array[1::bigint],'deactivation commits');
select results_eq($$select count(*) from public.audit_logs where action='player.deactivated' and entity_id='a1000000-0000-0000-0000-000000000003'$$,array[1::bigint],'one deactivation audit');
select is((select metadata->>'nickname' from public.audit_logs where action='player.deactivated' and entity_id='a1000000-0000-0000-0000-000000000003'),'STSPAA','audit retains nickname');
select is((select (public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',false)->>'changed')::boolean),false,'duplicate deactivation is no-op');
select results_eq($$select count(*) from public.audit_logs where action='player.deactivated' and entity_id='a1000000-0000-0000-0000-000000000003'$$,array[1::bigint],'no duplicate audit on idempotent request');
select lives_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',true)$$,'manager can reactivate own player');
select results_eq($$select count(*) from public.profiles where id='a1000000-0000-0000-0000-000000000003' and is_active=true$$,array[1::bigint],'reactivation commits');
select results_eq($$select count(*) from public.audit_logs where action='player.reactivated' and entity_id='a1000000-0000-0000-0000-000000000003'$$,array[1::bigint],'one reactivation audit');
select is((select (public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',true)->>'changed')::boolean),false,'duplicate reactivation is no-op');
select results_eq($$select count(*) from public.audit_logs where action='player.reactivated' and entity_id='a1000000-0000-0000-0000-000000000003'$$,array[1::bigint],'no duplicate reactivation audit');
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004',false)$$,'P0001','player_not_found','cannot deactivate foreign-plant player');
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003',false)$$,'P0001','player_not_found','other manager cannot deactivate this player');
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',false)$$,'P0001','player_not_found','manager cannot change another manager profile');
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000003',false)$$,'P0001','plant_manager_required','admin cannot invoke manager-only action');
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000003',false)$$,'P0001','plant_manager_required','inactive manager cannot update players');
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000003',false)$$,'P0001','plant_manager_required','player cannot change self status');
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',null)$$,'P0001','profile_id_and_active_required','null target status is denied');
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001',true)$$,'P0001','player_not_found','missing player is denied');
select results_eq($$select count(*) from public.audit_logs where entity_id='a1000000-0000-0000-0000-000000000004' and action in ('player.deactivated','player.reactivated')$$,array[0::bigint],'unauthorized changes leave no audit');
reset role;

-- Fault injection on append-only audit INSERT is safe inside this transaction.
create or replace function pg_temp.reject_status_audit()
returns trigger language plpgsql as $fault$
begin
  if new.entity_id = 'a1000000-0000-0000-0000-000000000007' and new.action = 'player.deactivated' then
    raise exception 'injected_player_audit_failure';
  end if;
  return new;
end;
$fault$;
create trigger test_status_audit_failure
before insert on public.audit_logs
for each row execute function pg_temp.reject_status_audit();

set local role service_role;
select throws_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000007',false)$$,'P0001','injected_player_audit_failure','audit failure rolls back profile deactivation');
select results_eq($$select count(*) from public.profiles where id='a1000000-0000-0000-0000-000000000007' and is_active=true$$,array[1::bigint],'status unchanged after audit failure');
select results_eq($$select count(*) from public.audit_logs where action='player.deactivated' and entity_id='a1000000-0000-0000-0000-000000000007'$$,array[0::bigint],'failed audit leaves no orphan event');
reset role;
drop trigger test_status_audit_failure on public.audit_logs;
set local role service_role;
select lives_ok($$select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000007',false)$$,'retry after injected fault removed succeeds');
select results_eq($$select count(*) from public.profiles where id='a1000000-0000-0000-0000-000000000007' and is_active=false$$,array[1::bigint],'later success deactivates target exactly once');
select results_eq($$select count(*) from public.audit_logs where action='player.deactivated' and entity_id='a1000000-0000-0000-0000-000000000007'$$,array[1::bigint],'later success records exactly one audit');
-- A suspended plant must block both an idempotent status response
-- and a real Player state mutation, even with a service-role caller.
update public.plants set is_active=false
where id='a2000000-0000-0000-0000-000000000001';
select throws_ok($select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',true)$,
  'P0001','plant_inactive','suspended plant blocks status no-op');
select throws_ok($select public.set_player_active_atomic('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',false)$,
  'P0001','plant_inactive','suspended plant blocks status mutation');
update public.plants set is_active=true
where id='a2000000-0000-0000-0000-000000000001';
select * from finish();
rollback;
