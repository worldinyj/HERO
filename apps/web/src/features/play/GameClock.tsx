import { useEffect, useRef, useState } from "react";

export type ClockUrgency = "normal" | "attention" | "urgent" | "overdue";

export function formatGameClock(totalMinutes: number): string {
  const normalized = ((Math.trunc(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function clockUrgency(
  clockMin: number,
  deadlineMin: number,
): ClockUrgency {
  const remaining = deadlineMin - clockMin;

  if (remaining < 0) return "overdue";
  if (remaining <= 10) return "urgent";
  if (remaining <= 30) return "attention";
  return "normal";
}

export function GameClock({
  clockMin,
  deadlineMin,
}: {
  clockMin: number;
  deadlineMin: number;
}) {
  const previousClock = useRef(clockMin);
  const [delta, setDelta] = useState<number | null>(null);
  const urgency = clockUrgency(clockMin, deadlineMin);

  useEffect(() => {
    const previous = previousClock.current;
    previousClock.current = clockMin;

    if (clockMin <= previous) {
      setDelta(null);
      return;
    }

    setDelta(clockMin - previous);
    const timer = window.setTimeout(() => setDelta(null), 1100);
    return () => window.clearTimeout(timer);
  }, [clockMin]);

  const remaining = deadlineMin - clockMin;
  const deadlineLabel =
    remaining < 0
      ? `마감 ${Math.abs(remaining)}분 초과`
      : `마감까지 ${remaining}분`;

  return (
    <span
      className={`game-clock game-clock--${urgency}`}
      aria-label={`현재 ${formatGameClock(clockMin)}, 마감 ${formatGameClock(deadlineMin)}, ${deadlineLabel}`}
    >
      <strong className="game-clock__value">{formatGameClock(clockMin)}</strong>
      <small>마감 {formatGameClock(deadlineMin)}</small>
      {delta !== null ? (
        <span className="game-clock__delta" role="status">
          +{delta}분
        </span>
      ) : null}
    </span>
  );
}
