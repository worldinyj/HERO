-- Manager-forced reset must atomically change profile, history and audit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users(id,email) values
('b1000000-0000-0000-0000-000000000001','reset-manager-a@hero.test'),
('b1000000-0000-0000-0000-000000000002','reset-manager-b@hero.test'),
('b1000000-0000-0000-0000-000000000003','reset-player-a@hero.test'),
('b1000000-0000-0000-0000-000000000004','reset-player-b@hero.test'),
('b1000000-0000-0000-0000-000000000005','reset-admin@hero.test'),
('b1000000-0000-0000-0000-000000000006','reset-inactive@hero.test'),
('b1000000-0000-0000-0000-000000000007','reset-event-failure@hero.test'),
('b1000000-0000-0000-0000-000000000008','reset-audit-failure@hero.test');

insert into public.plants(id,code,name,display_name) values
('b2000000-0000-0000-0000-000000000001','RESET-A','Reset A','Reset A'),
('b2000000-0000-0000-0000-000000000002','RESET-B','Reset B','Reset B');

insert into public.profiles
(id,plant_id,role,job_role,real_name,nickname,is_active) values
('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','plant_manager',null,'Manager A','RSTMG1',true),
('b1000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002','plant_manager',null,'Manager B','RSTMG2',true),
('b1000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','player','worker','Player A','RSTP1',true),
('b1000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000002','player','worker','Player B','RSTP2',true),
('b1000000-0000-0000-0000-000000000005',null,'admin',null,'Admin','RSTADM',true),
('b1000000-0000-0000-0000-000000000006','b2000000-0000-0000-0000-000000000001','plant_manager',null,'Inactive','RSTOFF',false),
('b1000000-0000-0000-0000-000000000007','b2000000-0000-0000-0000-000000000001','player','worker','Event Fault','RSTEVT',true),
('b1000000-0000-0000-0000-000000000008','b2000000-0000-0000-0000-000000000001','player','worker','Audit Fault','RSTAUD',false);
select ok(not has_function_privilege('anon','public.force_reset_nickname_atomic(uuid,uuid)','EXECUTE'),'anon may not reset nickname');
select ok(not has_function_privilege('authenticated','public.force_reset_nickname_atomic(uuid,uuid)','EXECUTE'),'authenticated may not reset nickname directly');
select ok(has_function_privilege('service_role','public.force_reset_nickname_atomic(uuid,uuid)','EXECUTE'),'service role can call RPC');
set local role authenticated;
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003')$$,'42501',null,'user cannot forge manager actor');
reset role;
set local role service_role;
select lives_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003')$$,'manager can reset own plant Player');
select ok((select nickname ~ '^PLAYER[0-9A-F]{6}$' from public.profiles where id='b1000000-0000-0000-0000-000000000003'),'new nickname matches 12-character policy');
select ok((select nickname_reset_required from public.profiles where id='b1000000-0000-0000-0000-000000000003'),'target must change nickname after forced reset');
select results_eq($$select count(*) from public.nickname_change_events where user_id='b1000000-0000-0000-0000-000000000003' and actor_user_id='b1000000-0000-0000-0000-000000000001' and event_type='manager_reset'$$,array[1::bigint],'one manager reset event');
select results_eq($$select count(*) from public.audit_logs where entity_id='b1000000-0000-0000-0000-000000000003' and actor_user_id='b1000000-0000-0000-0000-000000000001' and action='nickname.force_reset'$$,array[1::bigint],'one immutable audit event');
select is((select old_nickname from public.nickname_change_events where user_id='b1000000-0000-0000-0000-000000000003' and event_type='manager_reset' order by id desc limit 1),'RSTP1','history stores old nickname');
select ok((select e.new_nickname = p.nickname from public.nickname_change_events e join public.profiles p on p.id=e.user_id where e.user_id='b1000000-0000-0000-0000-000000000003' and e.event_type='manager_reset' limit 1),'history stores exact new nickname');
select ok((select metadata->>'reset_nickname' = p.nickname from public.audit_logs a join public.profiles p on p.id=a.entity_id::uuid where a.action='nickname.force_reset' and a.entity_id='b1000000-0000-0000-0000-000000000003' limit 1),'audit stores matching new nickname');
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000003')$$,'P0001','player_not_found','cross plant manager denied');
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000004')$$,'P0001','player_not_found','other plant target denied');
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002')$$,'P0001','player_not_found','manager cannot reset manager nickname');
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000003')$$,'P0001','plant_manager_required','admin cannot force reset');
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000003')$$,'P0001','plant_manager_required','inactive actor denied');
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000003')$$,'P0001','plant_manager_required','player cannot self invoke force reset');
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001')$$,'P0001','player_not_found','unknown profile rejected');
select results_eq($$select count(*) from public.nickname_change_events where user_id='b1000000-0000-0000-0000-000000000004'$$,array[0::bigint],'denied reset has no foreign event');
select results_eq($$select count(*) from public.audit_logs where action='nickname.force_reset' and entity_id='b1000000-0000-0000-0000-000000000004'$$,array[0::bigint],'denied reset has no foreign audit');
select lives_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000008')$$,'manager may reset inactive own plant Player');
select ok((select nickname_reset_required from public.profiles where id='b1000000-0000-0000-0000-000000000008'),'inactive player forced reset flag set');
reset role;

