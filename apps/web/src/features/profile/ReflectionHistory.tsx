import { useEffect, useRef, useState } from "react";
import { getSupabase } from "../../lib/supabase";
import { readReflectionHistory, type ReflectionRecord } from "./reflectionHistoryData";

const endingLabel = { safe_complete: "안전 완료", safe_stop: "안전 정지", near_miss: "근접오류", event: "사건" };
const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function ReflectionHistory() {
  const [records, setRecords] = useState<ReflectionRecord[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function load() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(false); setRecords(null);
    try {
      const { data, error: failure } = await getSupabase().rpc("my_reflection_history");
      if (failure) throw failure;
      const parsed = readReflectionHistory(data);
      if (alive.current) setRecords(parsed);
    } catch { if (alive.current) setError(true); }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }

  return <section className="panel profile-section" aria-labelledby="reflection-history-title">
    <p className="eyebrow">My Reflections</p>
    <h3 id="reflection-history-title">내 회고 다시보기</h3>
    <p className="muted">최근 완료한 경쟁 플레이 20건과 내가 선택한 방벽 약화 시점을 확인합니다. 각 플레이의 HP는 장별 최고 기록과 다를 수 있습니다.</p>
    <button type="button" className="secondary-button compact-button" disabled={pending} onClick={() => void load()}>
      {pending ? "회고를 불러오고 있습니다…" : error ? "회고 다시 불러오기" : records === null ? "최근 회고 불러오기" : "회고 새로고침"}
    </button>
    {pending ? <p role="status">내 회고 기록을 확인하고 있습니다…</p> : null}
    {error ? <p role="alert">회고 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요.</p> : null}
    {records?.length === 0 ? <p role="status">아직 완료한 경쟁 플레이가 없습니다.</p> : null}
    {records?.length ? <>
      <p role="status">최근 완료 기록 {records.length}건 · 한국 시간 기준</p>
      <div className="record-list">{records.map(record => <article key={record.session_id} className="reflection-history-record">
        <h4>{record.title} · v{record.scenario_version}</h4>
        <p className="muted">{record.season_title} · <time dateTime={record.completed_at}>{dateFormat.format(new Date(record.completed_at))}</time></p>
        <p>{endingLabel[record.ending]} · {record.hp_point} HP</p>
        <p>{record.reflection_state === "available" ? `내가 돌아본 시점: ${record.reflection_label}`
          : record.reflection_state === "not_recorded" ? "이 플레이에는 회고 시점 선택이 저장되어 있지 않습니다."
            : "저장된 회고 시점을 당시 장면과 연결할 수 없습니다."}</p>
      </article>)}</div>
      <p className="muted">회고 선택에는 정답이나 점수 차등이 없습니다.</p>
    </> : null}
  </section>;
}
