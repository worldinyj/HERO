begin;

create table if not exists private.api_rate_limit_buckets (
  scope text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash, window_start),
  constraint api_rate_limit_scope_nonempty check (char_length(trim(scope)) > 0),
  constraint api_rate_limit_subject_nonempty check (char_length(trim(subject_hash)) > 0),
  constraint api_rate_limit_count_positive check (request_count >= 0)
);

revoke all on private.api_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
  v_retry integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit_configuration';
  end if;

  if p_scope is null or char_length(trim(p_scope)) = 0 then
    raise exception 'invalid_rate_limit_scope';
  end if;

  if p_subject_hash is null or char_length(trim(p_subject_hash)) = 0 then
    raise exception 'invalid_rate_limit_subject';
  end if;

  v_window_start :=
    to_timestamp(
      floor(extract(epoch from v_now) / p_window_seconds)
      * p_window_seconds
    );

  insert into private.api_rate_limit_buckets (
    scope,
    subject_hash,
    window_start,
    request_count,
    updated_at
  )
  values (
    trim(p_scope),
    trim(p_subject_hash),
    v_window_start,
    1,
    v_now
  )
  on conflict (scope, subject_hash, window_start)
  do update
    set request_count = private.api_rate_limit_buckets.request_count + 1,
        updated_at = excluded.updated_at
  returning request_count into v_count;

  delete from private.api_rate_limit_buckets
  where scope = trim(p_scope)
    and subject_hash = trim(p_subject_hash)
    and window_start < v_now - interval '2 days';

  v_retry := greatest(
    1,
    ceil(
      extract(
        epoch from (
          v_window_start
          + make_interval(secs => p_window_seconds)
          - v_now
        )
      )
    )::integer
  );

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_retry;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

comment on function public.consume_api_rate_limit(text, text, integer, integer) is
  'Service-role-only atomic fixed-window rate limiter for Edge Functions. Subjects are SHA-256 hashed before storage.';

commit;
