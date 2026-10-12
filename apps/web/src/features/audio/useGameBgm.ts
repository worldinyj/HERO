import { useEffect } from "react";
import { useAudio } from "./AudioContext";

// The game owns its music because play and review share the same URL.
export function useGameBgm(active: boolean, finished: boolean): void {
  const { manager, settings } = useAudio();
  const silent = settings.bgmMuted || settings.bgmVolume === 0;

  useEffect(() => {
    if (!active) return;
    if (!settings.initialized || silent) {
      manager.stopBgm();
      return;
    }
    void manager.playBgm(finished ? "BGM-05" : "BGM-03");
    return () => manager.stopBgm();
  }, [active, finished, manager, settings.initialized, silent]);
}
