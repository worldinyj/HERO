begin;

create or replace function private.rollover_monthly_season_at(
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kst_date date := (p_now at time zone 'Asia/Seoul')::date;
  v_closing record;
  v_current_season_id uuid;
begin
  if extract(day from v_kst_date) <> 1 then
    return;
  end if;

  for v_closing in
    select id
    from public.seasons
    where status = 'open'
      and ends_at <= p_now
    for update
  loop
    update public.play_sessions
    set status = 'abandoned',
        updated_at = p_now
    where season_id = v_closing.id
      and status = 'in_progress';

    perform private.snapshot_season(v_closing.id);

    update public.seasons
    set status = 'closed',
        closed_at = p_now
    where id = v_closing.id;

    insert into public.audit_logs (
      actor_user_id,
      plant_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      null,
      null,
      'season.closed',
      'season',
      v_closing.id::text,
      jsonb_build_object('closed_at', p_now)
    );
  end loop;

  v_current_season_id := private.ensure_monthly_season(v_kst_date);

  update public.seasons
  set status = 'open'
  where id = v_current_season_id
    and starts_at <= p_now
    and ends_at > p_now
    and status <> 'open';

  insert into public.audit_logs (
    actor_user_id,
    plant_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  select
    null,
    null,
    'season.opened',
    'season',
    v_current_season_id::text,
    jsonb_build_object('opened_at', p_now)
  where not exists (
    select 1
    from public.audit_logs
    where action = 'season.opened'
      and entity_type = 'season'
      and entity_id = v_current_season_id::text
  );
end;
$$;

revoke all on function private.rollover_monthly_season_at(timestamptz)
  from public, anon, authenticated;

create or replace function private.rollover_monthly_season()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.rollover_monthly_season_at(now());
end;
$$;

revoke all on function private.rollover_monthly_season()
  from public, anon, authenticated;

comment on function private.rollover_monthly_season_at(timestamptz) is
  'Deterministic monthly season rollover at a supplied instant. Used by the cron wrapper and KST/UTC boundary tests.';

comment on function private.rollover_monthly_season() is
  'Cron entrypoint. Uses the current instant and delegates to rollover_monthly_season_at().';

commit;
