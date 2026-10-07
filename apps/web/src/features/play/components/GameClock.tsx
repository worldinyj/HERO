export function formatGameClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function GameClock({
  label,
  clockMin,
  deadlineMin,
}: {
  label: string;
  clockMin: number;
  deadlineMin?: number;
}) {
  return (
    <div className="game-status" aria-label="게임 진행 시간">
      <span>{label}</span>
      <span>
        {formatGameClock(clockMin)}
        {deadlineMin === undefined ? null : (
          <small> · 마감 {formatGameClock(deadlineMin)}</small>
        )}
      </span>
    </div>
  );
}
