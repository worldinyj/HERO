begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

update public.seasons
set status = 'scheduled'
where status = 'open';

insert into public.seasons (
  id,
  season_key,
  title,
  starts_at,
  ends_at,
  status
) values (
  '61000000-0000-0000-0000-000000000001',
  'rollover-boundary-old',
  'Rollover Boundary Old',
  '2026-09-30 15:00:00+00'::timestamptz,
  '2026-10-31 15:00:00+00'::timestamptz,
  'open'
);

select results_eq(
  $$select count(*) from cron.job where jobname = 'hero-season-rollover'$$,
  array[1::bigint],
  'monthly rollover cron job exists exactly once'
);

select results_eq(
  $$select schedule from cron.job where jobname = 'hero-season-rollover'$$,
  array['0 15 * * *'::text],
  'cron fires daily at 15:00 UTC so the wrapper sees KST midnight'
);

do $
begin
  perform private.ensure_monthly_season('2026-11-15'::date);
end;
$;

select is(
  (
    select starts_at
    from public.seasons
    where season_key = '2026-11'
  ),
  '2026-10-31 15:00:00+00'::timestamptz,
  'November season starts at Nov 1 00:00 KST (Oct 31 15:00 UTC)'
);

select is(
  (
    select ends_at
    from public.seasons
    where season_key = '2026-11'
  ),
  '2026-11-30 15:00:00+00'::timestamptz,
  'November season ends at Dec 1 00:00 KST (Nov 30 15:00 UTC)'
);

select is(
  (
    select status::text
    from public.seasons
    where season_key = '2026-11'
  ),
  'scheduled',
  'ensure_monthly_season creates a scheduled season before rollover opens it'
);

select lives_ok(
  $$select private.rollover_monthly_season_at('2026-10-31 14:59:59+00'::timestamptz)$$,
  'rollover call immediately before KST month boundary is a no-op'
);

select is(
  (
    select status::text
    from public.seasons
    where season_key = 'rollover-boundary-old'
  ),
  'open',
  'previous season remains open one second before Nov 1 00:00 KST'
);

select is(
  (
    select status::text
    from public.seasons
    where season_key = '2026-11'
  ),
  'scheduled',
  'next season remains scheduled before the KST boundary'
);

select lives_ok(
  $$select private.rollover_monthly_season_at('2026-10-31 15:00:00+00'::timestamptz)$$,
  'rollover executes exactly at Nov 1 00:00 KST'
);

select is(
  (
    select status::text
    from public.seasons
    where season_key = 'rollover-boundary-old'
  ),
  'closed',
  'previous season closes at the KST month boundary'
);

select is(
  (
    select closed_at
    from public.seasons
    where season_key = 'rollover-boundary-old'
  ),
  '2026-10-31 15:00:00+00'::timestamptz,
  'previous season closed_at uses the exact rollover instant'
);

select is(
  (
    select status::text
    from public.seasons
    where season_key = '2026-11'
  ),
  'open',
  'November season opens at Nov 1 00:00 KST'
);

select results_eq(
  $$select count(*) from public.audit_logs
    where action = 'season.closed'
      and entity_id = '61000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'season close audit event is written once'
);

select results_eq(
  $$select count(*) from public.audit_logs
    where action = 'season.opened'
      and entity_id = (
        select id::text from public.seasons where season_key = '2026-11'
      )$$,
  array[1::bigint],
  'season open audit event is written once'
);

select lives_ok(
  $$select private.rollover_monthly_season_at('2026-10-31 15:00:00+00'::timestamptz)$$,
  'repeating rollover at the same instant is idempotent'
);

select results_eq(
  $select count(*) from public.audit_logs
    where action = 'season.closed'
      and entity_id = '61000000-0000-0000-0000-000000000001'$,
  array[1::bigint],
  'idempotent rollover does not duplicate season.closed'
);

select results_eq(
  $select count(*) from public.audit_logs
    where action = 'season.opened'
      and entity_id = (
        select id::text from public.seasons where season_key = '2026-11'
      )$,
  array[1::bigint],
  'idempotent rollover does not duplicate season.opened'
);

select * from finish();

rollback;
