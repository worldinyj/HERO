-- T5-03: server-authoritative completion is idempotent and fully transactional.
-- This test intentionally does NOT claim to simulate two simultaneous PG clients.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, email) values
('e1a00000-0000-0000-0000-000000000001','completion-primary@hero.test'),
('e1a00000-0000-0000-0000-000000000002','completion-other@hero.test');
insert into public.plants (id, code, name, display_name)
values ('e2a00000-0000-0000-0000-000000000001','COMPLETION-T','Completion Test','Completion Test');
insert into public.profiles (id, plant_id, role, job_role, real_name, nickname, is_active)
values
('e1a00000-0000-0000-0000-000000000001','e2a00000-0000-0000-0000-000000000001',
'player','worker','Complete One','COMPL1',true),
('e1a00000-0000-0000-0000-000000000002','e2a00000-0000-0000-0000-000000000001',
'player','worker','Complete Two','COMPL2',true);
insert into public.seasons (id, season_key, title, starts_at, ends_at, status)
values ('e3a00000-0000-0000-0000-000000000001',
'completion-atomic-2097','Completion Atomic Test',now()-interval '1 day',
now()+interval '7 days','open');
insert into public.scenarios (id, slug, title, is_competitive, is_active)
values ('e4a00000-0000-0000-0000-000000000001','completion_atomic_test','Atomic Test',true,true);
insert into public.scenario_versions
(id,scenario_id,version,status,default_perspective_role,content)
values ('e5a00000-0000-0000-0000-000000000001',
'e4a00000-0000-0000-0000-000000000001',1,'published','worker','{}'::jsonb);
insert into public.play_sessions
(id,user_id,plant_id,player_job_role,perspective_role,season_id,
scenario_version_id,simulation_seed,presentation_seed,status)
values
('e6a00000-0000-0000-0000-000000000001','e1a00000-0000-0000-0000-000000000001',
'e2a00000-0000-0000-0000-000000000001','worker','worker',
'e3a00000-0000-0000-0000-000000000001','e5a00000-0000-0000-0000-000000000001',
'atomic-test-seed-01','atomic-test-presentation-01','in_progress'),
('e6a00000-0000-0000-0000-000000000004','e1a00000-0000-0000-0000-000000000002',
'e2a00000-0000-0000-0000-000000000001','worker','worker',
'e3a00000-0000-0000-0000-000000000001','e5a00000-0000-0000-0000-000000000001',
'atomic-test-seed-04','atomic-test-presentation-04','flagged');

-- Browser roles must never bypass the Edge Function to forge score/decisions.
select ok(not has_function_privilege('anon',
'public.complete_play_session_atomic(uuid,uuid,text,jsonb,integer,text,jsonb,jsonb)','EXECUTE'),
'anonymous users cannot execute score completion RPC');
select ok(not has_function_privilege('authenticated',
'public.complete_play_session_atomic(uuid,uuid,text,jsonb,integer,text,jsonb,jsonb)','EXECUTE'),
'authenticated browsers cannot execute service completion RPC');
select ok(has_function_privilege('service_role',
'public.complete_play_session_atomic(uuid,uuid,text,jsonb,integer,text,jsonb,jsonb)','EXECUTE'),
'service role is the only API caller allowed');
set local role authenticated;
select throws_ok($$select public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000001',
'e1a00000-0000-0000-0000-000000000001',
'safe_complete','{}'::jsonb,245,'v1','{}'::jsonb,'[]'::jsonb)$$,
'42501',null,'browser cannot claim a completed score');
reset role;

set local role service_role;
select throws_ok($$select public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000009',
'e1a00000-0000-0000-0000-000000000001',
'safe_complete','{}'::jsonb,245,'v1','{}'::jsonb,'[]'::jsonb)$$,
'P0001','session_not_found','missing session is rejected');
select throws_ok($$select public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000001',
'e1a00000-0000-0000-0000-000000000002',
'safe_complete','{}'::jsonb,245,'v1','{}'::jsonb,'[]'::jsonb)$$,
'P0001','session_owner_mismatch','wrong owner cannot commit session');
select throws_ok($$select public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000004',
'e1a00000-0000-0000-0000-000000000002',
'safe_complete','{}'::jsonb,245,'v1','{}'::jsonb,'[]'::jsonb)$$,
'P0001','session_not_in_progress','flagged session cannot be finalized');

