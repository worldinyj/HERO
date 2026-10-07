begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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

select is(
  private.bootstrap_initial_admin(
    '60000000-0000-0000-0000-000000000001',
    'Initial Admin',
    'HEROADMIN1'
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
  $$select count(*) from public.audit_logs
    where action = 'admin.bootstrap_initial'
      and actor_user_id = '60000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'initial admin bootstrap writes an audit event'
);

select throws_ok(
  $$select private.bootstrap_initial_admin(
    '60000000-0000-0000-0000-000000000002',
    'Second Admin',
    'HEROADMIN2'
  )$$,
  'P0001',
  'admin_already_exists',
  'bootstrap refuses to create a second admin'
);

select throws_ok(
  $$insert into public.invitations (
      token_hash,
      plant_id,
      target_role,
      invitee_name,
      created_by,
      expires_at
    )
    values (
      'admin-invite-must-fail',
      gen_random_uuid(),
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
