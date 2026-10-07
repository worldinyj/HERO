begin;

create or replace function public.my_current_rank()
returns table (
  season_id uuid,
  season_key text,
  season_title text,
  hp_point integer,
  scenario_count integer,
  overall_rank integer,
  overall_top_percent integer,
  plant_rank integer,
  plant_top_percent integer,
  job_rank integer,
  job_top_percent integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or (select private.auth_role()) <> 'player' then
    raise exception 'player_required';
  end if;

  return query
  select
    s.id,
    s.season_key,
    s.title,
    coalesce(i.season_hp, 0)::integer,
    coalesce(i.scenario_count, 0)::integer,
    i.overall_rank,
    i.overall_top_percent,
    i.plant_rank,
    i.plant_top_percent,
    i.job_rank,
    i.job_top_percent
  from public.seasons s
  left join private.v_season_scores_internal i
    on i.season_id = s.id
   and i.user_id = v_user
  where s.status = 'open'
    and now() >= s.starts_at
    and now() < s.ends_at
  order by s.starts_at desc, s.id
  limit 1;
end;
$$;

revoke all on function public.my_current_rank() from public, anon;
grant execute on function public.my_current_rank() to authenticated;

comment on function public.my_current_rank() is
  'Player-only self rank for the open season. Returns only the authenticated player''s own HP and rank fields; no other user identity or learning metrics.';

commit;
