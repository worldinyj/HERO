import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

export interface AuditEvent {
  actorUserId?: string | null;
  plantId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

function toRow(event: AuditEvent) {
  return {
    actor_user_id: event.actorUserId ?? null,
    plant_id: event.plantId ?? null,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    metadata: event.metadata ?? {},
  };
}

export async function writeAuditLog(
  admin: SupabaseClient,
  event: AuditEvent,
): Promise<void> {
  const { error } = await admin.from("audit_logs").insert(toRow(event));

  if (error) {
    throw new Error(`audit_log_write_failed:${error.message}`);
  }
}

export async function writeAuditLogs(
  admin: SupabaseClient,
  events: AuditEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const { error } = await admin.from("audit_logs").insert(events.map(toRow));

  if (error) {
    throw new Error(`audit_log_write_failed:${error.message}`);
  }
}
