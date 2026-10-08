-- Player self-nickname change, seasonal quota and immutable audit commit together.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into auth.users(id,email) values
('c1000000-0000-0000-0000-000000000001','self-player-a@hero.test'),
('c1000000-0000-0000-0000-000000000002','self-player-b@hero.test'),
('c1000000-0000-0000-0000-000000000003','self-manager@hero.test'),
('c1000000-0000-0000-0000-000000000004','self-inactive@hero.test'),
('c1000000-0000-0000-0000-000000000005','self-fault@hero.test'),
('c1000000-0000-0000-0000-000000000006','self-audit-fault@hero.test');

insert into public.plants(id,code,name,display_name)
values ('c2000000-0000-0000-0000-000000000001','SELF-A','Self Plant','Self Plant');

insert into public.profiles
(id,plant_id,role,job_role,real_name,nickname,is_active,nickname_reset_required) values
('c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','player','worker','Player A','SELFONE',true,false),
('c1000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000001','player','worker','Player B','SELFTWO',true,true),
('c1000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000001','plant_manager',null,'Manager','SELFMGR',true,false),
('c1000000-0000-0000-0000-000000000004','c2000000-0000-0000-0000-000000000001','player','worker','Inactive','SELFOFF',false,false),
('c1000000-0000-0000-0000-000000000005','c2000000-0000-0000-0000-000000000001','player','worker','Event Fault','SELFHIS',true,false),
('c1000000-0000-0000-0000-000000000006','c2000000-0000-0000-0000-000000000001','player','worker','Audit Fault','SELFAUD',true,false);

-- Migrations seed an open real-month season. Remove its open status *inside
-- this test transaction only* so the RPC always selects our fixed fixture,
-- including on month rollover dates. The outer ROLLBACK restores everything.
update public.seasons
set status = 'scheduled'
where status = 'open';

insert into public.seasons(id,season_key,title,starts_at,ends_at,status)
values ('c3000000-0000-0000-0000-000000000001','2099-self-atomic','Nickname test season',
now()-interval '1 day',now()+interval '7 days','open');

-- Recovery from a manager reset bypasses an already spent voluntary quota.
insert into public.nickname_change_events
(user_id,season_id,actor_user_id,event_type,old_nickname,new_nickname)
values ('c1000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','self_change','PREVNAME','SELFTWO');

