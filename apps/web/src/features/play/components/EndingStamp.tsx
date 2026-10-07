import type { Ending } from "@hero/schema";

const ENDING_LABEL: Record<Ending, string> = {
  safe_complete: "안전 완료",
  safe_stop: "안전 정지",
  near_miss: "근접오류",
  event: "사건",
};

export function EndingStamp({ ending }: { ending: Ending }) {
  return (
    <div
      className={`ending-stamp ending-stamp--${ending}`}
      role="status"
      aria-label={`결과: ${ENDING_LABEL[ending]}`}
    >
      <span>HERO RESULT</span>
      <strong>{ENDING_LABEL[ending]}</strong>
    </div>
  );
}
