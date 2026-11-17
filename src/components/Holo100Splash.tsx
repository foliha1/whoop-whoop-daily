// ============================================================================
// Daily #100 splash: nine cards, face down, flip row by row to read
//   D  A  Y
//   1  0  0
//   !  !  !
// then the whole thing fades and the app is already loaded underneath.
//
// Shows once per device on Holo Day (HOLO_AT_LOAD), never on /admin. Tap
// anywhere or "Skip" to leave early. Reduced motion: faces show at once,
// short hold, quick fade. `?splash=1` replays it for testing.
// ============================================================================

import React from "react";
import { HOLO_AT_LOAD, holoDayOpen } from "@/lib/holoSkin";
import { isSplashPreview, markSplashSeen, splashSeen } from "@/lib/daily100";
import { CARD_BACK_URL } from "@/lib/assetUrls";
import { CARD_FLIP_MS } from "@/lib/animationTiming";
import { RAW } from "@/lib/tokens";

const GLYPHS = ["D", "A", "Y", "1", "0", "0", "!", "!", "!"] as const;
/** Each row is one colour: DAY red, 100 orange, !!! blue (brand order after black). */
const FILLS = [RAW.red, RAW.orange, RAW.blue] as const;
/** Cream on red and blue, warm black on orange (brand rule). */
const INKS = [RAW.cream, RAW.warmBlack, RAW.cream] as const;

const START_MS = 350; // backs settle before the first flip
const ROW_GAP_MS = 380;
const COL_GAP_MS = 110;
const HOLD_MS = 1300;
const EXIT_MS = 450;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.pathname.startsWith("/admin")) return false;
  if (isSplashPreview()) return true;
  return HOLO_AT_LOAD && !splashSeen();
}

const Holo100Splash: React.FC = () => {
  const [show] = React.useState(shouldShow);
  const [flipped, setFlipped] = React.useState<boolean[]>(() => GLYPHS.map(() => false));
  const [leaving, setLeaving] = React.useState(false);
  const [gone, setGone] = React.useState(false);
  const timers = React.useRef<number[]>([]);

  const leave = React.useCallback(() => {
    setLeaving(true);
    timers.current.push(window.setTimeout(() => setGone(true), reducedMotion() ? 150 : EXIT_MS));
  }, []);

  React.useEffect(() => {
    if (!show) return;
    // Only the real day counts as "seen": a ?skin=holo preview the day before
    // must not use up the player's one splash.
    if (!isSplashPreview() && holoDayOpen()) markSplashSeen();
    const t = timers.current;
    if (reducedMotion()) {
      setFlipped(GLYPHS.map(() => true));
      t.push(window.setTimeout(leave, 1600));
    } else {
      GLYPHS.forEach((_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        t.push(window.setTimeout(() => {
          setFlipped((prev) => prev.map((v, j) => (j === i ? true : v)));
        }, START_MS + row * ROW_GAP_MS + col * COL_GAP_MS));
      });
      const lastFlip = START_MS + 2 * ROW_GAP_MS + 2 * COL_GAP_MS + CARD_FLIP_MS;
      t.push(window.setTimeout(leave, lastFlip + HOLD_MS));
    }
    return () => t.forEach((id) => window.clearTimeout(id));
  }, [show, leave]);

  if (!show || gone) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Day 100!!! Welcome to 100 Days of Daily"
      data-testid="daily-100-splash"
      className="ww-spook-frame"
      onClick={leave}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "grid",
        placeItems: "center",
        background: "var(--ww-surface)",
        opacity: leaving ? 0 : 1,
        transition: `opacity ${EXIT_MS}ms ease`,
        cursor: "pointer",
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); leave(); }}
        className="daily-btn-howto"
        style={{
          position: "absolute",
          top: "max(16px, env(safe-area-inset-top))",
          right: 16,
          minHeight: 44,
          padding: "8px 16px",
          border: `2px solid ${RAW.warmBlack}`,
          borderRadius: 4,
          fontFamily: "Geist, system-ui, sans-serif",
          fontWeight: 500,
          fontSize: 14,
          color: "var(--ww-ink)",
          cursor: "pointer",
        }}
      >
        Skip
      </button>

      <div
        aria-hidden="true"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "clamp(8px, 2.5vw, 14px)",
          width: "min(84vw, 360px, calc((100dvh - 120px) * 0.7))",
        }}
      >
        {GLYPHS.map((glyph, i) => {
          const row = Math.floor(i / 3);
          return (
            <div
              key={i}
              className="ww-game-card"
              style={{
                position: "relative",
                aspectRatio: "5 / 7",
                borderRadius: 8,
                perspective: 600,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  transformStyle: "preserve-3d",
                  transform: flipped[i] ? "rotateY(180deg)" : "rotateY(0deg)",
                  transition: reducedMotion() ? "none" : `transform ${CARD_FLIP_MS}ms ease-in-out`,
                }}
              >
                {/* back */}
                <img
                  src={CARD_BACK_URL}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 8,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                />
                {/* face */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    boxSizing: "border-box",
                    padding: "7%",
                    borderRadius: 8,
                    background: RAW.cream,
                    transform: "rotateY(180deg)",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 4,
                      background: FILLS[row],
                      display: "grid",
                      placeItems: "center",
                      color: INKS[row],
                      fontFamily: "Friend, Georgia, serif",
                      fontSize: "clamp(48px, 17vw, 84px)",
                      lineHeight: 1,
                    }}
                  >
                    {glyph}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Holo100Splash;
