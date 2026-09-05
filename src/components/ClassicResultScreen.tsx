import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePortalHost } from "@/hooks/usePortalHost";
import DailyShapeRule from "@/components/DailyShapeRule";
import { DAILY_CONTENT_MAX_W } from "@/components/DailyFrame";
import {
  BORDER,
  RADIUS,
  RAW,
  SPACE,
  buttonStyle,
  panelStyle,
  textStyle,
} from "@/lib/tokens";
import { HEADLINE_CHASE_MS } from "@/lib/animationTiming";

/**
 * The Classic (multiplayer + solo) result screen.
 *
 * Presentation only — it reads the finished scores and renders standings. No
 * rules, no reducer, no Daily. It is portalled to the body so it covers the
 * whole viewport rather than the board's aspect box, and it reuses the Daily's
 * shared pattern strip (`DailyShapeRule`) top and bottom.
 *
 * Everything that must keep a literal colour in both themes reads from `RAW`.
 */

/** Strip width from the spec — the 402 column minus its 24px inset each side. */
const STRIP_W = 354;
const STRIP_H = 19;

/** The chase cycle. Four brand stops, in the order they travel across the text. */
const CHASE = [RAW.warmBlack, RAW.red, RAW.orange, RAW.blue] as const;

const HEADLINE = "Great Game!";

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/** "Great Game!" with the brand colours travelling through the letters. */
const ChaseHeadline: React.FC<{ mobile?: boolean }> = ({ mobile }) => {
  const reduced = prefersReducedMotion();
  const [paused, setPaused] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );

  // Pause while the tab is hidden: an off-screen infinite animation is pure
  // wasted work, and resuming from the same stop keeps the cycle coherent.
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const chaseVars = {
    "--ww-chase-1": CHASE[0],
    "--ww-chase-2": CHASE[1],
    "--ww-chase-3": CHASE[2],
    "--ww-chase-4": CHASE[3],
    "--ww-chase-dur": `${HEADLINE_CHASE_MS}ms`,
  } as React.CSSProperties;

  return (
    <h2
      aria-label={HEADLINE}
      style={{
        ...textStyle("resultHero", mobile),
        margin: 0,
        textAlign: "center",
        color: RAW.warmBlack,
        ...chaseVars,
      }}
    >
      {HEADLINE.split("").map((ch, i) => {
        // Reduced motion rests on this letter's own stop in the cycle — the
        // frame at t=0 — instead of freezing somewhere between two colours.
        const rest = CHASE[i % CHASE.length];
        return (
          <span
            key={`${ch}-${i}`}
            aria-hidden="true"
            className={reduced ? undefined : "ww-chase-letter"}
            style={{
              color: rest,
              // Negative delay shifts each letter one step further along the
              // cycle, which is what makes the colours appear to travel.
              animationDelay: reduced
                ? undefined
                : `-${(i * HEADLINE_CHASE_MS) / CHASE.length}ms`,
              animationPlayState: paused ? "paused" : "running",
              whiteSpace: ch === " " ? "pre" : undefined,
            }}
          >
            {ch}
          </span>
        );
      })}
    </h2>
  );
};

/**
 * Vertical fit: the design is specced at 874px tall. On a 520px viewport the
 * natural column is measured and scaled down as a whole, so the composition
 * keeps its proportions instead of reflowing or clipping.
 */