select ok(not has_function_privilege('anon','public.change_nickname_self_atomic(uuid,text)','EXECUTE'),'anonymous cannot invoke nickname mutation');
select ok(not has_function_privilege('authenticated','public.change_nickname_self_atomic(uuid,text)','EXECUTE'),'authenticated cannot spoof target user id');
select ok(has_function_privilege('service_role','public.change_nickname_self_atomic(uuid,text)','EXECUTE'),'service role can call nickname RPC');
set local role authenticated;
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000001','ALIASNEW')$$,'42501',null,'authenticated client cannot forge another player');
reset role;
set local role service_role;
select lives_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000001','ALIASNEW')$$,'first voluntary change succeeds');
select is((select nickname from public.profiles where id='c1000000-0000-0000-0000-000000000001'),'ALIASNEW','new nickname persisted');
select results_eq($$select count(*) from public.nickname_change_events where user_id='c1000000-0000-0000-0000-000000000001' and event_type='self_change' and season_id='c3000000-0000-0000-0000-000000000001'$$,array[1::bigint],'one seasonal event');
select results_eq($$select count(*) from public.audit_logs where entity_id='c1000000-0000-0000-0000-000000000001' and action='nickname.changed'$$,array[1::bigint],'exactly one audit event');
select is((select old_nickname from public.nickname_change_events where user_id='c1000000-0000-0000-0000-000000000001' order by id desc limit 1),'SELFONE','history captures previous name');
select is((select new_nickname from public.nickname_change_events where user_id='c1000000-0000-0000-0000-000000000001' order by id desc limit 1),'ALIASNEW','history captures new name');
select is((select (public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000001','ALIASNEW')->>'changed')::boolean),false,'same nickname is idempotent');
select results_eq($$select count(*) from public.audit_logs where entity_id='c1000000-0000-0000-0000-000000000001' and action='nickname.changed'$$,array[1::bigint],'idempotent call adds no audit');
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000001','SECONDONE')$$,'P0001','nickname_change_limit_reached','normal second change this season rejected');
select is((select nickname from public.profiles where id='c1000000-0000-0000-0000-000000000001'),'ALIASNEW','quota denial preserves nickname');
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000001','SELFTWO')$$,'P0001','nickname_change_limit_reached','quota restriction checked before duplicate nickname');
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000003','MANAGERNEW')$$,'P0001','player_role_required','manager cannot change through player function');
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000004','INACTNEW')$$,'P0001','player_role_required','inactive player cannot change nickname');
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000005', 'A')$$,'P0001','nickname_length','nickname length validated in DB');
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000005', 'B@D')$$,'P0001','nickname_characters','nickname characters checked in DB');
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000005', 'ADMIN1')$$,'P0001','nickname_forbidden','forbidden substring checked in DB');
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000005','ALIASNEW')$$,'P0001','nickname_taken','duplicate nickname caught by database unique index');
select results_eq($$select count(*) from public.nickname_change_events where user_id='c1000000-0000-0000-0000-000000000005'$$,array[0::bigint],'invalid requests do not create policy events');
select lives_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000002','RECOVERNEW')$$,'manager reset allows recovery even after previous voluntary change');
select is((select nickname from public.profiles where id='c1000000-0000-0000-0000-000000000002'),'RECOVERNEW','recovery nickname committed');
select ok((select not nickname_reset_required from public.profiles where id='c1000000-0000-0000-0000-000000000002'),'recovery clears reset-required flag');
select results_eq($$select count(*) from public.nickname_change_events where user_id='c1000000-0000-0000-0000-000000000002' and event_type='self_change' and season_id='c3000000-0000-0000-0000-000000000001'$$,array[2::bigint],'recovery creates separate auditable event');
select ok((select (metadata->>'forced_reset_recovery')::boolean from public.audit_logs where entity_id='c1000000-0000-0000-0000-000000000002' and action='nickname.changed' order by id desc limit 1),'audit identifies forced reset recovery');
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000002','RECOVERAGAIN')$$,'P0001','nickname_change_limit_reached','another voluntary change after recovery rejected');
reset role;

create or replace function pg_temp.reject_self_history()
returns trigger language plpgsql as $fault$
begin
  if new.user_id = 'c1000000-0000-0000-0000-000000000005' and new.event_type='self_change' then
    raise exception 'injected_self_history_failure';
  end if;
  return new;
end;
$fault$;
create trigger test_reject_self_history before insert on public.nickname_change_events
for each row execute function pg_temp.reject_self_history();

set local role service_role;
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000005','EVENTFAIL')$$,'P0001','injected_self_history_failure','history failure rolls back nickname');
select is((select nickname from public.profiles where id='c1000000-0000-0000-0000-000000000005'),'SELFHIS','history failure leaves old nickname');
select results_eq($$select count(*) from public.audit_logs where action='nickname.changed' and entity_id='c1000000-0000-0000-0000-000000000005'$$,array[0::bigint],'history failure leaves no audit entry');
reset role;
drop trigger test_reject_self_history on public.nickname_change_events;
create or replace function pg_temp.reject_self_audit()
returns trigger language plpgsql as $fault$
begin
  if new.action = 'nickname.changed' and new.entity_id = 'c1000000-0000-0000-0000-000000000006' then
    raise exception 'injected_self_audit_failure';
  end if;
  return new;
end;
$fault$;
create trigger test_reject_self_audit before insert on public.audit_logs
for each row execute function pg_temp.reject_self_audit();
set local role service_role;
select throws_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000006','AUDITFAIL')$$,'P0001','injected_self_audit_failure','audit failure rolls back entire change');
select is((select nickname from public.profiles where id='c1000000-0000-0000-0000-000000000006'),'SELFAUD','audit failure preserves previous nickname');
select results_eq($$select count(*) from public.nickname_change_events where user_id='c1000000-0000-0000-0000-000000000006'$$,array[0::bigint],'audit failure rolls back change history');
reset role;
drop trigger test_reject_self_audit on public.audit_logs;
set local role service_role;
select lives_ok($$select public.change_nickname_self_atomic('c1000000-0000-0000-0000-000000000006','AUDITSUCCESS')$$,'recovery after injected failure succeeds');
select results_eq($$select count(*) from public.nickname_change_events where user_id='c1000000-0000-0000-0000-000000000006'$$,array[1::bigint],'event created once after recovery');
select results_eq($$select count(*) from public.audit_logs where entity_id='c1000000-0000-0000-0000-000000000006' and action='nickname.changed'$$,array[1::bigint],'audit created once after recovery');
select * from finish();
rollback;
