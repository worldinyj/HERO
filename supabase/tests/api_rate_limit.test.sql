begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select results_eq(
  $$select allowed, remaining from public.consume_api_rate_limit(
    'test:submit',
    'subject-a',
    3,
    600
  )$$,
  $$values (true, 2)$$,
  'first request is allowed with two remaining'
);

select results_eq(
  $$select allowed, remaining from public.consume_api_rate_limit(
    'test:submit',
    'subject-a',
    3,
    600
  )$$,
  $$values (true, 1)$$,
  'second request is allowed with one remaining'
);

select results_eq(
  $$select allowed, remaining from public.consume_api_rate_limit(
    'test:submit',
    'subject-a',
    3,
    600
  )$$,
  $$values (true, 0)$$,
  'third request reaches the configured limit'
);

select results_eq(
  $$select allowed, remaining from public.consume_api_rate_limit(
    'test:submit',
    'subject-a',
    3,
    600
  )$$,
  $$values (false, 0)$$,
  'fourth request is rejected'
);

select ok(
  (
    select retry_after_seconds between 1 and 600
    from public.consume_api_rate_limit(
      'test:submit',
      'subject-a',
      3,
      600
    )
  ),
  'rate-limit response includes a bounded retry-after value'
);

select results_eq(
  $$select allowed from public.consume_api_rate_limit(
    'test:submit',
    'subject-b',
    3,
    600
  )$$,
  array[true],
  'a different subject receives an independent bucket'
);

select results_eq(
  $$select allowed from public.consume_api_rate_limit(
    'test:other-scope',
    'subject-a',
    1,
    600
  )$$,
  array[true],
  'a different scope receives an independent bucket'
);

set local role authenticated;

select throws_ok(
  $$select * from public.consume_api_rate_limit(
    'test:direct-client',
    'subject-a',
    3,
    600
  )$$,
  '42501',
  null,
  'authenticated clients cannot call the service-role limiter RPC directly'
);

reset role;

select results_eq(
  $$select count(*) from private.api_rate_limit_buckets
    where scope like 'test:%'$$,
  array[3::bigint],
  'only one current-window row is stored per scope and subject'
);

select * from finish();

rollback;
