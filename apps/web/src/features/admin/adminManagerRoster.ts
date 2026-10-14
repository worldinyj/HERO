import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidAdminOrgLists } from "./adminOrgResponse";

export const MANAGER_PAGE_SIZE = 20;
export interface ManagerRow {
  id: string;
  plant_id: string | null;
  real_name: string;
  nickname: string;
  is_active: boolean;
  plants: { display_name: string; code: string } | Array<{ display_name: string; code: string }> | null;
}
export interface ManagerFilters {
  name: string;
  plantId: string;
  status: "all" | "active" | "inactive";
}
export const EMPTY_MANAGER_FILTERS: ManagerFilters = { name: "", plantId: "", status: "all" };

/** A filtered page is never evidence that the selected account still has the same state. */
export async function isCurrentManager(client: SupabaseClient, selected: ManagerRow): Promise<boolean> {
  const { data, error } = await client.from("profiles")
    .select("id, plant_id, real_name, nickname, is_active")
    .eq("id", selected.id).eq("role", "plant_manager").maybeSingle();
  return !error && isValidAdminOrgLists([], [data], []) && data?.is_active === true &&
    data.id === selected.id && data.plant_id === selected.plant_id &&
    data.real_name === selected.real_name && data.nickname === selected.nickname;
}

export function exactManagerCount(count: number | null): number {
  if (count === null || !Number.isSafeInteger(count) || count < 0) throw new Error("담당자 수를 확인하지 못했습니다.");
  return count;
}

export function readPlantManagerCounts(rows: unknown): Map<string, number> {
  if (!Array.isArray(rows)) throw new Error("발전소별 담당자 수를 확인하지 못했습니다.");
  return new Map(rows.map((row: unknown) => {
    if (!row || typeof row !== "object" || !("id" in row) || typeof row.id !== "string" ||
      !("profiles" in row) || !Array.isArray(row.profiles) || row.profiles.length !== 1 ||
      !row.profiles[0] || typeof row.profiles[0].count !== "number") {
      throw new Error("발전소별 담당자 수를 확인하지 못했습니다.");
    }
    return [row.id, exactManagerCount(row.profiles[0].count)];
  }));
}

export async function readManagerPage(client: SupabaseClient, filters: ManagerFilters, page: number) {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error("잘못된 담당자 페이지입니다.");
  const name = filters.name.trim();
  // PostgREST treats * as a LIKE wildcard as well. Reject it instead of widening a name search.
  if (name.includes("*") || name.length > 100) throw new Error("이름은 100자 이내로 입력하고 * 문자는 제외해주세요.");
  let query = client.from("profiles")
    .select("id, plant_id, real_name, nickname, is_active, plants(display_name, code)", { count: "exact" })
    .eq("role", "plant_manager")
    .order("real_name", { ascending: true }).order("id", { ascending: true });
  if (name) query = query.ilike("real_name", `%${name.replace(/[\\%_]/gu, "\\$&")}%`);
  if (filters.plantId) query = query.eq("plant_id", filters.plantId);
  if (filters.status !== "all") query = query.eq("is_active", filters.status === "active");
  const { data, count, error } = await query.range(page * MANAGER_PAGE_SIZE, (page + 1) * MANAGER_PAGE_SIZE - 1);
  if (error) throw error;
  const total = exactManagerCount(count);
  if (!isValidAdminOrgLists([], data, []) || !Array.isArray(data) ||
    data.length !== Math.min(MANAGER_PAGE_SIZE, Math.max(0, total - page * MANAGER_PAGE_SIZE))) {
    throw new Error("담당자 목록 응답을 확인하지 못했습니다.");
  }
  return { rows: data as unknown as ManagerRow[], total };
}
