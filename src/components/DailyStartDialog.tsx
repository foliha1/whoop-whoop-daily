import React from "react";
import { dailyTitle } from "@/lib/daily100";
import { createPortal } from "react-dom";
import { DAILY_SCREEN_FADE_MS } from "@/lib/animationTiming";
import { COLORS, SPACE, buttonStyle, panelStyle, textStyle } from "@/lib/tokens";
import { DEFAULT_STUDY_LEVEL, STUDY_LEVELS, type StudyLevel } from "@/lib/studyLevels";

const FOCUSABLE = '[data-testid="home-control"], [data-testid="daily-start"], [data-testid="daily-start-howto"], [data-testid="daily-study-level"]';

const DailyStartDialog: React.FC<{
  puzzleNumber: number;
  mobile?: boolean;
  busy?: boolean;
  onStart: (level: StudyLevel) => void;
  onHowTo?: () => void;
}> = ({ puzzleNumber, mobile = false, busy = false, onStart, onHowTo }) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const startedRef = React.useRef(false);
  const timerRef = React.useRef<number | null>(null);
  const [exiting, setExiting] = React.useState(false);
  const [level, setLevel] = React.useState<StudyLevel>(DEFAULT_STUDY_LEVEL);
  const levelRef = React.useRef(level);
  levelRef.current = level;

  const start = React.useCallback(() => {
    if (busy || startedRef.current) return;
    startedRef.current = true;
    setExiting(true);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    timerRef.current = window.setTimeout(() => onStart(levelRef.current), reduced ? 0 : DAILY_SCREEN_FADE_MS);
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
          {dailyTitle(puzzleNumber)}
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE[2] }}>
          <h2 style={{ ...textStyle("subhead", mobile), color: COLORS.ink, margin: 0 }}>
            How long do you want to look?
          </h2>
          <p id="daily-start-body" style={{ ...textStyle("body", mobile), color: COLORS.inkMuted, margin: 0 }}>
            Less time, more points.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Study time"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: SPACE[2], marginTop: -SPACE[4] }}
        >
          {STUDY_LEVELS.map((opt) => {
            const active = level === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid="daily-study-level"
                data-level={opt.key}
                disabled={busy || exiting}
                onClick={() => setLevel(opt.key)}
                className="ww-press"
                style={{
                  ...buttonStyle("quiet", "md", { mobile, selected: active }),
                  padding: `${SPACE[2]}px 0`,
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <span>{opt.name}</span>
                <span style={{ ...textStyle("caption", mobile), color: "inherit" }}>{opt.ms / 1000}s</span>
              </button>
            );
          })}
        </div>
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