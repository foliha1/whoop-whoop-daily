// Captures the browser's install offer (Android / desktop Chrome) as early as
// possible so Settings can show it later. iOS never fires it; there we guide
// the player to Safari's Share → Add to Home Screen instead.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const isStandalone = (): boolean =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = (): boolean =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const canPromptInstall = (): boolean => deferred !== null;

export const subscribeInstall = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const promptInstall = async (): Promise<boolean> => {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  notify();
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" }));
  return choice.outcome === "accepted";
};
