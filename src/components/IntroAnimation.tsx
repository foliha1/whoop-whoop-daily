import React, { Suspense, useEffect, useRef, useState } from "react";
import type { LottieRefCurrentProps } from "lottie-react";
import { COLORS, RAW } from "@/lib/tokens";

// Never let a failed chunk fetch throw inside Suspense and blank the screen.
const Lottie = React.lazy(() =>
  import("lottie-react")
    .then((m) => ({ default: m.default }))
    .catch(() => ({ default: (() => null) as unknown as typeof import("lottie-react").default })),
);

const STORAGE_KEY = "ww_intro_seen";
const ASSET_URL = "/intro/whoop-intro.json";

// Module-level preload. Starts as soon as this module is evaluated (lazy
// import from MultiplayerPage), so by the time the component mounts the
// fetch is already in flight — and often complete.
let introJsonPromise: Promise<unknown> | null = null;
export const preloadIntroJson = (): Promise<unknown> => {
  if (introJsonPromise) return introJsonPromise;
  introJsonPromise = fetch(ASSET_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .catch(() => null);
  return introJsonPromise;
};

export const hasSeenIntro = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const markSeen = () => {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
};

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export type IntroDoneReason = "complete" | "skip" | "timeout" | "error";

interface IntroAnimationProps {
  onDone: (reason: IntroDoneReason) => void;
  /** Preloaded Lottie JSON. When provided, no fetch is issued. */
  preloadedData?: unknown | null;
}

// The final frame of the Jitter export masks the logo, so the last frame is
// pattern-only. We therefore never fade the Lottie out and never unmount it:
// once it lands on its final frame it stays there for the rest of the session
// as the page background. No match-cut, no opacity transitions on it.
type Phase = "playing" | "persistent";

interface LottieJson {
  fr?: number;
  ip?: number;
  op?: number;
}

const computeDurationMs = (json: unknown): number | null => {
  if (!json || typeof json !== "object") return null;
  const j = json as LottieJson;
  const fr = typeof j.fr === "number" ? j.fr : 0;
  const ip = typeof j.ip === "number" ? j.ip : 0;
  const op = typeof j.op === "number" ? j.op : 0;
  if (fr <= 0 || op <= ip) return null;
  return ((op - ip) / fr) * 1000;
};

const IntroAnimation: React.FC<IntroAnimationProps> = ({ onDone, preloadedData }) => {
  const [data, setData] = useState<unknown | null>(preloadedData ?? null);
  const [phase, setPhase] = useState<Phase>("playing");
  const doneRef = useRef(false);
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);
  const durationMsRef = useRef<number | null>(computeDurationMs(preloadedData));

  const finish = React.useCallback(
    (reason: IntroDoneReason) => {
      if (doneRef.current) return;
      doneRef.current = true;
      markSeen();
      onDone(reason);
    },
    [onDone],
  );

  // Freeze Lottie on its final frame so the last (pattern-only) frame becomes
  // the page background. Safe to call multiple times; no-op if the player
  // isn't mounted yet.
  const freezeOnFinalFrame = React.useCallback(() => {
    const api = lottieRef.current;
    if (!api) return;
    try {
      const total = api.getDuration?.(true);
      if (typeof total === "number" && total > 0) {
        // getDuration(true) returns total frames. goToAndStop with isFrame=true.
        api.goToAndStop?.(Math.max(0, total - 1), true);
      }
    } catch { /* ignore */ }
  }, []);

  // On completion: leave Lottie mounted and paused on its final frame. Drop
  // the overlay's z-index so the lobby receives input; the frozen frame
  // becomes the page background for the rest of the session.
  const completeAndPersist = React.useCallback(() => {
    if (doneRef.current) return;
    finish("complete");
    setPhase("persistent");
  }, [finish]);

  // Skip must ALSO persist the animation. If the player is already mounted,
  // jump to the final frame and drop into the persistent background phase —
  // never unmount. Only when no data has arrived at all do we bail to the
  // parent with an "error" so it can fall back to the static pattern.
  const skip = React.useCallback(() => {
    if (phase !== "playing") return;
    if (!data) {
      finish("error");
      return;
    }
    freezeOnFinalFrame();
    finish("skip");
    setPhase("persistent");
  }, [finish, phase, data, freezeOnFinalFrame]);

  // Load asset if not preloaded. On any failure, tell the parent so it can
  // fall back to the static pattern — we have nothing to persist.
  useEffect(() => {
    if (data) return;
    let cancelled = false;
    if (prefersReducedMotion()) {
      finish("error");
      return;
    }
    preloadIntroJson().then((json) => {
      if (cancelled) return;
      if (!json) {
        finish("error");
        return;
      }
      durationMsRef.current = computeDurationMs(json);
      setData(json);
    });
    return () => {
      cancelled = true;
    };
  }, [data, finish]);

  // Hard safety net. If Lottie's onComplete never fires (asset stall, tab
  // thrash), freeze on the final frame and persist — do NOT unmount. The
  // parent treats "timeout" like "complete"/"skip": keep Lottie as the
  // background, don't swap in the static pattern.
  useEffect(() => {
    if (!data || phase !== "playing") return;
    const duration = durationMsRef.current ?? 3000;
    const cap = duration + 3000;
    const to = window.setTimeout(() => {
      if (doneRef.current) return;
      freezeOnFinalFrame();
      finish("timeout");
      setPhase("persistent");
    }, cap);
    return () => window.clearTimeout(to);
  }, [data, phase, finish, freezeOnFinalFrame]);

  // Skip on any keypress or pointer down anywhere — only while the intro is
  // still visually active. Once in the persistent background phase, the
  // listeners are removed so clicks on the lobby are unaffected.
  useEffect(() => {
    if (phase === "persistent") return;
    const onKey = () => skip();
    const onPointer = () => skip();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("touchstart", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("touchstart", onPointer, true);
    };
  }, [skip, phase]);

  if (!data && phase === "playing") return null;

  const isActive = phase === "playing";

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        // While playing: on top of everything so it fully covers the page.
        // Once persistent: drop behind all UI so the frozen final frame
        // becomes the background layer for the rest of the session.
        zIndex: isActive ? 2147483000 : -1,
        // The intro art is composed against brand black, so it carries its own
        // literal ground in both themes rather than inheriting the page's.
        // Transparent once it becomes the persistent background layer.
        background: isActive ? RAW.warmBlack : "transparent",
        pointerEvents: isActive ? "auto" : "none",
        cursor: isActive ? "pointer" : "default",
        overflow: "hidden",
      }}
    >
      {data && (
        <Suspense fallback={null}>
          <Lottie
            lottieRef={lottieRef}
            animationData={data}
            loop={false}
            autoplay
            onComplete={completeAndPersist}
            onDOMLoaded={() => {
              const api = lottieRef.current;
              if (!api) return;
              const total = api.getDuration?.(true);
              if (total !== undefined && total <= 0) {
                finish("error");
                return;
              }
              // Guarantee immediate playback at native speed. Some builds of
              // lottie-web hold on frame 0 for a few hundred ms after mount
              // before the first RAF; forcing setSpeed(1) + play() here
              // eliminates that stall without altering rate.
              try {
                api.setSpeed?.(1);
                api.play?.();
              } catch { /* ignore */ }
            }}
            rendererSettings={{ preserveAspectRatio: "xMidYMid slice" }}
            style={{ width: "100%", height: "100%", pointerEvents: "none" }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default IntroAnimation;
