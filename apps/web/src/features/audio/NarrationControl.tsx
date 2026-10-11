import { useEffect, useRef, useState } from "react";
import type { NarrationBinding } from "./audioTypes";
import { useAudio } from "./AudioContext";

export function NarrationControl({ request, autoPlay = true }: {
  request: NarrationBinding;
  autoPlay?: boolean;
}) {
  const { manager, settings, updateSettings } = useAudio();
  const [available, setAvailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const automaticAttempt = useRef<string | null>(null);
  const signature = JSON.stringify(request);
  useEffect(() => {
    let cancelled = false;
    setAvailable(false);
    setFailed(false);
    const binding = JSON.parse(signature) as NarrationBinding;
    void manager.hasNarration(binding).then(async (exists) => {
      if (cancelled) return;
      setAvailable(exists);
      if (exists && autoPlay && automaticAttempt.current !== signature && settings.initialized && !settings.narrationMuted && manager.isUnlocked()) {
        automaticAttempt.current = signature;
        const played = await manager.playNarration(binding);
        if (!cancelled) setFailed(!played);
      }
    });
    return () => {
      cancelled = true;
      if (autoPlay) manager.stopNarration();
    };
  }, [signature, autoPlay, manager, settings.initialized, settings.narrationMuted]);
  if (!available) return null;
  return (
    <div className="narration-control">
      <button type="button" className="text-link" disabled={settings.narrationMuted}
        onClick={() => {
          manager.unlock();
          if (!settings.initialized) {
            automaticAttempt.current = signature;
            updateSettings({ initialized: true });
          }
          void manager.playNarration(request).then((played) => setFailed(!played));
        }}>나레이션 다시 듣기</button>
      <button type="button" className="text-link" onClick={() => manager.stopNarration()}>나레이션 중단</button>
      {failed ? <small role="status">음성을 재생하지 못했습니다. 화면의 글로 계속 진행할 수 있습니다.</small> : null}
    </div>
  );
}
