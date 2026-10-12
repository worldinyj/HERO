import type { Ending } from "@hero/schema";
import { useEffect } from "react";
import { useAudio } from "../../audio/AudioContext";

const ENDING_LABEL: Record<Ending, string> = {
  safe_complete: "안전 완료",
  safe_stop: "안전 정지",
  near_miss: "근접오류",
  event: "사건",
};

const ENDING_SOUND: Record<Ending, string> = {
  safe_complete: "SFX-10",
  safe_stop: "BGM-06",
  near_miss: "BGM-07",
  event: "BGM-08",
};

export function EndingStamp({ ending }: { ending: Ending }) {
  const { manager: audioManager } = useAudio();

  useEffect(() => {
    const controller = new AbortController();
    void audioManager.playSfx(ENDING_SOUND[ending], {
      fallbackAssetId: "SFX-10",
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [audioManager, ending]);

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
