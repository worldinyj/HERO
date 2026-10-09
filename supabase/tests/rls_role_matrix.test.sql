begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000001', 'admin@hero.test'),
  ('20000000-0000-0000-0000-000000000002', 'manager-a@hero.test'),
  ('20000000-0000-0000-0000-000000000003', 'player-a@hero.test'),
  ('20000000-0000-0000-0000-000000000004', 'manager-b@hero.test'),
  ('20000000-0000-0000-0000-000000000005', 'player-b@hero.test'),
  ('20000000-0000-0000-0000-000000000006', 'inactive-a@hero.test');

insert into public.plants (id, code, name, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'RLS-A', 'RLS Plant A', 'RLS A'),
  ('10000000-0000-0000-0000-000000000002', 'RLS-B', 'RLS Plant B', 'RLS B');

insert into public.profiles (
  id, plant_id, role, job_role, real_name, nickname, is_active
) values
  ('20000000-0000-0000-0000-000000000001', null, 'admin', null, 'Admin', 'RLSADMIN', true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'plant_manager', null, 'Manager A', 'RLSMGA', true),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'player', 'worker', 'Player A', 'RLSPA', true),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'plant_manager', null, 'Manager B', 'RLSMGB', true),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'player', 'worker', 'Player B', 'RLSPB', true),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'player', 'worker', 'Inactive A', 'RLSOFF', false);

insert into public.invitations (
  id, token_hash, plant_id, target_role, invitee_name, job_role, created_by, expires_at
) values
  (
    '21000000-0000-0000-0000-000000000001',
    'rls-token-a',
    '10000000-0000-0000-0000-000000000001',
    'player',
    'Invite A',
    'worker',
    '20000000-0000-0000-0000-000000000002',
    now() + interval '1 day'
  ),
  (
    '21000000-0000-0000-0000-000000000002',
    'rls-token-b',
    '10000000-0000-0000-0000-000000000002',
    'player',
    'Invite B',
    'worker',
    '20000000-0000-0000-0000-000000000004',
    now() + interval '1 day'
  );

insert into public.scenarios (id, slug, title, is_competitive, is_active)
values ('30000000-0000-0000-0000-000000000001', 'rls_test', 'RLS Test', true, true);

insert into public.scenario_versions (
  id, scenario_id, version, status, default_perspective_role, content, published_at
) values (
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  1,
  'published',
  'worker',
  '{}'::jsonb,
  now()
);

insert into public.seasons (
  id, season_key, title, starts_at, ends_at, status
) values (
  '30000000-0000-0000-0000-000000000003',
  'rls-test-season',
  'RLS Test Season',
  now() - interval '1 day',
  now() + interval '1 day',
  'open'
);

insert into public.play_sessions (
  id, user_id, plant_id, player_job_role, perspective_role,
  season_id, scenario_version_id, simulation_seed, presentation_seed,
  status, ending, metrics, hp_point, score_rule_version, evaluation,
  started_at, completed_at
) values
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'worker', 'worker',
    '30000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000002',
    'same-simulation-seed-a', 'presentation-a',
    'completed', 'safe_complete',
    '{"safety":80,"awareness":70,"communication":60,"procedure":90,"challenge":50}'::jsonb,
    250, 'v1',
    '{"test":true}'::jsonb,
    now() - interval '1 hour', now() - interval '30 minutes'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000002',
    'worker', 'worker',
    '30000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000002',
    'same-simulation-seed-b', 'presentation-b',
    'completed', 'near_miss',
    '{"safety":60,"awareness":60,"communication":60,"procedure":60,"challenge":60}'::jsonb,
    180, 'v1',
    '{"test":true}'::jsonb,
    now() - interval '1 hour', now() - interval '25 minutes'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    'worker', 'worker',
    '30000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000002',
    'same-simulation-seed-c', 'presentation-c',
    'completed', 'safe_stop',
    '{"safety":50,"awareness":50,"communication":50,"procedure":50,"challenge":50}'::jsonb,
    150, 'v1',
    '{"test":true}'::jsonb,
    now() - interval '1 hour', now() - interval '20 minutes'
  );

insert into public.session_decisions (
  session_id, seq, node_id, action_type, action_id, clock_before, clock_after
) values
  ('40000000-0000-0000-0000-000000000001', 0, 'n1', 'choice', 'a1', 0, 1),
  ('40000000-0000-0000-0000-000000000002', 0, 'n1', 'choice', 'b1', 0, 1),
  ('40000000-0000-0000-0000-000000000003', 0, 'n1', 'choice', 'c1', 0, 1);

insert into public.audit_logs (
  actor_user_id, plant_id, action, entity_type, entity_id, metadata
) values (
  '20000000-0000-0000-0000-000000000001',
  null,
  'rls.test',
  'test',
  'rls',
  '{}'::jsonb
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.plants'::regclass),
  'plants has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.invitations'::regclass),
  'invitations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass),
  'audit_logs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.play_sessions'::regclass),
  'play_sessions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.session_decisions'::regclass),
  'session_decisions has RLS enabled'
);

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000003';

