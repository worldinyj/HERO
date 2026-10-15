-- my_record_summary must fetch season metadata from public.seasons,
-- never from private.v_season_scores_internal; it is strictly user-scoped.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
-- The new projection is strictly self-scoped and does not depend on published RLS.
select ok(not has_function_privilege('anon','public.my_reflection_history()','EXECUTE'), 'anonymous role cannot call reflection history');
select ok(has_function_privilege('authenticated','public.my_reflection_history()','EXECUTE'), 'authenticated role may request own history');
select is(jsonb_array_length(public.my_reflection_history()),0,'other player cannot read owner reflections');
reset role;
insert into public.play_sessions(id,user_id,plant_id,player_job_role,perspective_role,season_id,scenario_version_id,
 simulation_seed,presentation_seed,status,completed_at)
values('75000000-0000-0000-0000-000000000099','71000000-0000-0000-0000-000000000001',
 '72000000-0000-0000-0000-000000000001','worker','worker','14000000-0000-0000-0000-000000000001',
 '73000000-0000-0000-0000-000000000002','history-in-progress','history-in-progress-display','in_progress',now()+interval '1 day');
update public.scenario_versions set content = '{"title":"Original Version Title","nodes":{"review_node":{"type":"decision","prompt":"Original decision prompt"}}}'::jsonb
where id='73000000-0000-0000-0000-000000000002';
update public.play_sessions set evaluation='{"reflectionSelection":"review_node"}'::jsonb
where id='75000000-0000-0000-0000-000000000002';
insert into public.session_decisions(session_id,seq,node_id,action_type,action_id,clock_before,clock_after)
values('75000000-0000-0000-0000-000000000002',0,'review_node','choice','verify',0,1);
set local role authenticated;
set local request.jwt.claim.sub = '71000000-0000-0000-0000-000000000001';
select is(jsonb_array_length(public.my_reflection_history()),2,'only own completed history returned');
select is(public.my_reflection_history()->0->>'title','Original Version Title','title comes from exact version snapshot');
select is(public.my_reflection_history()->0->>'reflection_label','Original decision prompt','reached decision resolved from exact version');
select is(public.my_reflection_history()->1->>'reflection_state','not_recorded','legacy selection is not invented');
select ok(not (public.my_reflection_history()->0 ?| array['content','user_id','evaluation','simulation_seed']), 'projection omits source content identity and seeds');
reset role;
update public.scenario_versions set status='archived' where id='73000000-0000-0000-0000-000000000002';
update public.scenarios set is_active=false where id='73000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.my_reflection_history()->0->>'reflection_label','Original decision prompt','archival and scenario deactivation preserve own reflection');
reset role;
delete from public.session_decisions where session_id='75000000-0000-0000-0000-000000000002';
set local role authenticated;
select is(public.my_reflection_history()->0->>'reflection_state','unavailable','unvisited decision never receives a label');
reset role;
update public.play_sessions set evaluation='{"reflectionSelection":"initial_conditions"}'::jsonb
where id='75000000-0000-0000-0000-000000000002';
set local role authenticated;
select is(public.my_reflection_history()->0->>'reflection_label','상황이 시작되기 전부터','initial conditions retain their label');
reset role;
update public.plants set is_active=false where id='72000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(jsonb_array_length(public.my_reflection_history()),2,'active owner retains history while plant suspended');
reset role;
update public.profiles set is_active=false where id='71000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok('select public.my_reflection_history()','P0001','authenticated_profile_required','inactive account cannot read history');
reset role;
set local role anon;
select throws_ok('select public.my_reflection_history()','42501',null,'anonymous execution is denied');
reset role;
update public.profiles set is_active=true where id='71000000-0000-0000-0000-000000000001';
update public.plants set is_active=true where id='72000000-0000-0000-0000-000000000001';
insert into public.play_sessions(id,user_id,plant_id,player_job_role,perspective_role,season_id,scenario_version_id,
 simulation_seed,presentation_seed,status,ending,hp_point,evaluation,completed_at)
select ('75000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','worker','worker',
 '14000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002',
 'history-sim-'||n,'history-display-'||n,'completed','safe_complete',100,'{}'::jsonb,now()+n*interval '1 second'
from generate_series(3,25) n;
set local role authenticated;
select is(jsonb_array_length(public.my_reflection_history()),20,'history is capped at 20');
select is(public.my_reflection_history()->0->>'session_id','75000000-0000-0000-0000-000000000025','newest completion comes first');
select * from finish();
rollback;
