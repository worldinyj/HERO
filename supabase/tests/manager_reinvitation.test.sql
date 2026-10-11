begin;
create extension if not exists pgtap with schema extensions;
select plan(31);
insert into auth.users(id,email) values
('f5100000-0000-0000-0000-000000000001','reinvite-admin@hero.test'),
('f5100000-0000-0000-0000-000000000002','reinvite-manager@hero.test'),
('f5100000-0000-0000-0000-000000000003','reinvite-other@hero.test'),
('f5100000-0000-0000-0000-000000000004','reinvite-inactive@hero.test');
insert into public.plants(id,code,name,display_name) values
('f5200000-0000-0000-0000-000000000001','REINVITE','Reinvite Test','Reinvite');
insert into public.profiles(id,plant_id,role,real_name,nickname,is_active) values
('f5100000-0000-0000-0000-000000000001',null,'admin','Admin','RIADMIN',true),
('f5100000-0000-0000-0000-000000000002','f5200000-0000-0000-0000-000000000001','plant_manager','Manager','RIMANAGER',true),
('f5100000-0000-0000-0000-000000000003','f5200000-0000-0000-0000-000000000001','player','Other','RIOTHER',true),
('f5100000-0000-0000-0000-000000000004','f5200000-0000-0000-0000-000000000001','plant_manager','Inactive','RIOFF',false);
create temp table original_manager as select md5(row_to_json(p)::text) as digest from public.profiles p where id='f5100000-0000-0000-0000-000000000002';
select ok(not has_function_privilege('anon','public.reinvite_manager_atomic(uuid,uuid,text,timestamptz)','EXECUTE'),'anon denied');
select ok(not has_function_privilege('authenticated','public.reinvite_manager_atomic(uuid,uuid,text,timestamptz)','EXECUTE'),'browser denied');
select ok(has_function_privilege('service_role','public.reinvite_manager_atomic(uuid,uuid,text,timestamptz)','EXECUTE'),'service role permitted');
set local role service_role;
select throws_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000002','f5100000-0000-0000-0000-000000000002',repeat('a',64),now()+interval '7 days')$$,'P0001','admin_required','manager cannot issue reentry links');
select throws_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000001','f5100000-0000-0000-0000-000000000003',repeat('a',64),now()+interval '7 days')$$,'P0001','active_manager_required','player target denied');
select throws_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000001','f5100000-0000-0000-0000-000000000004',repeat('a',64),now()+interval '7 days')$$,'P0001','active_manager_required','inactive manager denied');
select throws_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000001','f5100000-0000-0000-0000-000000000002','bad',now()+interval '7 days')$$,'P0001','invalid_invitation_token_hash','invalid digest denied');
select throws_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000001','f5100000-0000-0000-0000-000000000002',repeat('a',64),now()+interval '9 days')$$,'P0001','invalid_invitation_expiration','long expiry denied');
select lives_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000001','f5100000-0000-0000-0000-000000000002',repeat('a',64),now()+interval '7 days')$$,'admin generates link');
select is((select target_profile_id from public.invitations where token_hash=repeat('a',64)),'f5100000-0000-0000-0000-000000000002'::uuid,'link bound to existing identity');
select results_eq($$select count(*) from public.audit_logs where action='manager.reinvited' and metadata->>'target_profile_id'='f5100000-0000-0000-0000-000000000002'$$,array[1::bigint],'audited issuance');
select throws_ok($$select public.accept_invitation_atomic(repeat('a',64),'f5100000-0000-0000-0000-000000000003','RIOTHER',now(),now())$$,'P0001','invitation_account_mismatch','wrong account cannot consume link');
select ok((select accepted_at is null from public.invitations where token_hash=repeat('a',64)),'wrong account leaves link usable');
select lives_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000001','f5100000-0000-0000-0000-000000000002',repeat('b',64),now()+interval '7 days')$$,'regenerate new link');
select ok((select canceled_at is not null from public.invitations where token_hash=repeat('a',64)),'previous unused recovery link canceled');
select lives_ok($$select public.reissue_invitation_atomic((select id from public.invitations where token_hash=repeat('b',64)),'f5100000-0000-0000-0000-000000000001',repeat('c',64),now()+interval '7 days')$$,'pending-list reissue works');
select is((select target_profile_id from public.invitations where token_hash=repeat('c',64)),'f5100000-0000-0000-0000-000000000002'::uuid,'pending-list reissue keeps identity binding');
select throws_ok($$select public.accept_invitation_atomic(repeat('c',64),'f5100000-0000-0000-0000-000000000003',null,null,null)$$,'P0001','invitation_account_mismatch','reissued link also rejects wrong account');
select lives_ok($$select public.accept_invitation_atomic(repeat('c',64),'f5100000-0000-0000-0000-000000000002',null,null,null)$$,'existing manager accepts without re-enrollment');
reset role;
select is((select md5(row_to_json(p)::text) from public.profiles p where id='f5100000-0000-0000-0000-000000000002'),(select digest from original_manager),'all existing profile fields preserved');
set local role service_role;
select throws_ok($$select public.accept_invitation_atomic(repeat('c',64),'f5100000-0000-0000-0000-000000000002',null,null,null)$$,'P0001','invitation_already_used','reentry is single-use');
select lives_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000001','f5100000-0000-0000-0000-000000000002',repeat('d',64),now()+interval '7 days')$$,'new reentry after consumed link');
reset role;
create or replace function pg_temp.reject_reinvite_audit() returns trigger language plpgsql as $$
begin
 if new.action='manager.reinvited' then raise exception 'injected_reinvite_audit_failure'; end if;
 return new;
end;
$$;
create trigger test_reject_reinvite_audit before insert on public.audit_logs for each row execute function pg_temp.reject_reinvite_audit();
set local role service_role;
select throws_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000001','f5100000-0000-0000-0000-000000000002',repeat('e',64),now()+interval '7 days')$$,'P0001','injected_reinvite_audit_failure','audit failure rolls back regeneration');
select ok((select canceled_at is null from public.invitations where token_hash=repeat('d',64)),'audit failure preserves old valid link');
select results_eq($$select count(*) from public.invitations where token_hash=repeat('e',64)$$,array[0::bigint],'audit failure leaves no new link');
reset role;
drop trigger test_reject_reinvite_audit on public.audit_logs;
set local role service_role;
select lives_ok($$select public.set_plant_active_atomic('f5100000-0000-0000-0000-000000000001','f5200000-0000-0000-0000-000000000001',false)$$,'suspend plant');
select throws_ok($$select public.reinvite_manager_atomic('f5100000-0000-0000-0000-000000000001','f5100000-0000-0000-0000-000000000002',repeat('f',64),now()+interval '7 days')$$,'P0001','plant_inactive','suspended plant denies issuance');
select throws_ok($$select public.accept_invitation_atomic(repeat('d',64),'f5100000-0000-0000-0000-000000000002',null,null,null)$$,'P0001','plant_inactive','suspended plant denies acceptance');
select lives_ok($$select public.set_plant_active_atomic('f5100000-0000-0000-0000-000000000001','f5200000-0000-0000-0000-000000000001',true)$$,'resume plant');
select throws_ok($$select public.accept_invitation_atomic(repeat('d',64),'f5100000-0000-0000-0000-000000000002',null,null,null)$$,'P0001','plant_invitation_revoked','resume does not revive old link');
select results_eq($$select count(*) from public.profiles where id in ('f5100000-0000-0000-0000-000000000002','f5100000-0000-0000-0000-000000000003')$$,array[2::bigint],'no duplicate or replacement profiles');
select * from finish();
rollback;
