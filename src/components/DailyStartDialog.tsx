import React from "react";
import { createPortal } from "react-dom";
import { DAILY_SCREEN_FADE_MS } from "@/lib/animationTiming";
import { COLORS, SPACE, buttonStyle, panelStyle, textStyle } from "@/lib/tokens";

const FOCUSABLE = '[data-testid="home-control"], [data-testid="daily-start"], [data-testid="daily-start-howto"]';

/** Returning-player welcome lines; one per puzzle, cycling by puzzle number. */
export const DAILY_WELCOME_LINES = [
  ["Cards down. Die up.", "Ready when you are."],
  ["Shape, number, or color?", "Ready to find out?"],
  ["Last chance to stretch.", "Then it’s go time."],
  ["Eyes up. Brain on.", "The cards are about to flip."],
  ["Don’t blink.", "Okay, blink a little."],
  ["Stretch your brain.", "It’s go time."],
  ["Same nine cards for everyone.", "Ready to beat them?"],
  ["Memory feeling good today?", "Let’s find out real quick."],
  ["It’s about to get dicey.", "You can laugh."],
  ["Rub those eyes.", "It’s Whoop! Whoop! time."],
  ["I’m sure today will go great.", "But it might not, and that’s fine."],
  ["Did you stretch before this?", "You probably should."],
] as const;

export const dailyWelcomeLine = (puzzleNumber: number): readonly [string, string] =>
  DAILY_WELCOME_LINES[((puzzleNumber % DAILY_WELCOME_LINES.length) + DAILY_WELCOME_LINES.length) % DAILY_WELCOME_LINES.length];

const DailyStartDialog: React.FC<{
  puzzleNumber: number;
  mobile?: boolean;
  busy?: boolean;
  onStart: () => void;
  onHowTo?: () => void;
}> = ({ puzzleNumber, mobile = false, busy = false, onStart, onHowTo }) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const startedRef = React.useRef(false);
  const timerRef = React.useRef<number | null>(null);
  const [exiting, setExiting] = React.useState(false);

  const start = React.useCallback(() => {
    if (busy || startedRef.current) return;
    startedRef.current = true;
    setExiting(true);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    timerRef.current = window.setTimeout(onStart, reduced ? 0 : DAILY_SCREEN_FADE_MS);
  }, [busy, onStart]);

  React.useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) => !item.hasAttribute("disabled") && item.offsetParent !== null,
      );
      if (items.length < 2) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (current <= 0 ? items.length - 1 : current - 1)
        : (current < 0 || current === items.length - 1 ? 0 : current + 1);
      event.preventDefault();
      items[next]?.focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-start-title"
      aria-describedby="daily-start-body"
      data-testid="daily-start-dialog"
      className="ww-ui-modal-backdrop"
      data-motion-exit={exiting ? "true" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: SPACE[8],
        background: "rgba(35, 31, 32, 0.6)",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={panelRef}
        className="ww-ui-modal-panel"
        data-motion-exit={exiting ? "true" : undefined}
        style={{
          ...panelStyle("surface", 8),
          width: "100%",
          maxWidth: 340,
          display: "flex",
          flexDirection: "column",
          gap: SPACE[8],
          textAlign: "center",
        }}
      >
        <h1 id="daily-start-title" style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>
          Whoop! Whoop! Daily #{puzzleNumber}
        </h1>
        <p id="daily-start-body" style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}>
          {dailyWelcomeLine(puzzleNumber)[0]}<br />{dailyWelcomeLine(puzzleNumber)[1]}
        </p>
        <button
          type="button"
          autoFocus
          data-testid="daily-start"
          disabled={busy || exiting}
          aria-busy={busy || exiting || undefined}
          onClick={start}
          className="ww-press"
          style={{ ...buttonStyle("primary", "lg", { mobile, fullWidth: true, disabled: busy || exiting }), width: "100%" }}
        >
          {busy ? "Dealing…" : "Start"}
        </button>
        {onHowTo ? (
          <button
            type="button"
            data-testid="daily-start-howto"
            disabled={busy || exiting}
            onClick={onHowTo}
            className="ww-press"
            style={{ ...buttonStyle("quiet", "md", { mobile, fullWidth: true, disabled: busy || exiting }), width: "100%", marginTop: -SPACE[4] }}
          >
            How to Play
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};

export default DailyStartDialog;