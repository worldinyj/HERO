-- Cancellation must lock the original invitation and atomically append audit.
-- Fixtures, including the injected audit failure trigger, all roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users(id,email) values
  ('94000000-0000-0000-0000-000000000001','cancel-admin@hero.test'),
  ('94000000-0000-0000-0000-000000000002','cancel-manager-a@hero.test'),
  ('94000000-0000-0000-0000-000000000003','cancel-manager-b@hero.test'),
  ('94000000-0000-0000-0000-000000000004','cancel-inactive@hero.test'),
  ('94000000-0000-0000-0000-000000000005','cancel-player@hero.test');

insert into public.plants(id,code,name,display_name) values
  ('95000000-0000-0000-0000-000000000001','CANCEL-A','Cancel Plant A','Cancel A'),
  ('95000000-0000-0000-0000-000000000002','CANCEL-B','Cancel Plant B','Cancel B');

insert into public.profiles(id,plant_id,role,job_role,real_name,nickname,is_active) values
  ('94000000-0000-0000-0000-000000000001',null,'admin',null,'Admin','CANCADM',true),
  ('94000000-0000-0000-0000-000000000002','95000000-0000-0000-0000-000000000001','plant_manager',null,'Manager A','CANCMGA',true),
  ('94000000-0000-0000-0000-000000000003','95000000-0000-0000-0000-000000000002','plant_manager',null,'Manager B','CANCMGB',true),
  ('94000000-0000-0000-0000-000000000004','95000000-0000-0000-0000-000000000001','plant_manager',null,'Inactive','CANCOFF',false),
  ('94000000-0000-0000-0000-000000000005','95000000-0000-0000-0000-000000000001','player','worker','Player','CANCPLY',true);

insert into public.invitations(
 id,token_hash,plant_id,target_role,invitee_name,job_role,team_name,created_by,expires_at,
 accepted_at,canceled_at
) values
 ('96000000-0000-0000-0000-000000000001','cancel-player-a','95000000-0000-0000-0000-000000000001','player','Player A','worker','Shift A','94000000-0000-0000-0000-000000000002',now()+interval '2 days',null,null),
 ('96000000-0000-0000-0000-000000000002','cancel-admin-manager','95000000-0000-0000-0000-000000000001','plant_manager','Manager A',null,'Education','94000000-0000-0000-0000-000000000001',now()+interval '2 days',null,null),
 ('96000000-0000-0000-0000-000000000003','cancel-player-b','95000000-0000-0000-0000-000000000002','player','Player B','worker','Shift B','94000000-0000-0000-0000-000000000003',now()+interval '2 days',null,null),
 ('96000000-0000-0000-0000-000000000004','cancel-already-accepted','95000000-0000-0000-0000-000000000001','player','Accepted','worker',null,'94000000-0000-0000-0000-000000000002',now()+interval '2 days',now(),null),
 ('96000000-0000-0000-0000-000000000005','cancel-already-canceled','95000000-0000-0000-0000-000000000001','player','Canceled','worker',null,'94000000-0000-0000-0000-000000000002',now()+interval '2 days',null,now()),
 ('96000000-0000-0000-0000-000000000006','cancel-reissue-first','95000000-0000-0000-0000-000000000001','player','Rotated','worker',null,'94000000-0000-0000-0000-000000000002',now()+interval '2 days',null,null),
 ('96000000-0000-0000-0000-000000000007','cancel-audit-failure','95000000-0000-0000-0000-000000000001','player','Failure','worker',null,'94000000-0000-0000-0000-000000000002',now()+interval '2 days',null,null);
