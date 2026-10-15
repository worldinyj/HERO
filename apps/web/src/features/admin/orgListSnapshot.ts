export const ORG_READ_BATCH_SIZE = 200;

interface BatchResult { data: unknown; count: number | null; error: unknown }

/** Reconciliation needs the entire roster, including rows outside the visible page.
 * Never publish a partial read or silently accept the PostgREST response cap. */
export async function readOrgListSnapshot(
  read: (from: number, to: number) => PromiseLike<BatchResult>,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const ids = new Set<string>();
  let total: number | null = null;
  do {
    signal?.throwIfAborted();
    const result = await read(rows.length, rows.length + ORG_READ_BATCH_SIZE - 1);
    if (result.error) throw result.error;
    if (result.count === null || !Number.isSafeInteger(result.count) || result.count < 0 ||
      (total !== null && total !== result.count) || !Array.isArray(result.data) ||
      result.data.length !== Math.min(ORG_READ_BATCH_SIZE, Math.max(0, result.count - rows.length))) {
      throw new Error("조직 목록 전체를 확인하지 못했습니다. 다시 불러와주세요.");
    }
    total = result.count;
    for (const row of result.data as unknown[]) {
      if (!row || typeof row !== "object" || !("id" in row) || typeof row.id !== "string" || ids.has(row.id)) {
        throw new Error("조직 목록이 변경되었거나 응답이 올바르지 않습니다. 다시 불러와주세요.");
      }
      ids.add(row.id);
      rows.push(row);
    }
  } while (rows.length < total);
  return rows;
}