-- Failure before nickname_change_events INSERT must undo nickname UPDATE.
create or replace function pg_temp.reject_reset_history()
returns trigger language plpgsql as $func$
begin
  if new.user_id = 'b1000000-0000-0000-0000-000000000007' and new.event_type = 'manager_reset' then
    raise exception 'injected_nickname_history_failure';
  end if;
  return new;
end;
$func$;

create trigger test_reject_nickname_history before insert on public.nickname_change_events
for each row execute function pg_temp.reject_reset_history();
set local role service_role;
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000007')$$,'P0001','injected_nickname_history_failure','history failure rolls back nickname');
select is((select nickname from public.profiles where id='b1000000-0000-0000-0000-000000000007'),'RSTEVT','nickname unchanged after history failure');
select ok((select not nickname_reset_required from public.profiles where id='b1000000-0000-0000-0000-000000000007'),'reset flag unchanged after history failure');
select results_eq($$select count(*) from public.audit_logs where action='nickname.force_reset' and entity_id='b1000000-0000-0000-0000-000000000007'$$,array[0::bigint],'no audit event on history failure');
reset role;
drop trigger test_reject_nickname_history on public.nickname_change_events;
create or replace function pg_temp.reject_reset_audit()
returns trigger language plpgsql as $func$
begin
  if new.action = 'nickname.force_reset' and new.entity_id = 'b1000000-0000-0000-0000-000000000007' then
    raise exception 'injected_nickname_audit_failure';
  end if;
  return new;
end;
$func$;
create trigger test_reject_nickname_audit before insert on public.audit_logs
for each row execute function pg_temp.reject_reset_audit();
set local role service_role;
select throws_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000007')$$,'P0001','injected_nickname_audit_failure','audit failure rolls back profile and history');
select is((select nickname from public.profiles where id='b1000000-0000-0000-0000-000000000007'),'RSTEVT','nickname unchanged after audit failure');
select results_eq($$select count(*) from public.nickname_change_events where user_id='b1000000-0000-0000-0000-000000000007'$$,array[0::bigint],'history rolled back if audit fails');
reset role;
drop trigger test_reject_nickname_audit on public.audit_logs;
set local role service_role;
select lives_ok($$select public.force_reset_nickname_atomic('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000007')$$,'reset succeeds once injected triggers removed');
select results_eq($$select count(*) from public.nickname_change_events where user_id='b1000000-0000-0000-0000-000000000007'$$,array[1::bigint],'recovered reset has one history event');
select results_eq($$select count(*) from public.audit_logs where action='nickname.force_reset' and entity_id='b1000000-0000-0000-0000-000000000007'$$,array[1::bigint],'recovered reset has one audit');
select * from finish();
rollback;