const FitScale: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const measure = () => {
      const avail = box.clientHeight;
      const natural = inner.scrollHeight;
      if (!avail || !natural) return;
      setScale(Math.min(1, avail / natural));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      ref={boxRef}
      style={{
        width: "100%",
        flex: "1 1 auto",
        minHeight: 0,
        display: "flex",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: "100%",
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "center center",
          alignSelf: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export type ResultEntry = { seat: number; name: string; score: number };

const ordinal = (rank: number) =>
  rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`;

const ClassicResultScreen: React.FC<{
  entries: ResultEntry[];
  target: number;
  /** Host / solo only: joiners wait for the rematch. */
  canRematch: boolean;
  onPlayAgain: () => void;
  /** Omitted in solo — there is no table to share, so no button renders. */
  onInvite?: () => void;
  onDone: () => void;
  mobile?: boolean;
}> = ({ entries, target, canRematch, onPlayAgain, onInvite, onDone, mobile = false }) => {
  const portalHost = usePortalHost("mp-result");

  const ordered = entries.slice().sort((a, b) => b.score - a.score);
  // Standard competition ranking: equal scores share the position and the next
  // distinct score skips ahead (1st, 1st, 3rd).
  const rankOf = (score: number) =>
    1 + ordered.filter((o) => o.score > score).length;
  const top = ordered.length > 0 ? ordered[0].score : -Infinity;
  const winners = ordered.filter((e) => e.score === top);
  const rest = ordered.filter((e) => e.score !== top);

  const strip = (
    <DailyShapeRule
      style={{ width: "100%", maxWidth: STRIP_W, height: STRIP_H, flex: "none" }}
    />
  );

  const winnerRow = (e: ResultEntry) => (
    <div
      key={e.seat}
      style={{
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: SPACE[8],
        width: "100%",
        minHeight: 57,
        padding: SPACE[4],
        background: RAW.blue,
        border: BORDER.heavy,
        borderColor: RAW.warmBlack,
        borderRadius: RADIUS.sm,
      }}
    >
      <span style={{ ...textStyle("resultWinner", mobile), color: RAW.blue2, flex: "0 0 auto" }}>
        {ordinal(rankOf(e.score))}
      </span>
      <span
        style={{
          ...textStyle("resultWinner", mobile),
          color: RAW.cream,
          flex: "1 1 0",
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {e.name}
      </span>
      <span
        style={{
          ...textStyle("resultWinner", mobile),
          color: RAW.cream,
          flex: "0 0 auto",
          textAlign: "right",
        }}
      >
        {e.score}/{target}
      </span>
    </div>
  );

  const body = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        boxSizing: "border-box",
        height: "var(--ww-vh)",
        background: RAW.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        gap: SPACE[12],
        padding: SPACE[12],
        paddingBottom: `calc(${SPACE[12]}px + env(safe-area-inset-bottom))`,
        overflow: "hidden",
      }}
    >
      {strip}

      <FitScale>
        <div
          style={{
            width: "100%",
            maxWidth: DAILY_CONTENT_MAX_W,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: SPACE[12],
          }}
        >
          <ChaseHeadline mobile={mobile} />

          {/* Results block — 40px below the headline. */}
          <div
            style={{
              marginTop: SPACE[16] + SPACE[2],
              display: "flex",
              flexDirection: "column",
              gap: SPACE[4],
            }}
          >
            {/* Ties at the top share 1st and each get a winner row. */}
            {winners.map(winnerRow)}

            {rest.length > 0 && (
              <div
                style={{
                  ...panelStyle("panel", 4),
                  background: RAW.khaki,
                  borderColor: RAW.warmBlack,
                  borderRadius: RADIUS.sm,
                }}
              >
                {rest.map((e, i) => (
                  <div
                    key={e.seat}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: SPACE[8],
                      padding: `${SPACE[3]}px ${SPACE[2]}px`,
                      borderBottom:
                        i === rest.length - 1
                          ? undefined
                          : `2px solid ${RAW.warmBlack}`,
                    }}
                  >
                    <span
                      style={{
                        ...textStyle("resultRow", mobile),
                        color: RAW.mocha,
                        flex: "0 0 auto",
                      }}
                    >
                      {ordinal(rankOf(e.score))}
                    </span>
                    <span
                      style={{
                        ...textStyle("resultRow", mobile),
                        color: RAW.warmBlack,
                        flex: "1 1 0",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.name}
                    </span>
                    <span
                      style={{
                        ...textStyle("resultRow", mobile),
                        color: RAW.warmBlack,
                        flex: "0 0 auto",
                        textAlign: "right",
                      }}
                    >
                      {e.score}/{target}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
            {canRematch ? (
              <button
                type="button"
                onClick={onPlayAgain}
                style={{
                  ...buttonStyle("primary", "lg", { mobile, fullWidth: true }),
                  ...textStyle("resultButton", mobile),
                  background: RAW.red,
                  color: RAW.cream,
                  border: BORDER.heavy,
                  borderColor: RAW.warmBlack,
                  borderRadius: RADIUS.sm,
                  minHeight: 79,
                }}
              >
                PLAY AGAIN!
              </button>
            ) : (
              <div
                role="status"
                aria-live="polite"
                style={{
                  ...buttonStyle("neutral", "lg", { mobile, fullWidth: true, disabled: true }),
                  ...textStyle("resultButton", mobile),
                  background: RAW.khaki,
                  color: RAW.mocha,
                  border: BORDER.heavy,
                  borderColor: RAW.warmBlack,
                  borderRadius: RADIUS.sm,
                  minHeight: 79,
                  cursor: "default",
                }}
              >
                WAITING…
              </div>
            )}

            <div style={{ display: "flex", gap: SPACE[4], width: "100%" }}>
              {onInvite && (
                <button
                  type="button"
                  onClick={onInvite}
                  style={{
                    ...buttonStyle("secondary", "lg", { mobile }),
                    ...textStyle("resultButton", mobile),
                    background: RAW.blue,
                    color: RAW.cream,
                    border: BORDER.heavy,
                    borderColor: RAW.warmBlack,
                    borderRadius: RADIUS.sm,
                    minHeight: 58,
                    flex: "1 1 0",
                    minWidth: 0,
                  }}
                >
                  INVITE
                </button>
              )}
              <button
                type="button"
                onClick={onDone}
                style={{
                  ...buttonStyle("ink", "lg", { mobile, fullWidth: !onInvite }),
                  ...textStyle("resultButton", mobile),
                  background: RAW.warmBlack,
                  color: RAW.cream,
                  border: BORDER.heavy,
                  borderColor: RAW.warmBlack,
                  borderRadius: RADIUS.sm,
                  minHeight: 58,
                  flex: onInvite ? "0 0 124px" : "1 1 0",
                  width: onInvite ? 124 : undefined,
                }}
              >
                DONE
              </button>
            </div>
          </div>

          {/* Quiet footer: the one route out of Classic, to the Daily. No
              email capture here — Classic is not an acquisition surface. */}
          <nav
            aria-label="More from Whoop Whoop"
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: SPACE[2],
              opacity: 0.85,
            }}
          >
            <a
              href="/"
              style={{
                ...textStyle("caption", mobile),
                color: RAW.mocha,
                textDecoration: "none",
                borderBottom: `1px solid ${RAW.mocha}`,
                paddingBottom: 1,
                transition: MOTION.fast,
              }}
            >
              Play today's Daily
            </a>
          </nav>
        </div>

      </FitScale>

      {strip}
    </div>
  );

  return portalHost ? createPortal(body, portalHost) : null;
};

export default ClassicResultScreen;
