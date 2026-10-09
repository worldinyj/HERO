-- Plant display names are NOT unique. "My plant" must use immutable
-- plant_id in both active projections and closed-season scope rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
('81000000-0000-0000-0000-000000000001','scope-player-a@hero.test'),
('81000000-0000-0000-0000-000000000002','scope-player-b@hero.test');

-- Deliberately identical display_name for distinct plant identities.
insert into public.plants (id, code, name, display_name) values
('82000000-0000-0000-0000-000000000001','SCOP-A','Scope A','Shared Label'),
('82000000-0000-0000-0000-000000000002','SCOP-B','Scope B','Shared Label');

insert into public.profiles (id, plant_id, role, job_role, real_name, nickname, is_active) values
('81000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','player','worker','Player A','SCOPA1',true),
('81000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000002','player','worker','Player B','SCOPB1',true);

insert into public.scenarios (id, slug, title, is_competitive, is_active) values
('83000000-0000-0000-0000-000000000001','scope_identity_test','Scope Identity Test',true,true);

insert into public.scenario_versions
(id, scenario_id, version, status, default_perspective_role, content, published_at)
values ('83000000-0000-0000-0000-000000000002',
        '83000000-0000-0000-0000-000000000001',
        1,'published','worker','{}'::jsonb,now());

insert into public.seasons (id, season_key, title, starts_at, ends_at, status)
values ('84000000-0000-0000-0000-000000000001',
        'scope-identity-regression','Scope Identity Regression',
        now()-interval '1 day',now()+interval '1 day','open');

insert into public.play_sessions (
 id, user_id, plant_id, player_job_role, perspective_role,
 season_id, scenario_version_id, simulation_seed, presentation_seed,
 status, ending, metrics, hp_point, score_rule_version, evaluation,
 started_at, completed_at
) values
(
'85000000-0000-0000-0000-000000000001',
'81000000-0000-0000-0000-000000000001',
'82000000-0000-0000-0000-000000000001',
'worker','worker','84000000-0000-0000-0000-000000000001',
'83000000-0000-0000-0000-000000000002',
'scope-a-simulation','scope-a-display','completed','safe_complete',
'{"safety":90}'::jsonb,220,'v1','{}'::jsonb,
now()-interval '1 hour',now()-interval '30 minutes'
),
(
'85000000-0000-0000-0000-000000000002',
'81000000-0000-0000-0000-000000000002',
'82000000-0000-0000-0000-000000000002',
'worker','worker','84000000-0000-0000-0000-000000000001',
'83000000-0000-0000-0000-000000000002',
'scope-b-simulation','scope-b-display','completed','safe_complete',
'{"safety":80}'::jsonb,180,'v1','{}'::jsonb,
now()-interval '1 hour',now()-interval '20 minutes'
);

select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'$$,
  array[2::bigint], 'two active players appear in overall ranking'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
    and plant_display_name='Shared Label'$$,
  array[2::bigint], 'duplicate display names do not imply same plant'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
      and plant_id='82000000-0000-0000-0000-000000000001'$$,
  array[1::bigint], 'plant A scope selects only plant A'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
      and plant_id='82000000-0000-0000-0000-000000000002'$$,
  array[1::bigint], 'plant B scope selects only plant B'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
      and plant_rank=1$$,
  array[2::bigint], 'each plant independently owns first place'
);

update public.plants set display_name='Renamed Label'
where id='82000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
      and plant_id='82000000-0000-0000-0000-000000000001'
      and plant_display_name='Renamed Label'$$,
  array[1::bigint], 'plant rename refreshes current public label'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
      and plant_id='82000000-0000-0000-0000-000000000002'
      and plant_display_name='Shared Label'$$,
  array[1::bigint], 'other plant name remains unchanged'
);
select results_eq(
  $$select count(*) from public.leaderboard_current_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
      and plant_id='82000000-0000-0000-0000-000000000001'$$,
  array[1::bigint], 'plant ID remains stable after rename'
);

select private.snapshot_season('84000000-0000-0000-0000-000000000001'::uuid);
update public.seasons set status='closed', closed_at=now()
where id='84000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.leaderboard_snapshot_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
    and scope_type='plant'$$,
  array[2::bigint], 'two historical plant-scope rows remain distinct'
);
select results_eq(
  $$select count(*) from public.leaderboard_snapshot_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
    and scope_type='plant'
    and plant_id='82000000-0000-0000-0000-000000000001'$$,
  array[1::bigint], 'historic plant A selection uses plant UUID'
);
select results_eq(
  $$select count(*) from public.leaderboard_snapshot_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
    and scope_type='plant'
    and plant_id='82000000-0000-0000-0000-000000000002'$$,
  array[1::bigint], 'historic plant B selection uses plant UUID'
);
select results_eq(
  $$select count(*) from public.leaderboard_snapshot_public_rows
    where season_id='84000000-0000-0000-0000-000000000001'
    and scope_type='plant_job'
    and plant_id is not null$$,
  array[2::bigint], 'historic plant-job scopes also preserve stable IDs'
);

select * from finish();
rollback;
