import type { SupabaseClient } from "@supabase/supabase-js";
import { readWithDeadline } from "../../lib/readWithDeadline";
import { isValidManagerDashboardLists } from "./managerDashboardResponse";

/** These three RPCs only read manager-scoped rosters; never retry a mutation here. */
export function readManagerDashboard(client: SupabaseClient, signal?: AbortSignal) {
  return readWithDeadline(async readSignal => {
    const [participation, pending, aggregate] = await Promise.all([
      client.rpc("manager_player_rows").abortSignal(readSignal),
      client.rpc("manager_pending_invites").abortSignal(readSignal),
      client.rpc("manager_job_aggregates").abortSignal(readSignal),
    ]);
    const error = participation.error ?? pending.error ?? aggregate.error;
    if (error) throw error;
    if (!isValidManagerDashboardLists(participation.data, pending.data, aggregate.data)) {
      throw new Error("manager_dashboard_result_invalid");
    }
    return { participation: participation.data, pending: pending.data, aggregate: aggregate.data };
  }, signal);
}
