-- my_record_summary must fetch season metadata from public.seasons,
-- never from private.v_season_scores_internal; it is strictly user-scoped.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000001', 'record-player@hero.test'),
  ('71000000-0000-0000-0000-000000000002', 'record-other@hero.test');

insert into public.plants (id, code, name, display_name)
values ('72000000-0000-0000-0000-000000000001', 'REC-T', 'Records Test', 'Records Test');

insert into public.profiles (id, plant_id, role, job_role, real_name, nickname, is_active)
values
  ('71000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'player', 'worker', 'Record Player', 'RECPL1', true),
  ('71000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', 'player', 'worker', 'Other Player', 'RECPL2', true);

insert into public.scenarios (id, slug, title, is_competitive, is_active)
values ('73000000-0000-0000-0000-000000000001', 'records_test', 'Records Test', true, true);

insert into public.scenario_versions
  (id, scenario_id, version, status, default_perspective_role, content, published_at)
values
  ('73000000-0000-0000-0000-000000000002',
   '73000000-0000-0000-0000-000000000001',
   1, 'published', 'worker', '{}'::jsonb, now());

-- Choose the older season with the larger UUID to catch incorrect UUID
-- ordering; the open one should always be the current season.
insert into public.seasons (id, season_key, title, starts_at, ends_at, status)
values
 ('f4000000-0000-0000-0000-000000000001', 'records-past', 'Records Past',
  now() - interval '40 days', now() - interval '20 days', 'closed'),
 ('14000000-0000-0000-0000-000000000001', 'records-current', 'Records Current',
  now() - interval '1 day', now() + interval '1 day', 'open');

insert into public.play_sessions (
  id, user_id, plant_id, player_job_role, perspective_role,
  season_id, scenario_version_id, simulation_seed, presentation_seed,
  status, ending, metrics, hp_point, score_rule_version, evaluation,
  started_at, completed_at
) values
 (
  '75000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'worker', 'worker', 'f4000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000002',
  'records-past-sim', 'records-past-display',
  'completed', 'safe_complete', '{"safety":80,"awareness":80,"communication":80,"procedure":80,"challenge":80}'::jsonb,
  130, 'v1', '{}'::jsonb,
  now() - interval '30 days', now() - interval '25 days'
 ),
 (
  '75000000-0000-0000-0000-000000000002',
  '71000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'worker', 'worker', '14000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000002',
  'records-now-sim', 'records-now-display',
  'completed', 'safe_complete', '{"safety":90,"awareness":90,"communication":90,"procedure":90,"challenge":90}'::jsonb,
  245, 'v1', '{}'::jsonb,
  now() - interval '1 hour', now() - interval '30 minutes'
 );

set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';

select is(
  (public.my_record_summary()->'current_season'->>'season_key'),
  'records-current',
  'current season is open season, not higher UUID closed season'
);
select is(
  (public.my_record_summary()->'current_season'->>'season_title'),
  'Records Current',
  'current season title comes from seasons'
);
select is(
  (public.my_record_summary()->'current_season'->>'hp_point'),
  '245',
  'current season self-score matches submitted session'
);
select is(
  jsonb_array_length(public.my_record_summary()->'season_history'),
  2,
  'player sees both of their season records'
);
select is(
  (public.my_record_summary()->'profile'->>'nickname'),
  'RECPL1',
  'self record exposes only own profile nickname'
);
select is(
  (public.my_record_summary()->'metrics'->>'completed_sessions'),
  '2',
  'self learning metrics count only own completed sessions'
);

set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000002';
select is(
  (public.my_record_summary()->'current_season'->>'hp_point'),
  '0',
  'new player receives zero HP before completing a scenario'
);
select is(
  (public.my_record_summary()->'metrics'->>'completed_sessions'),
  '0',
  'new player cannot see another player learning metrics'
);
select * from finish();
rollback;
