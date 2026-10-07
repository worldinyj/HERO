begin;

create table if not exists public.scenario_source_evidence (
  id uuid primary key default gen_random_uuid(),
  scenario_version_id uuid not null
    references public.scenario_versions(id) on delete cascade,
  source_system text not null,
  source_reference text not null,
  source_title text not null,
  source_url text,
  usage_review_status text not null default 'pending',
  content_review_status text not null default 'pending',
  anonymization_reviewed boolean not null default false,
  systemic_learning_reviewed boolean not null default false,
  review_notes text,
  created_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint scenario_source_system_check check (
    source_system in ('OPIS', 'KINS', 'NSSC', 'OTHER_OFFICIAL')
  ),
  constraint scenario_source_reference_nonempty check (
    char_length(trim(source_reference)) between 1 and 160
  ),
  constraint scenario_source_title_nonempty check (
    char_length(trim(source_title)) between 1 and 240
  ),
  constraint scenario_source_url_length check (
    source_url is null or char_length(source_url) <= 1000
  ),
  constraint scenario_source_usage_review_check check (
    usage_review_status in ('pending', 'approved', 'rejected')
  ),
  constraint scenario_source_content_review_check check (
    content_review_status in ('pending', 'approved', 'rejected')
  ),
  constraint scenario_source_notes_length check (
    review_notes is null or char_length(review_notes) <= 2000
  ),
  unique (scenario_version_id, source_system, source_reference)
);

create index if not exists scenario_source_evidence_version_idx
  on public.scenario_source_evidence (
    scenario_version_id,
    source_system,
    usage_review_status,
    content_review_status
  );

alter table public.scenario_source_evidence enable row level security;

revoke all on public.scenario_source_evidence
  from public, anon, authenticated;

create or replace function private.scenario_has_publishable_opis_source(
  p_scenario_version_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.scenario_source_evidence e
    where e.scenario_version_id = p_scenario_version_id
      and e.source_system = 'OPIS'
      and e.usage_review_status = 'approved'
      and e.content_review_status = 'approved'
      and e.anonymization_reviewed = true
      and e.systemic_learning_reviewed = true
  );
$$;

revoke all on function private.scenario_has_publishable_opis_source(uuid)
  from public, anon, authenticated;
grant execute on function private.scenario_has_publishable_opis_source(uuid)
  to service_role;

create or replace function private.enforce_scenario_publish_source_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if new.status <> 'published'
     or old.status = 'published' then
    return new;
  end if;

  select s.slug
    into v_slug
  from public.scenarios s
  where s.id = new.scenario_id;

  if v_slug = 's00_tutorial' then
    return new;
  end if;

  if not private.scenario_has_publishable_opis_source(new.id) then
    raise exception 'scenario_source_evidence_required';
  end if;

  return new;
end;
$$;

drop trigger if exists scenario_publish_source_gate
  on public.scenario_versions;

create trigger scenario_publish_source_gate
before update of status on public.scenario_versions
for each row
execute function private.enforce_scenario_publish_source_gate();

revoke all on function private.enforce_scenario_publish_source_gate()
  from public, anon, authenticated;

comment on table public.scenario_source_evidence is
  'Internal-only scenario provenance and content-governance evidence. Source references are never exposed to player-facing scenario JSON.';

comment on function private.scenario_has_publishable_opis_source(uuid) is
  'Returns true only when a scenario version has at least one OPIS source whose usage, content, anonymization, and systemic-learning reviews are all approved.';

commit;