-- First confirmed write stores the authoritative score, user actions and one audit.
select is((public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000001',
'e1a00000-0000-0000-0000-000000000001',
'safe_complete','{"safety":90}'::jsonb,245,'v1',
'{"ending":"safe_complete","hpPoint":245}'::jsonb,
'[{"seq":0,"node_id":"start","action_type":"continue","action_id":"","clock_before":0,"clock_after":1},{"seq":1,"node_id":"decision","action_type":"choice","action_id":"verify","clock_before":1,"clock_after":2}]'::jsonb
)->>'already_completed')::boolean,false,'first completion is not a replay receipt');
select is((select status::text from public.play_sessions
where id='e6a00000-0000-0000-0000-000000000001'),'completed','status is committed');
select is((select hp_point from public.play_sessions
where id='e6a00000-0000-0000-0000-000000000001'),245,'first score is authoritative');
select results_eq($$select count(*) from public.session_decisions
where session_id='e6a00000-0000-0000-0000-000000000001'$$,
array[2::bigint],'exactly two source decisions committed');
select results_eq($$select count(*) from public.audit_logs
where action='play_session.completed' and entity_id='e6a00000-0000-0000-0000-000000000001'$$,
array[1::bigint],'first completion produces one audit record');
select is((select action_id from public.session_decisions
where session_id='e6a00000-0000-0000-0000-000000000001' and seq=1),
'verify','decision contents survive the transaction');
select is((select metrics->>'safety' from public.play_sessions
where id='e6a00000-0000-0000-0000-000000000001'),
'90','authoritative metrics saved');

-- A malicious/stale duplicate with different scores and decisions may only
-- read the first committed result; it cannot overwrite anything.
select is((public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000001',
'e1a00000-0000-0000-0000-000000000001',
'event','{"safety":1}'::jsonb,1,'forged',
'{"ending":"event","hpPoint":1}'::jsonb,
'[{"seq":99,"node_id":"forged","action_type":"choice","clock_before":0,"clock_after":0}]'::jsonb
)->>'already_completed')::boolean,true,'duplicate returns already_completed=true');
select is((select hp_point from public.play_sessions
where id='e6a00000-0000-0000-0000-000000000001'),245,'duplicate cannot change score');
select is((select evaluation->>'ending' from public.play_sessions
where id='e6a00000-0000-0000-0000-000000000001'),
'safe_complete','duplicate cannot change stored evaluation');
select results_eq($$select count(*) from public.session_decisions
where session_id='e6a00000-0000-0000-0000-000000000001'$$,
array[2::bigint],'duplicate cannot insert decisions');
select results_eq($$select count(*) from public.audit_logs
where action='play_session.completed' and entity_id='e6a00000-0000-0000-0000-000000000001'$$,
array[1::bigint],'duplicate cannot create another audit');
select throws_ok($$select public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000001',
'e1a00000-0000-0000-0000-000000000002',
'safe_complete','{}'::jsonb,1,'v1','{}'::jsonb,'[]'::jsonb)$$,
'P0001','session_owner_mismatch','completed session cannot be read by different owner');

