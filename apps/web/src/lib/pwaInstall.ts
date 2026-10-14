import { useSyncExternalStore } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
let state = { available: false, installed: false, pending: false };
const listeners = new Set<() => void>();
let initialized = false;

function update(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}

export function initializePwaInstall() {
  if (initialized) return;
  initialized = true;
  const display = window.matchMedia("(display-mode: standalone)");
  const syncDisplay = () => update({ installed: display.matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true });
  syncDisplay();
  display.addEventListener("change", syncDisplay);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    update({ available: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    update({ available: false, installed: true, pending: false });
  });
}

export function usePwaInstall() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => state);
}

export async function promptPwaInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred || state.pending) return "unavailable";
  const prompt = deferred;
  deferred = null;
  update({ available: false, pending: true });
  try {
    await prompt.prompt();
    return (await prompt.userChoice).outcome;
  } finally {
    update({ pending: false });
  }
}

export function saveHeroShortcut() {
  const mac = /Mac/i.test(navigator.platform);
  const url = `${window.location.origin}/`;
  const contents = mac
    ? `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>URL</key><string>${url}</string></dict></plist>`
    : `[InternetShortcut]\r\nURL=${url}\r\n`;
  const blob = new Blob([contents], { type: mac ? "application/x-webloc" : "application/internet-shortcut" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = mac ? "HERO.webloc" : "HERO.url";
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
