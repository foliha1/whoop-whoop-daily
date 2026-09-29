import React from "react";
import { createPortal } from "react-dom";
import { useMotionExit } from "@/hooks/useMotionExit";
import { COLORS, SPACE, buttonStyle, panelStyle, textStyle } from "@/lib/tokens";

const FOCUSABLE = '[data-testid="home-control"], [data-testid="daily-start"]';

const DailyStartDialog: React.FC<{
  puzzleNumber: number;
  mobile?: boolean;
  busy?: boolean;
  onStart: () => void;
}> = ({ puzzleNumber, mobile = false, busy = false, onStart }) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const startedRef = React.useRef(false);
  const { exiting, requestExit } = useMotionExit(onStart);

  const start = React.useCallback(() => {
    if (busy || startedRef.current) return;
    startedRef.current = true;
    requestExit();
  }, [busy, requestExit]);

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
          Daily #{puzzleNumber}
        </h1>
        <p id="daily-start-body" style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}>
          10 seconds to study. The die rolls after.
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
      </div>
    </div>,
    document.body,
  );
};

export default DailyStartDialog;