-- Unique decision violation must roll back the status and all inserted rows.
insert into public.play_sessions
(id,user_id,plant_id,player_job_role,perspective_role,season_id,
scenario_version_id,simulation_seed,presentation_seed,status)
values ('e6a00000-0000-0000-0000-000000000002',
'e1a00000-0000-0000-0000-000000000001',
'e2a00000-0000-0000-0000-000000000001','worker','worker',
'e3a00000-0000-0000-0000-000000000001',
'e5a00000-0000-0000-0000-000000000001',
'atomic-test-seed-02','atomic-test-presentation-02','in_progress');
select throws_ok($$select public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000002',
'e1a00000-0000-0000-0000-000000000001',
'safe_stop','{"safety":50}'::jsonb,140,'v1',
'{"ending":"safe_stop","hpPoint":140}'::jsonb,
'[{"seq":0,"node_id":"a","action_type":"continue","clock_before":0,"clock_after":1},{"seq":0,"node_id":"b","action_type":"continue","clock_before":1,"clock_after":2}]'::jsonb)$$,
'23505',null,'invalid repeated decision seq aborts completion');
select is((select status::text from public.play_sessions
where id='e6a00000-0000-0000-0000-000000000002'),'in_progress',
'decision failure rolls back completed status');
select results_eq($$select count(*) from public.session_decisions
where session_id='e6a00000-0000-0000-0000-000000000002'$$,
array[0::bigint],'decision failure leaves no partial actions');
select results_eq($$select count(*) from public.audit_logs
where action='play_session.completed' and entity_id='e6a00000-0000-0000-0000-000000000002'$$,
array[0::bigint],'decision failure leaves no audit');
select is((public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000002',
'e1a00000-0000-0000-0000-000000000001',
'safe_stop','{"safety":50}'::jsonb,140,'v1',
'{"ending":"safe_stop","hpPoint":140}'::jsonb,
'[{"seq":0,"node_id":"a","action_type":"continue","clock_before":0,"clock_after":1}]'::jsonb
)->>'already_completed')::boolean,false,'corrected retry commits after decision rollback');
select results_eq($$select count(*) from public.session_decisions
where session_id='e6a00000-0000-0000-0000-000000000002'$$,
array[1::bigint],'corrected retry records decisions once');
select results_eq($$select count(*) from public.audit_logs
where action='play_session.completed' and entity_id='e6a00000-0000-0000-0000-000000000002'$$,
array[1::bigint],'corrected retry records one audit');

-- Fault injection proves audit INSERT and earlier session/decisions roll back
-- as one database transaction. Both trigger and its function are rolled back.
insert into public.play_sessions
(id,user_id,plant_id,player_job_role,perspective_role,season_id,
scenario_version_id,simulation_seed,presentation_seed,status)
values ('e6a00000-0000-0000-0000-000000000003',
'e1a00000-0000-0000-0000-000000000001',
'e2a00000-0000-0000-0000-000000000001','worker','worker',
'e3a00000-0000-0000-0000-000000000001',
'e5a00000-0000-0000-0000-000000000001',
'atomic-test-seed-03','atomic-test-presentation-03','in_progress');
reset role;
create or replace function pg_temp.reject_completion_audit()
returns trigger language plpgsql as $inject$
begin
  if new.action='play_session.completed'
     and new.entity_id='e6a00000-0000-0000-0000-000000000003' then
    raise exception 'injected_completion_audit_failure';
  end if;
  return new;
end;
$inject$;
create trigger test_completion_audit_abort
before insert on public.audit_logs
for each row execute function pg_temp.reject_completion_audit();
set local role service_role;
select throws_ok($$select public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000003',
'e1a00000-0000-0000-0000-000000000001',
'safe_complete','{"safety":60}'::jsonb,160,'v1',
'{"ending":"safe_complete","hpPoint":160}'::jsonb,
'[{"seq":0,"node_id":"a","action_type":"continue","clock_before":0,"clock_after":1}]'::jsonb)$$,
'P0001','injected_completion_audit_failure','audit failure aborts the completion');
select is((select status::text from public.play_sessions
where id='e6a00000-0000-0000-0000-000000000003'),'in_progress',
'audit failure restores in-progress state');
select results_eq($$select count(*) from public.session_decisions
where session_id='e6a00000-0000-0000-0000-000000000003'$$,
array[0::bigint],'audit failure rolls back inserted decisions');
select results_eq($$select count(*) from public.audit_logs
where action='play_session.completed' and entity_id='e6a00000-0000-0000-0000-000000000003'$$,
array[0::bigint],'audit failure leaves no partial audit');
reset role;
drop trigger test_completion_audit_abort on public.audit_logs;
set local role service_role;
select is((public.complete_play_session_atomic(
'e6a00000-0000-0000-0000-000000000003',
'e1a00000-0000-0000-0000-000000000001',
'safe_complete','{"safety":60}'::jsonb,160,'v1',
'{"ending":"safe_complete","hpPoint":160}'::jsonb,
'[{"seq":0,"node_id":"a","action_type":"continue","clock_before":0,"clock_after":1}]'::jsonb
)->>'already_completed')::boolean,false,'retry after audit fault succeeds once');
select results_eq($$select count(*) from public.audit_logs
where action='play_session.completed' and entity_id='e6a00000-0000-0000-0000-000000000003'$$,
array[1::bigint],'restored audit path writes one event');
reset role;
select * from finish();
rollback;