select ok(not has_function_privilege('anon','public.cancel_invitation_atomic(uuid,uuid)','EXECUTE'), 'anonymous cannot cancel');
select ok(not has_function_privilege('authenticated','public.cancel_invitation_atomic(uuid,uuid)','EXECUTE'), 'authenticated cannot cancel');
select ok(has_function_privilege('service_role','public.cancel_invitation_atomic(uuid,uuid)','EXECUTE'), 'only service role can cancel');
set local role authenticated;
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001')$$,'42501',null,'forged admin caller lacks permission');
reset role;
set local role service_role;
select lives_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002')$$,'manager cancels own-plant player invitation');
select results_eq($$select count(*) from public.invitations where id='96000000-0000-0000-0000-000000000001' and canceled_at is not null and accepted_at is null$$, array[1::bigint], 'cancel timestamp committed');
select results_eq($$select count(*) from public.audit_logs where action='invitation.canceled' and entity_id='96000000-0000-0000-0000-000000000001' and actor_user_id='94000000-0000-0000-0000-000000000002'$$, array[1::bigint], 'single matching audit record committed');
select ok((select metadata->>'operator_role' from public.audit_logs where action='invitation.canceled' and entity_id='96000000-0000-0000-0000-000000000001') = 'plant_manager', 'audit retains operator role');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002')$$,'P0001','invitation_already_canceled','duplicate cancellation rejected');
select lives_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000001')$$,'admin cancels manager invitation');
select results_eq($$select count(*) from public.audit_logs where action='invitation.canceled' and entity_id='96000000-0000-0000-0000-000000000002'$$, array[1::bigint], 'admin action audited');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000002','94000000-0000-0000-0000-000000000002')$$,'P0001','manager_scope_violation','manager cannot cancel admin-managed manager invitation');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000001')$$,'P0001','admin_invitation_scope_violation','admin cannot cancel player invite');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000002')$$,'P0001','manager_scope_violation','cross-plant cancellation denied');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000004')$$,'P0001','manager_or_admin_required','inactive manager denied');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000003','94000000-0000-0000-0000-000000000005')$$,'P0001','manager_or_admin_required','player actor denied');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000004','94000000-0000-0000-0000-000000000002')$$,'P0001','invitation_already_accepted','accepted invitation cannot be canceled');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000005','94000000-0000-0000-0000-000000000002')$$,'P0001','invitation_already_canceled','previously canceled invitation rejected');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000009999','94000000-0000-0000-0000-000000000002')$$,'P0001','invitation_not_found','missing invitation denied');
select throws_ok($$select public.reissue_invitation_atomic('96000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002',repeat('a',64),now()+interval '7 days')$$,'P0001','invitation_already_canceled','cancel prevents later reissue');
select lives_ok($$select public.reissue_invitation_atomic('96000000-0000-0000-0000-000000000006','94000000-0000-0000-0000-000000000002',repeat('b',64),now()+interval '7 days')$$,'reissue-first succeeds');
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000006','94000000-0000-0000-0000-000000000002')$$,'P0001','invitation_already_canceled','reissue prevents later cancellation of old token');
reset role;
-- Inject audit INSERT failure to prove the original cancellation rolls back.
create or replace function pg_temp.fail_cancellation_audit()
returns trigger language plpgsql as $function$
begin
  raise exception 'injected_audit_failure';
end;
$function$;

create trigger test_fail_cancel_audit
before insert on public.audit_logs
for each row when (new.action = 'invitation.canceled' and new.entity_id = '96000000-0000-0000-0000-000000000007')
execute function pg_temp.fail_cancellation_audit();

set local role service_role;
select throws_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000007','94000000-0000-0000-0000-000000000002')$$,'P0001','injected_audit_failure','audit failure rolls back entire cancellation');
select results_eq($$select count(*) from public.invitations where id='96000000-0000-0000-0000-000000000007' and canceled_at is null$$, array[1::bigint], 'old invitation remains valid on audit failure');
select results_eq($$select count(*) from public.audit_logs where action='invitation.canceled' and entity_id='96000000-0000-0000-0000-000000000007'$$, array[0::bigint], 'failed cancellation writes no audit');
reset role;
drop trigger test_fail_cancel_audit on public.audit_logs;
set local role service_role;
select lives_ok($$select public.cancel_invitation_atomic('96000000-0000-0000-0000-000000000007','94000000-0000-0000-0000-000000000002')$$,'retry after removing fault succeeds');
select results_eq($$select count(*) from public.invitations where id='96000000-0000-0000-0000-000000000007' and canceled_at is not null$$, array[1::bigint], 'successful recovery cancels old invitation');
select * from finish();
rollback;
