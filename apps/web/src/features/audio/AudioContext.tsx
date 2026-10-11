import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HeroAudioManager } from "./audioManager";
import {
  DEFAULT_AUDIO_SETTINGS,
  type AudioSettings,
} from "./audioTypes";

interface AudioContextValue {
  settings: AudioSettings;
  manager: HeroAudioManager;
  chooseInitialAudio: (soundOn: boolean) => Promise<void>;
  updateSettings: (patch: Partial<AudioSettings>) => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<HeroAudioManager | null>(null);
  const manager = managerRef.current ?? new HeroAudioManager();

  if (!managerRef.current) {
    managerRef.current = manager;
  }

  const [settings, setSettings] = useState<AudioSettings>(
    () => manager.getSettings(),
  );

  useEffect(() => manager.subscribe(setSettings), [manager]);

  useEffect(() => {
    void manager.primeManifest();
    const stopWhenHidden = () => { if (document.hidden) { manager.stopNarration(); manager.stopAllSfx(); } };
    document.addEventListener("visibilitychange", stopWhenHidden);
    const stop = () => { manager.stopNarration(); manager.stopAllSfx(); manager.stopBgm(0); };
    // pagehide also covers navigation into the browser back/forward cache.
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [manager]);

  return (
    <AudioContext.Provider
      value={{
        settings,
        manager,
        chooseInitialAudio: (soundOn) =>
          manager.chooseInitialAudio(soundOn),
        updateSettings: (patch) => manager.updateSettings(patch),
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio(): AudioContextValue {
  const value = useContext(AudioContext);

  if (!value) {
    return {
      settings: { ...DEFAULT_AUDIO_SETTINGS },
      manager: new HeroAudioManager(),
      chooseInitialAudio: async () => {},
      updateSettings: () => {},
    };
  }

  return value;
}

export function useDialogueDucking(active = true): void {
  const { manager } = useAudio();

  useEffect(() => {
    manager.setDialogueDucking(active);

    return () => {
      manager.setDialogueDucking(false);
    };
  }, [active, manager]);
}
