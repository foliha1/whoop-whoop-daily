import React, { useEffect, useRef, useState } from "react";
import { DAILY_SCREEN_FADE_MS, UI_EASE } from "@/lib/animationTiming";

/**
 * True cross-fade between the daily screens (ready → gameplay → results).
 *
 * The current tree is rendered live as a pass-through — it is never held in
 * state, so the screen is never a commit behind. The outgoing tree is captured
 * into state exactly once, during the render in which `screenKey` changes, and
 * is never updated afterwards. The transition effect depends on `screenKey`
 * alone so a re-render caused by this component's own state cannot cancel the
 * frame/timer that finish the fade.
 *
 * An opaque wrapper holds the page background and never animates its opacity,
 * so there is always a solid colour behind everything. Opacity only — no
 * slide, no scale — so it is kept under `prefers-reduced-motion: reduce`.
 */
const MS = DAILY_SCREEN_FADE_MS;

interface Layer {
  key: string;
  children: React.ReactNode;
}

const DailyScreenFade: React.FC<{
  /** Identity of the screen being shown; a change triggers the cross-fade. */
  screenKey: string;
  /** Page background for this screen, cross-faded with the content. */
  background: string;
  /** Fade the first screen in on mount (opacity only). */
  fadeInOnMount?: boolean;
  children: React.ReactNode;
}> = ({ screenKey, background, fadeInOnMount = false, children }) => {
  const [mounted, setMounted] = useState(!fadeInOnMount);
  useEffect(() => {
    if (mounted) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [outgoing, setOutgoing] = useState<Layer | null>(null);
  /** True from the render in which the key changes until the next frame. */
  const [entering, setEntering] = useState(false);
  const prevKey = useRef(screenKey);
  /** The tree rendered on the previous commit — the outgoing candidate. */
  const prevChildren = useRef<React.ReactNode>(children);

  // Derive the outgoing layer during render, exactly once per key change.
  if (screenKey !== prevKey.current) {
    const from = prevKey.current;
    prevKey.current = screenKey;
    setOutgoing({ key: from, children: prevChildren.current });
    setEntering(true);
  }

  // Track the latest tree without putting `children` in a dependency array.
  useEffect(() => {
    prevChildren.current = children;
  });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntering(false));
    const t = window.setTimeout(() => setOutgoing(null), MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [screenKey]);

  const layerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    transition: `opacity ${MS}ms ${UI_EASE}`,
  };

  return (
    <div
      style={{
        position: "relative",
        minHeight: "var(--ww-vh)",
        background,
        transition: `background-color ${MS}ms ${UI_EASE}`,
      }}
    >
      {outgoing && (
        <div
          key="daily-fade-outgoing"
          data-testid="daily-fade-outgoing"
          style={{ ...layerStyle, opacity: entering ? 1 : 0, pointerEvents: "none" }}
        >
          {outgoing.children}
        </div>
      )}
      <div
        key="daily-fade-current"
        data-testid="daily-fade-current"
        style={
          outgoing
            ? { ...layerStyle, opacity: entering ? 0 : 1 }
            : { position: "relative", opacity: mounted ? 1 : 0, transition: fadeInOnMount ? `opacity ${MS}ms ${UI_EASE}` : undefined }
        }
      >
        {children}
      </div>
    </div>
  );
};

export default DailyScreenFade;
