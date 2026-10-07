begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-000000000001', 'initial-admin@hero.test'),
  ('60000000-0000-0000-0000-000000000002', 'second-admin@hero.test'),
  ('60000000-0000-0000-0000-000000000003', 'ordinary-user@hero.test');

set local role authenticated;
set local request.jwt.claim.sub = '60000000-0000-0000-0000-000000000003';

select throws_ok(
  $$select private.bootstrap_initial_admin(
    '60000000-0000-0000-0000-000000000003',
    'Ordinary User',
    'ORDINARY'
  )$$,
  '42501',
  null,
  'authenticated users cannot call the initial admin bootstrap function'
);

reset role;

set local role service_role;

select throws_ok(
  $select private.bootstrap_initial_admin(
    '60000000-0000-0000-0000-000000000001',
    'Initial Admin',
    'HEROROOT1'
  )$,
  '42501',
  null,
  'service_role cannot call the initial admin bootstrap function'
);

reset role;

select is(
  private.bootstrap_initial_admin(
    '60000000-0000-0000-0000-000000000001',
    'Initial Admin',
    'HEROROOT1'
  ),
  '60000000-0000-0000-0000-000000000001'::uuid,
  'database owner can bootstrap the first admin'
);

select results_eq(
  $$select role::text from public.profiles
    where id = '60000000-0000-0000-0000-000000000001'$$,
  array['admin'::text],
  'bootstrapped profile has admin role'
);

select results_eq(
  $$select count(*) from public.profiles
    where id = '60000000-0000-0000-0000-000000000001'
      and plant_id is null
      and job_role is null
      and is_active = true$$,
  array[1::bigint],
  'initial admin is active and is not attached to a plant or job role'
);

select results_eq(
  $select count(*) from public.audit_logs
    where action = 'admin.bootstrap_initial'
      and actor_user_id is null
      and entity_id = '60000000-0000-0000-0000-000000000001'
      and metadata->>'target_user_id' = '60000000-0000-0000-0000-000000000001'$,
  array[1::bigint],
  'initial admin bootstrap writes an owner-originated audit event'
);

select throws_ok(
  $$select private.bootstrap_initial_admin(
    '60000000-0000-0000-0000-000000000002',
    'Second Admin',
    'HEROROOT2'
  )$$,
  'P0001',
  'admin_already_exists',
  'bootstrap refuses to create a second admin'
);

insert into public.plants (id, code, name, display_name)
values (
  '61000000-0000-0000-0000-000000000001',
  'BOOTSTRAP',
  'Bootstrap Test Plant',
  'Bootstrap'
);

select throws_ok(
  $insert into public.invitations (
      token_hash,
      plant_id,
      target_role,
      invitee_name,
      created_by,
      expires_at
    )
    values (
      'admin-invite-must-fail',
      '61000000-0000-0000-0000-000000000001',
      'admin',
      'Should Fail',
      '60000000-0000-0000-0000-000000000001',
      now() + interval '1 day'
    )$$,
  '23514',
  null,
  'public invitation contract still forbids admin invitations'
);

select * from finish();

rollback;
