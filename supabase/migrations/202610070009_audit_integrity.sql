begin;

create or replace function private.reject_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'audit_logs_are_immutable';
end;
$$;

drop trigger if exists audit_logs_immutable_guard on public.audit_logs;
create trigger audit_logs_immutable_guard
before update or delete on public.audit_logs
for each row
execute function private.reject_audit_log_mutation();

revoke all on function private.reject_audit_log_mutation()
  from public, anon, authenticated;

revoke insert, update, delete on public.audit_logs from authenticated;

create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

comment on table public.audit_logs is
  'Append-only audit ledger. UPDATE and DELETE are rejected by trigger for every role, including service operations.';

commit;
