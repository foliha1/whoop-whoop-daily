import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePortalHost } from "@/hooks/usePortalHost";
import DailyShapeRule from "@/components/DailyShapeRule";
import { DAILY_CONTENT_MAX_W } from "@/components/DailyFrame";
import MotionReveal from "@/components/MotionReveal";
import ChaseHeadline from "@/components/ChaseHeadline";
import {
  BORDER,
  MOTION,
  RADIUS,
  COLORS,
  RAW,
  SPACE,
  buttonStyle,
  panelStyle,
  textStyle,
} from "@/lib/tokens";

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

const HEADLINE = "Great Game!";

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
        borderColor: COLORS.ink,
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
        background: COLORS.surface,
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
          <MotionReveal index={0}><ChaseHeadline text={HEADLINE} mobile={mobile} /></MotionReveal>

          {/* Results block — 40px below the headline. */}
          <MotionReveal index={1}><div
            style={{
              marginTop: SPACE[16] + SPACE[2],
              display: "flex",
              flexDirection: "column",
              gap: SPACE[4],
            }}
          >
            {/* Ties at the top share 1st and each get a winner row. */}
            {winners.map((entry, index) => (
              <MotionReveal kind="list" index={index} key={entry.seat}>{winnerRow(entry)}</MotionReveal>
            ))}

            {rest.length > 0 && (
              <div
                style={{
                  ...panelStyle("panel", 4),
                  background: COLORS.panel,
                  borderColor: COLORS.ink,
                  borderRadius: RADIUS.sm,
                }}
              >
                {rest.map((e, i) => (
                  <MotionReveal kind="list" index={winners.length + i} key={e.seat}><div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: SPACE[8],
                      padding: `${SPACE[3]}px ${SPACE[2]}px`,
                      borderBottom:
                        i === rest.length - 1
                          ? undefined
                          : `2px solid ${COLORS.ink}`,
                    }}
                  >
                    <span
                      style={{
                        ...textStyle("resultRow", mobile),
                        color: COLORS.inkMuted,
                        flex: "0 0 auto",
                      }}
                    >
                      {ordinal(rankOf(e.score))}
                    </span>
                    <span
                      style={{
                        ...textStyle("resultRow", mobile),
                        color: COLORS.ink,
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
                        color: COLORS.ink,
                        flex: "0 0 auto",
                        textAlign: "right",
                      }}
                    >
                      {e.score}/{target}
                    </span>
                  </div></MotionReveal>
                ))}
              </div>
            )}
          </div></MotionReveal>

          {/* Buttons */}
          <MotionReveal index={2}><div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
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
                  borderColor: COLORS.ink,
                  borderRadius: RADIUS.sm,
                  minHeight: 79,
                }}
              >
                Play Again!
              </button>
            ) : (
              <div
                role="status"
                aria-live="polite"
                style={{
                  ...buttonStyle("neutral", "lg", { mobile, fullWidth: true, disabled: true }),
                  ...textStyle("resultButton", mobile),
                  background: COLORS.panel,
                  color: COLORS.inkMuted,
                  border: BORDER.heavy,
                  borderColor: COLORS.ink,
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
                    borderColor: COLORS.ink,
                    borderRadius: RADIUS.sm,
                    minHeight: 58,
                    flex: "1 1 0",
                    minWidth: 0,
                  }}
                >
                  Invite
                </button>
              )}
              <button
                type="button"
                onClick={onDone}
                style={{
                  ...buttonStyle("ink", "lg", { mobile, fullWidth: !onInvite }),
                  ...textStyle("resultButton", mobile),
                  background: COLORS.ink,
                  color: COLORS.surface,
                  border: BORDER.heavy,
                  borderColor: COLORS.ink,
                  borderRadius: RADIUS.sm,
                  minHeight: 58,
                  flex: onInvite ? "0 0 124px" : "1 1 0",
                  width: onInvite ? 124 : undefined,
                }}
              >
                Done
              </button>
            </div>
          </div></MotionReveal>

          {/* Quiet footer: the one route out of Classic, to the Daily. No
              email capture here — Classic is not an acquisition surface. */}
          <MotionReveal index={3}><nav
            aria-label="More from Whoop! Whoop!"
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
                color: COLORS.inkMuted,
                textDecoration: "none",
                borderBottom: `1px solid ${COLORS.inkMuted}`,
                paddingBottom: 1,
                transition: MOTION.fast,
              }}
            >
              Play today's Daily
            </a>
          </nav></MotionReveal>
        </div>

      </FitScale>

      {strip}
    </div>
  );

  return portalHost ? createPortal(body, portalHost) : null;
};

export default ClassicResultScreen;
