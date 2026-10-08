-- pgTAP transactional contract: test records are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id,email) values
('91000000-0000-0000-0000-000000000001','atomic-admin@hero.test'),
('91000000-0000-0000-0000-000000000002','atomic-manager-a@hero.test'),
('91000000-0000-0000-0000-000000000003','atomic-manager-b@hero.test'),
('91000000-0000-0000-0000-000000000004','atomic-inactive@hero.test');

insert into public.plants (id,code,name,display_name) values
('92000000-0000-0000-0000-000000000001','ATOMIC-A','Atomic Plant A','Atomic A'),
('92000000-0000-0000-0000-000000000002','ATOMIC-B','Atomic Plant B','Atomic B');

insert into public.profiles
(id,plant_id,role,job_role,real_name,nickname,is_active) values
('91000000-0000-0000-0000-000000000001',null,'admin',null,'Admin','ATOMICADM',true),
('91000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','plant_manager',null,'Manager A','ATOMICMGA',true),
('91000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000002','plant_manager',null,'Manager B','ATOMICMGB',true),
('91000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000001','plant_manager',null,'Inactive','ATOMICOFF',false);

insert into public.invitations
(id,token_hash,plant_id,target_role,invitee_name,job_role,team_name,created_by,expires_at)
values
('93000000-0000-0000-0000-000000000001','old-atomic-admin','92000000-0000-0000-0000-000000000001','plant_manager','Manager',null,'Education','91000000-0000-0000-0000-000000000001',now()+interval '1 day'),
('93000000-0000-0000-0000-000000000002','old-atomic-player-a','92000000-0000-0000-0000-000000000001','player','Player A','worker','Shift A','91000000-0000-0000-0000-000000000002',now()+interval '1 day'),
('93000000-0000-0000-0000-000000000003','old-atomic-player-b','92000000-0000-0000-0000-000000000002','player','Player B','worker','Shift B','91000000-0000-0000-0000-000000000003',now()+interval '1 day'),
('93000000-0000-0000-0000-000000000004','old-atomic-collision','92000000-0000-0000-0000-000000000001','player','Collision','worker','Shift A','91000000-0000-0000-0000-000000000002',now()+interval '1 day');
select ok(not has_function_privilege('anon','public.reissue_invitation_atomic(uuid,uuid,text,timestamptz)','EXECUTE'), 'anonymous cannot invoke RPC');
select ok(not has_function_privilege('authenticated','public.reissue_invitation_atomic(uuid,uuid,text,timestamptz)','EXECUTE'), 'authenticated cannot invoke RPC');
select ok(has_function_privilege('service_role','public.reissue_invitation_atomic(uuid,uuid,text,timestamptz)','EXECUTE'), 'service role can invoke RPC');
set local role authenticated;
select throws_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',repeat('a',64),now()+interval '7 days')$$, '42501', null, 'forged admin ID cannot bypass function permission');
reset role;
set local role service_role;
select lives_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',repeat('a',64),now()+interval '7 days')$$, 'admin reissues manager invitation');
select results_eq($$select count(*) from public.invitations where id='93000000-0000-0000-0000-000000000001' and canceled_at is not null$$, array[1::bigint], 'old manager invite is canceled');
select results_eq($$select count(*) from public.invitations where token_hash=repeat('a',64) and target_role='plant_manager' and job_role is null and team_name='Education'$$, array[1::bigint], 'manager replacement preserves scope');
select results_eq($$select count(*) from public.audit_logs where actor_user_id='91000000-0000-0000-0000-000000000001' and action in ('invitation.reissued','invitation.canceled_for_reissue')$$, array[2::bigint], 'two audit logs are atomic');
select throws_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',repeat('c',64),now()+interval '7 days')$$, 'P0001', 'invitation_already_canceled', 'double reissue denied');
select throws_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000001',repeat('c',64),now()+interval '7 days')$$, 'P0001', 'admin_invitation_scope_violation', 'admin cannot reissue player invite');
select throws_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000002',repeat('c',64),now()+interval '7 days')$$, 'P0001', 'manager_scope_violation', 'cross plant reissue denied');
select throws_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000004',repeat('c',64),now()+interval '7 days')$$, 'P0001', 'manager_or_admin_required', 'inactive actor denied');
select lives_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000002',repeat('b',64),now()+interval '7 days')$$, 'manager can reissue local player invitation');
select results_eq($$select count(*) from public.invitations where token_hash=repeat('b',64) and target_role='player' and job_role='worker' and team_name='Shift A' and plant_id='92000000-0000-0000-0000-000000000001'$$, array[1::bigint], 'replacement preserves job and plant');
select results_eq($$select count(*) from public.audit_logs where actor_user_id='91000000-0000-0000-0000-000000000002' and action in ('invitation.reissued','invitation.canceled_for_reissue')$$, array[2::bigint], 'manager reissue records both audits');
select throws_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000002',repeat('b',64),now()+interval '7 days')$$, '23505', null, 'duplicate hash causes rollback');
select results_eq($$select count(*) from public.invitations where id='93000000-0000-0000-0000-000000000004' and canceled_at is null and accepted_at is null$$, array[1::bigint], 'collision leaves old invite valid');
select results_eq($$select count(*) from public.audit_logs where entity_id='93000000-0000-0000-0000-000000000004' and action='invitation.canceled_for_reissue'$$, array[0::bigint], 'rollback removes audit artifacts');
select throws_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000002','notsha256',now()+interval '7 days')$$,'P0001','invalid_invitation_token_hash','invalid digest rejected');
select throws_ok($$select public.reissue_invitation_atomic('93000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000002',repeat('c',64),now()-interval '1 second')$$, 'P0001', 'invalid_invitation_expiration', 'expired replacement rejected');
select results_eq($$select count(*) from public.invitations where id='93000000-0000-0000-0000-000000000004' and canceled_at is null$$, array[1::bigint], 'invalid input does not cancel original');
select * from finish();
rollback;
