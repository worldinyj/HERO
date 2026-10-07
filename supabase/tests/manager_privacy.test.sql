begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-000000000001', 'manager@privacy.test'),
  ('50000000-0000-0000-0000-000000000002', 'worker1@privacy.test'),
  ('50000000-0000-0000-0000-000000000003', 'worker2@privacy.test'),
  ('50000000-0000-0000-0000-000000000004', 'worker3@privacy.test'),
  ('50000000-0000-0000-0000-000000000005', 'worker4@privacy.test'),
  ('50000000-0000-0000-0000-000000000006', 'other@privacy.test');

insert into public.plants (id, code, name, display_name) values
  ('51000000-0000-0000-0000-000000000001', 'PRIV-A', 'Privacy A', 'Privacy A'),
  ('51000000-0000-0000-0000-000000000002', 'PRIV-B', 'Privacy B', 'Privacy B');

insert into public.profiles (
  id, plant_id, role, job_role, real_name, nickname, team_name, is_active
) values
  ('50000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'plant_manager', null, 'Manager', 'PRIVMG', null, true),
  ('50000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'player', 'worker', 'Worker 1', 'PRIVW1', 'A', true),
  ('50000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000001', 'player', 'worker', 'Worker 2', 'PRIVW2', 'A', true),
  ('50000000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000001', 'player', 'worker', 'Worker 3', 'PRIVW3', 'A', true),
  ('50000000-0000-0000-0000-000000000005', '51000000-0000-0000-0000-000000000001', 'player', 'worker', 'Worker 4', 'PRIVW4', 'A', true),
  ('50000000-0000-0000-0000-000000000006', '51000000-0000-0000-0000-000000000002', 'player', 'worker', 'Other Worker', 'PRIVOT', 'B', true);

insert into public.invitations (
  id, token_hash, plant_id, target_role, invitee_name, job_role, created_by, expires_at
) values
  (
    '52000000-0000-0000-0000-000000000001',
    'privacy-own-invite',
    '51000000-0000-0000-0000-000000000001',
    'player', 'Own Invite', 'worker',
    '50000000-0000-0000-0000-000000000001',
    now() + interval '1 day'
  ),
  (
    '52000000-0000-0000-0000-000000000002',
    'privacy-other-invite',
    '51000000-0000-0000-0000-000000000002',
    'player', 'Other Invite', 'worker',
    '50000000-0000-0000-0000-000000000001',
    now() + interval '1 day'
  );

insert into public.scenarios (id, slug, title, is_competitive, is_active)
values ('53000000-0000-0000-0000-000000000001', 'privacy_test', 'Privacy Test', true, true);

insert into public.scenario_versions (
  id, scenario_id, version, status, default_perspective_role, content, published_at
) values (
  '53000000-0000-0000-0000-000000000002',
  '53000000-0000-0000-0000-000000000001',
  1, 'published', 'worker', '{}'::jsonb, now()
);

insert into public.seasons (
  id, season_key, title, starts_at, ends_at, status
) values (
  '53000000-0000-0000-0000-000000000003',
  'privacy-test-season',
  'Privacy Test Season',
  now() - interval '1 day',
  now() + interval '1 day',
  'open'
);

insert into public.play_sessions (
  id, user_id, plant_id, player_job_role, perspective_role,
  season_id, scenario_version_id, simulation_seed, presentation_seed,
  status, ending, metrics, hp_point, score_rule_version, evaluation,
  started_at, completed_at
) values (
  '54000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  '51000000-0000-0000-0000-000000000001',
  'worker', 'worker',
  '53000000-0000-0000-0000-000000000003',
  '53000000-0000-0000-0000-000000000002',
  'privacy-simulation-seed', 'privacy-presentation-seed',
  'completed', 'event',
  '{"safety":10,"awareness":20,"communication":30,"procedure":40,"challenge":50}'::jsonb,
  99, 'v1',
  '{"private":"manager-must-not-see"}'::jsonb,
  now() - interval '1 hour', now() - interval '30 minutes'
);

insert into public.session_decisions (
  session_id, seq, node_id, action_type, action_id, clock_before, clock_after
) values (
  '54000000-0000-0000-0000-000000000001',
  0, 'private-node', 'choice', 'private-choice', 0, 1
);

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.manager_player_rows()$$,
  array[4::bigint],
  'manager player list is scoped to own plant'
);

select ok(
  not exists (
    select 1
    from public.manager_player_rows() r,
      lateral jsonb_object_keys(to_jsonb(r)) as k(key)
    where k.key in (
      'hp_point',
      'metrics',
      'ending',
      'evaluation',
      'integrity_flag',
      'simulation_seed',
      'presentation_seed'
    )
  ),
  'manager player rows expose no score, outcome, metric, or seed fields'
);

select results_eq(
  $$select count(*) from public.play_sessions$$,
  array[0::bigint],
  'manager cannot read player sessions directly'
);

select results_eq(
  $select count(*) from public.session_decisions$,
  array[0::bigint],
  'manager cannot read player decisions directly'
);

select results_eq(
  $select count(*) from public.v_leaderboard_current_public$,
  array[0::bigint],
  'manager cannot read individual current leaderboard rows'
);

select results_eq(
  $select count(*) from public.v_leaderboard_snapshot_public$,
  array[0::bigint],
  'manager cannot read individual historical leaderboard rows'
);

select results_eq(
  $$select count(*) from public.manager_pending_invites()$$,
  array[1::bigint],
  'manager pending invites are scoped to own plant'
);

select results_eq(
  $$select count(*) from public.manager_job_aggregates()$$,
  array[0::bigint],
  'n<5 job aggregate is suppressed'
);

reset role;

insert into auth.users (id, email)
values ('50000000-0000-0000-0000-000000000007', 'worker5@privacy.test');

insert into public.profiles (
  id, plant_id, role, job_role, real_name, nickname, team_name, is_active
) values (
  '50000000-0000-0000-0000-000000000007',
  '51000000-0000-0000-0000-000000000001',
  'player', 'worker', 'Worker 5', 'PRIVW5', 'A', true
);

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.manager_job_aggregates()$$,
  array[1::bigint],
  'aggregate appears when group reaches five active players'
);

select results_eq(
  $$select participant_count from public.manager_job_aggregates() where job_role = 'worker'$$,
  array[5::bigint],
  'aggregate reports five participants without individual score data'
);

select ok(
  not exists (
    select 1
    from public.manager_job_aggregates() r,
      lateral jsonb_object_keys(to_jsonb(r)) as k(key)
    where k.key in ('hp_point', 'metrics', 'ending', 'real_name', 'nickname')
  ),
  'manager aggregate exposes counts only'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';

select throws_ok(
  $$select * from public.manager_player_rows()$$,
  'P0001',
  'plant_manager_required',
  'player cannot invoke manager privacy view'
);

select * from finish();

rollback;
