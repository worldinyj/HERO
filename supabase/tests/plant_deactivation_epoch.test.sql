-- Plant suspension: token epochs, DB write guards, preserved game history.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users(id,email) values
('f1000000-0000-0000-0000-000000000001','epoch-admin@hero.test'),
('f1000000-0000-0000-0000-000000000002','epoch-manager@hero.test'),
('f1000000-0000-0000-0000-000000000003','epoch-player@hero.test');

insert into public.plants(id,code,name,display_name) values
('f2000000-0000-0000-0000-000000000001','EPOCHA','Epoch A','Epoch A');

insert into public.profiles(id,plant_id,role,job_role,real_name,nickname,is_active)
values
('f1000000-0000-0000-0000-000000000001',null,'admin',null,'Admin','EPADMIN',true),
('f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','plant_manager',null,'Manager','EPMAN',true),
('f1000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001','player','worker','Player','EPPLAYER',true);

insert into public.seasons(id,season_key,title,starts_at,ends_at,status)
values ('f3000000-0000-0000-0000-000000000001','epoch-plant-2098','Epoch season',
  now()-interval '1 day',now()+interval '7 days','scheduled');
insert into public.scenarios(id,slug,title,is_competitive,is_active)
values ('f4000000-0000-0000-0000-000000000001','epoch_guard_case','Epoch guard',true,true);
insert into public.scenario_versions(
  id,scenario_id,version,status,default_perspective_role,content
) values ('f5000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000001',1,'published','worker','{}'::jsonb);

insert into public.play_sessions(
  id,user_id,plant_id,player_job_role,perspective_role,season_id,
  scenario_version_id,simulation_seed,presentation_seed,status
) values (
  'f6000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001','worker','worker','f3000000-0000-0000-0000-000000000001',
  'f5000000-0000-0000-0000-000000000001','0123456789abcdef','0123456789abcdef','in_progress'
);

insert into public.invitations(
  id,token_hash,plant_id,target_role,invitee_name,job_role,created_by,expires_at
) values ('f7000000-0000-0000-0000-000000000001','epoch-token-original','f2000000-0000-0000-0000-000000000001','player','Future Player','worker','f1000000-0000-0000-0000-000000000002',now()+interval '2 days');
select is((select invitation_epoch from public.plants where id='f2000000-0000-0000-0000-000000000001'),0::bigint,'new plant epoch starts at zero');
select is((select plant_invitation_epoch from public.invitations where id='f7000000-0000-0000-0000-000000000001'),0::bigint,'original invitation stamped with epoch zero');
select ok((select status='in_progress' from public.play_sessions where id='f6000000-0000-0000-0000-000000000001'),'session starts before deactivation');
set local role service_role;
select lives_ok($$select public.set_plant_active_atomic('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001',false)$$,'admin deactivates plant');
select is((select invitation_epoch from public.plants where id='f2000000-0000-0000-0000-000000000001'),1::bigint,'deactivation rotates invitation epoch');
select ok((select is_active=false from public.plants where id='f2000000-0000-0000-0000-000000000001'),'plant deactivated');
select results_eq($$select count(*) from public.audit_logs where plant_id='f2000000-0000-0000-0000-000000000001' and action='plant.active_changed' and (metadata->>'pending_invites_invalidated')::bigint=1$$,array[1::bigint],'deactivation audit identifies invalidated pending invite');
select throws_ok($$insert into public.invitations(
id,token_hash,plant_id,target_role,invitee_name,job_role,created_by,expires_at
) values ('f7000000-0000-0000-0000-000000000002','epoch-token-new-blocked','f2000000-0000-0000-0000-000000000001','player','Blocked','worker','f1000000-0000-0000-0000-000000000002',now()+interval '2 days')$$,'P0001','plant_inactive','new invitation rejected during suspension');
select throws_ok($$update public.invitations set accepted_at=now(),accepted_by='f1000000-0000-0000-0000-000000000003' where id='f7000000-0000-0000-0000-000000000001'$$,'P0001','plant_inactive','pending invitation cannot be accepted during suspension');
select throws_ok($$update public.profiles set nickname='BLOCKEDNEW' where id='f1000000-0000-0000-0000-000000000003'$$,'P0001','plant_inactive','suspended plant player profile cannot mutate');
select throws_ok($$update public.play_sessions set status='completed' where id='f6000000-0000-0000-0000-000000000001'$$,'P0001','plant_inactive','in-progress session cannot complete while disabled');
select throws_ok($$insert into public.play_sessions(
user_id,plant_id,player_job_role,perspective_role,season_id,scenario_version_id,simulation_seed,presentation_seed
) values ('f1000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001','worker','worker','f3000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000001','0123456789abcdef','0123456789abcdef')$$,'P0001','plant_inactive','cannot start session while plant disabled');
select ok((select status='in_progress' from public.play_sessions where id='f6000000-0000-0000-0000-000000000001'),'original session preserved for later resume');
select ok((select nickname='EPPLAYER' from public.profiles where id='f1000000-0000-0000-0000-000000000003'),'player profile preserved during suspension');
select results_eq($$select count(*) from public.invitations where id='f7000000-0000-0000-0000-000000000001' and canceled_at is null and accepted_at is null$$,array[1::bigint],'pending invitation row retained as historical evidence');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000002';
select is((select private.auth_role())::text,null::text,'suspended manager loses RLS active role');
select is((select private.auth_plant()),null::uuid,'suspended manager loses RLS plant scope');
-- Suspended plants must not expose other users' learning history.
select results_eq($select count(*) from public.play_sessions$,array[0::bigint],
  'manager has no other players session read scope while plant suspended');
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000003';
select results_eq($select count(*) from public.play_sessions
  where user_id='f1000000-0000-0000-0000-000000000003'$,array[1::bigint],
  'suspended active player retains owner-only session history SELECT');