select results_eq(
  $$select count(*) from public.plants$$,
  array[1::bigint],
  'player sees only own plant'
);
select results_eq(
  $$select count(*) from public.profiles$$,
  array[1::bigint],
  'player sees only own profile'
);
select results_eq(
  $$select count(*) from public.invitations$$,
  array[0::bigint],
  'player cannot list invitations'
);
select results_eq(
  $$select count(*) from public.audit_logs$$,
  array[0::bigint],
  'player cannot read audit logs'
);
select results_eq(
  $$select count(*) from public.play_sessions$$,
  array[1::bigint],
  'player sees only own session'
);
select results_eq(
  $$select count(*) from public.session_decisions$$,
  array[1::bigint],
  'player sees only own decision log'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where season_id = '30000000-0000-0000-0000-000000000003'$$,
  array[2::bigint],
  'active player can read current leaderboard rows for active players only'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where nickname = 'RLSOFF'$$,
  array[0::bigint],
  'inactive players are omitted from the current leaderboard'
);
select is(
  (select hp_point from public.my_current_rank()),
  250,
  'player self-rank RPC returns only own open-season HP'
);
select is(
  (select overall_rank from public.my_current_rank()),
  1,
  'player self-rank RPC returns own overall rank'
);
select throws_ok(
  $$update public.profiles set nickname = 'HACKED' where id = '20000000-0000-0000-0000-000000000003'$$,
  '42501',
  null,
  'player cannot bypass nickname policy with direct update'
);
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '20000000-0000-0000-0000-000000000003'$$,
  '42501',
  null,
  'player cannot escalate own application role with direct profile update'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';

select results_eq(
  $$select count(*) from public.plants$$,
  array[1::bigint],
  'manager sees only own plant'
);
select results_eq(
  $$select count(*) from public.profiles$$,
  array[3::bigint],
  'manager sees profiles only in own plant'
);
select results_eq(
  $$select count(*) from public.invitations$$,
  array[1::bigint],
  'manager sees invitations only in own plant'
);
select results_eq(
  $$select count(*) from public.audit_logs$$,
  array[0::bigint],
  'manager cannot read audit logs'
);
select results_eq(
  $$select count(*) from public.play_sessions$$,
  array[0::bigint],
  'manager cannot read player sessions directly'
);
select results_eq(
  $$select count(*) from public.session_decisions$$,
  array[0::bigint],
  'manager cannot read player decision logs directly'
);
select throws_ok(
  $$insert into public.plants (code, name, display_name) values ('NOPE', 'Nope', 'Nope')$$,
  '42501',
  null,
  'manager cannot create plants'
);
select throws_ok(
  $$select * from public.my_current_rank()$$,
  'P0001',
  'player_required',
  'manager cannot invoke player self-rank RPC'
);

select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows$$,
  array[0::bigint],
  'manager cannot read player leaderboard rows'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.plants where code like 'RLS-%'$$,
  array[2::bigint],
  'admin sees all plants'
);
select results_eq(
  $$select count(*) from public.profiles where nickname like 'RLS%'$$,
  array[6::bigint],
  'admin sees all profiles'
);
select results_eq(
  $$select count(*) from public.invitations where token_hash like 'rls-token-%'$$,
  array[2::bigint],
  'admin sees all invitations'
);
select results_eq(
  $$select count(*) from public.audit_logs where action = 'rls.test'$$,
  array[1::bigint],
  'admin can read audit logs'
);
select results_eq(
  $$select count(*) from public.play_sessions where scenario_version_id = '30000000-0000-0000-0000-000000000002'$$,
  array[3::bigint],
  'admin can read all play sessions'
);
select results_eq(
  $$select count(*) from public.session_decisions where session_id in (
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000003'
    )$$,
  array[3::bigint],
  'admin can read all decision logs'
);
-- Even an authenticated admin must use the audited service-role-only
-- create_plant_atomic RPC, never a direct INSERT from the browser.
select throws_ok(
  $$insert into public.plants (code, name, display_name) values ('RLS-C', 'RLS Plant C', 'RLS C')$$,
  '42501',
  null,
  'admin direct plant insert denied; audited service-role RPC required'
);
select throws_ok(
  $$select * from public.my_current_rank()$$,
  'P0001',
  'player_required',
  'admin cannot invoke player self-rank RPC'
);

select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows$$,
  array[0::bigint],
  'admin cannot read player leaderboard rows through the public view'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000006';

select ok(
  (select private.auth_role()) is null,
  'inactive profile has no active application role'
);
select results_eq(
  $$select count(*) from public.play_sessions$$,
  array[0::bigint],
  'inactive player cannot read own sessions directly'
);
select results_eq(
  $$select count(*) from public.session_decisions$$,
  array[0::bigint],
  'inactive player cannot read own decision logs directly'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows$$,
  array[0::bigint],
  'inactive player cannot read the public leaderboard projection'
);
select throws_ok(
  $$select * from public.my_current_rank()$$,
  'P0001',
  'player_required',
  'inactive player cannot invoke player self-rank RPC'
);

reset role;

select throws_ok(
  $$update public.audit_logs set action = 'tampered' where action = 'rls.test'$$,
  'P0001',
  'audit_logs_are_immutable',
  'audit log rows are immutable even for privileged database operations'
);

select * from finish();

rollback;
