-- New invitation and audit are all-or-nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users(id,email) values
('97000000-0000-0000-0000-000000000001','create-admin@hero.test'),
('97000000-0000-0000-0000-000000000002','create-manager-a@hero.test'),
('97000000-0000-0000-0000-000000000003','create-manager-b@hero.test'),
('97000000-0000-0000-0000-000000000004','create-player@hero.test'),
('97000000-0000-0000-0000-000000000005','create-inactive@hero.test');

insert into public.plants(id,code,name,display_name,is_active) values
('98000000-0000-0000-0000-000000000001','CREATE-A','Creation Plant A','Create A',true),
('98000000-0000-0000-0000-000000000002','CREATE-B','Creation Plant B','Create B',true),
('98000000-0000-0000-0000-000000000003','CREATE-OFF','Disabled Plant','Create OFF',false);

insert into public.profiles(id,plant_id,role,job_role,real_name,nickname,is_active) values
('97000000-0000-0000-0000-000000000001',null,'admin',null,'Admin','CREATADM',true),
('97000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','plant_manager',null,'Manager A','CREATMGA',true),
('97000000-0000-0000-0000-000000000003','98000000-0000-0000-0000-000000000002','plant_manager',null,'Manager B','CREATMGB',true),
('97000000-0000-0000-0000-000000000004','98000000-0000-0000-0000-000000000001','player','worker','Player','CREATPLY',true),
('97000000-0000-0000-0000-000000000005','98000000-0000-0000-0000-000000000001','plant_manager',null,'Inactive','CREATOFF',false);
select ok(not has_function_privilege('anon','public.create_invitation_atomic(uuid,uuid,public.app_role,text,public.job_role,text,text,timestamptz)','EXECUTE'),'anonymous cannot issue');
select ok(not has_function_privilege('authenticated','public.create_invitation_atomic(uuid,uuid,public.app_role,text,public.job_role,text,text,timestamptz)','EXECUTE'),'authenticated cannot issue');
select ok(has_function_privilege('service_role','public.create_invitation_atomic(uuid,uuid,public.app_role,text,public.job_role,text,text,timestamptz)','EXECUTE'),'trusted Edge service can issue');
set local role authenticated;
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001','plant_manager','Recipient',null,'Shift',repeat('a',64),now()+interval '7 days')$$,'42501',null,'browser cannot forge admin creation');
reset role;
set local role service_role;
select lives_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001','plant_manager','Recipient',null,'Shift',repeat('a',64),now()+interval '7 days')$$,'admin creates manager invitation');
select results_eq($$select count(*) from public.invitations where token_hash=repeat('a',64) and target_role='plant_manager' and job_role is null and plant_id='98000000-0000-0000-0000-000000000001'$$,array[1::bigint],'manager scope is stored');
select results_eq($$select count(*) from public.audit_logs where actor_user_id='97000000-0000-0000-0000-000000000001' and action='invitation.created'$$,array[1::bigint],'admin issuance audited');
select lives_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','player','Recipient','worker','Shift',repeat('b',64),now()+interval '7 days')$$,'manager creates own plant player invitation');
select results_eq($$select count(*) from public.invitations where token_hash=repeat('b',64) and target_role='player' and job_role='worker' and plant_id='98000000-0000-0000-0000-000000000001'$$,array[1::bigint],'player scope preserved');
select results_eq($$select count(*) from public.audit_logs where actor_user_id='97000000-0000-0000-0000-000000000002' and action='invitation.created'$$,array[1::bigint],'manager issuance audited');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001','player','Recipient','worker','Shift',repeat('c',64),now()+interval '7 days')$$,'P0001','admin_can_only_invite_manager','admin cannot issue player');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','plant_manager','Recipient',null,'Shift',repeat('c',64),now()+interval '7 days')$$,'P0001','manager_scope_violation','manager cannot issue manager invitation');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000002','player','Recipient','worker','Shift',repeat('c',64),now()+interval '7 days')$$,'P0001','manager_scope_violation','manager cannot invite other plant');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000004','98000000-0000-0000-0000-000000000001','player','Recipient','worker','Shift',repeat('c',64),now()+interval '7 days')$$,'P0001','manager_or_admin_required','player cannot issue');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000005','98000000-0000-0000-0000-000000000001','player','Recipient','worker','Shift',repeat('c',64),now()+interval '7 days')$$,'P0001','manager_or_admin_required','inactive manager cannot issue');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000003','plant_manager','Recipient',null,'Shift',repeat('c',64),now()+interval '7 days')$$,'P0001','plant_not_found','inactive plant rejected');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','player','Recipient',null,'Shift',repeat('c',64),now()+interval '7 days')$$,'P0001','job_role_required','player invitation requires job');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001','plant_manager','Recipient','worker','Shift',repeat('c',64),now()+interval '7 days')$$,'P0001','manager_job_role_forbidden','manager invite cannot have job');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','player','Recipient','worker','Shift',repeat('a',64),now()+interval '7 days')$$,'23505',null,'duplicate digest rejected');
select results_eq($$select count(*) from public.audit_logs where actor_user_id='97000000-0000-0000-0000-000000000002' and action='invitation.created'$$,array[1::bigint],'hash failure leaves no extra audit');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','player','Recipient','worker','Shift',repeat('c',64),now()-interval '1 second')$$,'P0001','invalid_invitation_expiration','past expiry rejected');
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','player',' ','worker','Shift',repeat('c',64),now()+interval '7 days')$$,'P0001','invalid_invitee_name','empty invitee name rejected');
reset role;
-- Inject a database audit failure: no usable invite may persist.
create or replace function pg_temp.fail_create_audit()
returns trigger language plpgsql as $fault$
begin
  if new.action = 'invitation.created' and new.actor_user_id = '97000000-0000-0000-0000-000000000003' then
    raise exception 'injected_create_audit_failure';
  end if;
  return new;
end;
$fault$;
create trigger test_reject_issued_audit before insert on public.audit_logs
for each row execute function pg_temp.fail_create_audit();
set local role service_role;
select throws_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000003','98000000-0000-0000-0000-000000000002','player','Recipient','worker','Shift',repeat('d',64),now()+interval '7 days')$$,'P0001','injected_create_audit_failure','audit INSERT failure rolls back invitation INSERT');
select results_eq($$select count(*) from public.invitations where token_hash=repeat('d',64)$$,array[0::bigint],'audit failure leaves no usable invitation');
select results_eq($$select count(*) from public.audit_logs where actor_user_id='97000000-0000-0000-0000-000000000003' and action='invitation.created'$$,array[0::bigint],'audit failure leaves no partial ledger entry');
reset role;
drop trigger test_reject_issued_audit on public.audit_logs;
set local role service_role;
select lives_ok($$select public.create_invitation_atomic('97000000-0000-0000-0000-000000000003','98000000-0000-0000-0000-000000000002','player','Recipient','worker','Shift',repeat('d',64),now()+interval '7 days')$$,'after fault removed normal issuance succeeds');
select results_eq($$select count(*) from public.invitations where token_hash=repeat('d',64)$$,array[1::bigint],'successful retried issuance persisted once');
select * from finish();
rollback;
