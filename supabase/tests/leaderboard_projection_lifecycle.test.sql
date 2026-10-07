-- Regression coverage for migration 016 projection lifecycle.
-- All fixtures roll back; no persistent users, rankings, or season data.
begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

insert into auth.users (id, email) values
  ('61000000-0000-0000-0000-000000000001', 'projection-manager@hero.test'),
  ('61000000-0000-0000-0000-000000000002', 'projection-player@hero.test');

insert into public.plants (id, code, name, display_name)
values ('62000000-0000-0000-0000-000000000001', 'PROJ-T', 'Projection Test', 'Projection Test');

insert into public.profiles (id, plant_id, role, job_role, real_name, nickname, is_active)
values
  ('61000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'plant_manager', null, 'Manager', 'PROJMGR', true),
  ('61000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001', 'player', 'worker', 'Player', 'PROJP1', true);

insert into public.scenarios (id, slug, title, is_competitive, is_active)
values ('63000000-0000-0000-0000-000000000001', 'projection_regression', 'Projection Regression', true, true);

insert into public.scenario_versions
  (id, scenario_id, version, status, default_perspective_role, content, published_at)
values
  ('63000000-0000-0000-0000-000000000002',
   '63000000-0000-0000-0000-000000000001',
   1, 'published', 'worker', '{}'::jsonb, now());

insert into public.seasons (id, season_key, title, starts_at, ends_at, status)
values
  ('64000000-0000-0000-0000-000000000001',
   'projection-regression-season', 'Projection Regression Season',
   now() - interval '1 day', now() + interval '1 day', 'open');

insert into public.play_sessions (
  id, user_id, plant_id, player_job_role, perspective_role,
  season_id, scenario_version_id, simulation_seed, presentation_seed,
  status, ending, metrics, hp_point, score_rule_version, evaluation,
  started_at, completed_at
) values (
  '65000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000002',
  '62000000-0000-0000-0000-000000000001',
  'worker', 'worker',
  '64000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000002',
  'projection-simulation-seed', 'projection-presentation-seed',
  'completed', 'safe_complete',
  '{"safety":80,"awareness":80,"communication":80,"procedure":80,"challenge":80}'::jsonb,
  180, 'v1', '{}'::jsonb,
  now() - interval '1 hour', now() - interval '20 minutes'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.leaderboard_current_public_rows'::regclass),
  'current projection table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.leaderboard_snapshot_public_rows'::regclass),
  'snapshot projection table has RLS enabled'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'completed session refreshes the current-season projection'
);
select is(
  (select hp_point from public.leaderboard_current_public_rows
   where season_id = '64000000-0000-0000-0000-000000000001' and nickname = 'PROJP1'),
  180,
  'projection preserves season HP'
);

set local role authenticated;
set local request.jwt.claim.sub = '61000000-0000-0000-0000-000000000001';
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'manager cannot read current individual scores'
);

set local request.jwt.claim.sub = '61000000-0000-0000-0000-000000000002';
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'active player can read public current ranking'
);
reset role;

update public.profiles set nickname = 'PROJP2'
where id = '61000000-0000-0000-0000-000000000002';
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001' and nickname = 'PROJP1'$$,
  array[0::bigint],
  'rename removes old nickname from current public projection'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001' and nickname = 'PROJP2'$$,
  array[1::bigint],
  'rename refreshes current public projection'
);

-- Add a higher-scoring active competitor to verify rank recomputation.
insert into auth.users (id, email)
values ('61000000-0000-0000-0000-000000000003', 'projection-competitor@hero.test');

insert into public.profiles (id, plant_id, role, job_role, real_name, nickname, is_active)
values (
  '61000000-0000-0000-0000-000000000003',
  '62000000-0000-0000-0000-000000000001',
  'player', 'worker', 'Competitor', 'PROJP3', true
);

insert into public.play_sessions (
  id, user_id, plant_id, player_job_role, perspective_role,
  season_id, scenario_version_id, simulation_seed, presentation_seed,
  status, ending, metrics, hp_point, score_rule_version, evaluation,
  started_at, completed_at
) values (
  '65000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000003',
  '62000000-0000-0000-0000-000000000001',
  'worker', 'worker',
  '64000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000002',
  'higher-score-simulation-seed', 'higher-score-presentation-seed',
  'completed', 'safe_complete',
  '{"safety":90,"awareness":90,"communication":90,"procedure":90,"challenge":90}'::jsonb,
  220, 'v1', '{}'::jsonb,
  now() - interval '1 hour', now() - interval '10 minutes'
);
select is(
  (select overall_rank from public.leaderboard_current_public_rows
   where season_id = '64000000-0000-0000-0000-000000000001' and nickname = 'PROJP2'),
  2,
  'active higher-scoring competitor places player second'
);

update public.profiles set is_active = false
where id = '61000000-0000-0000-0000-000000000003';
select is(
  (select overall_rank from public.leaderboard_current_public_rows
   where season_id = '64000000-0000-0000-0000-000000000001' and nickname = 'PROJP2'),
  1,
  'inactive competitor is excluded before rank calculation'
);

set local role authenticated;
set local request.jwt.claim.sub = '61000000-0000-0000-0000-000000000002';
select is(
  (select overall_rank from public.my_current_rank()),
  1,
  'self rank RPC matches active-only public leaderboard after deactivation'
);
reset role;

update public.profiles set is_active = false
where id = '61000000-0000-0000-0000-000000000002';
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'deactivated player disappears from current leaderboard'
);

update public.profiles set is_active = true
where id = '61000000-0000-0000-0000-000000000002';
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'reactivated player returns to current leaderboard'
);

select lives_ok(
  $$select private.snapshot_season('64000000-0000-0000-0000-000000000001'::uuid)$$,
  'season snapshot materializes before season close'
);
update public.seasons set status = 'closed', closed_at = now()
where id = '64000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'closing a season removes current projection rows'
);
select results_eq(
  $$select count(*) from public.leaderboard_snapshot_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001'$$,
  array[4::bigint],
  'season close generates all four historical ranking scopes'
);

set local role authenticated;
set local request.jwt.claim.sub = '61000000-0000-0000-0000-000000000001';
select results_eq(
  $$select count(*) from public.leaderboard_snapshot_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'manager cannot read historical individual ranking rows'
);
set local request.jwt.claim.sub = '61000000-0000-0000-0000-000000000002';
select results_eq(
  $$select count(*) from public.leaderboard_snapshot_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001' and scope_type = 'overall'$$,
  array[1::bigint],
  'player can read closed-season overall projection'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
      where season_id = '64000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'player cannot see closed-season rows in current projection'
);

select * from finish();
rollback;