select is((select public.my_record_summary()->'profile'->>'nickname'),
  'EPPLAYER'::text,'suspended active player can read own summary history');
reset role;
set local role service_role;
select lives_ok($$select public.set_plant_active_atomic('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001',false)$$,'repeated deactivation is a no-op');
select is((select invitation_epoch from public.plants where id='f2000000-0000-0000-0000-000000000001'),1::bigint,'no-op cannot rotate epoch twice');
select results_eq($$select count(*) from public.audit_logs where plant_id='f2000000-0000-0000-0000-000000000001' and action='plant.active_changed'$$,array[1::bigint],'no-op cannot duplicate audit');
select lives_ok($$select public.set_plant_active_atomic('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001',true)$$,'admin reactivates plant');
select is((select invitation_epoch from public.plants where id='f2000000-0000-0000-0000-000000000001'),1::bigint,'reactivation cannot restore revoked epoch');
select throws_ok($$update public.invitations set accepted_at=now(),accepted_by='f1000000-0000-0000-0000-000000000003' where id='f7000000-0000-0000-0000-000000000001'$$,'P0001','plant_invitation_revoked','old link remains invalid after reactivation');
select ok((select accepted_at is null from public.invitations where id='f7000000-0000-0000-0000-000000000001'),'revoked link did not create acceptance');
select lives_ok($$insert into public.invitations(
id,token_hash,plant_id,target_role,invitee_name,job_role,created_by,expires_at
) values ('f7000000-0000-0000-0000-000000000002','epoch-token-fresh','f2000000-0000-0000-0000-000000000001','player','Fresh','worker','f1000000-0000-0000-0000-000000000002',now()+interval '2 days')$$,'new invitation can be created after reactivation');
select is((select plant_invitation_epoch from public.invitations where id='f7000000-0000-0000-0000-000000000002'),1::bigint,'new link stamped with new epoch');
select lives_ok($$update public.invitations set accepted_at=now(),accepted_by='f1000000-0000-0000-0000-000000000003' where id='f7000000-0000-0000-0000-000000000002'$$,'new epoch invitation can be accepted');
select lives_ok($$update public.play_sessions set status='completed' where id='f6000000-0000-0000-0000-000000000001'$$,'suspended session can finish after reactivation');
select ok((select status='completed' from public.play_sessions where id='f6000000-0000-0000-0000-000000000001'),'session history preserved and completed');
select results_eq($$select count(*) from public.audit_logs where plant_id='f2000000-0000-0000-0000-000000000001' and action='plant.active_changed'$$,array[2::bigint],'deactivation and reactivation each audited once');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-0000-0000-000000000002';
select is((select private.auth_role())::text,'plant_manager'::text,'manager scope restored after reactivation');
select is((select private.auth_plant()),'f2000000-0000-0000-0000-000000000001'::uuid,'manager plant scope restored');
reset role;
select * from finish();
rollback;
