// "Leave today's Daily?" — umbrella ON only, opened by the Daily's top-left X
// once a run has started. Same panel, scrim and buttons as Classic's leave
// confirmation. Keep Playing is primary and takes focus; Leave is destructive.

import React from "react";
import { createPortal } from "react-dom";
import AutoFitText from "@/components/AutoFitText";
import { COLORS, CONTROL_H, SPACE, buttonStyle, panelStyle, textStyle } from "@/lib/tokens";

export const DAILY_LEAVE_TITLE = "Leave today's Daily?";
export const DAILY_LEAVE_BODY =
  "You only get one try a day. If you leave now, this run ends and the rounds you haven't finished count as unsolved.";

const DailyLeaveDialog: React.FC<{ mobile?: boolean; onKeepPlaying: () => void; onLeave: () => void }> = ({
  mobile = false,
  onKeepPlaying,
  onLeave,
}) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKeepPlaying();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKeepPlaying]);

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="daily-leave-title"
      aria-describedby="daily-leave-body"
      data-testid="daily-leave-dialog"
      onClick={(e) => { if (e.target === e.currentTarget) onKeepPlaying(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(35, 31, 32, 0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: SPACE[8], zIndex: 1000,
      }}
    >
      <div style={{ ...panelStyle("surface", 8), width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: SPACE[8] }}>
        <div id="daily-leave-title" style={{ ...textStyle("title", mobile), fontStyle: "italic", color: COLORS.ink }}>
          {DAILY_LEAVE_TITLE}
        </div>
        <div id="daily-leave-body" style={{ ...textStyle("body", mobile), color: COLORS.ink }}>
          {DAILY_LEAVE_BODY}
        </div>
        <div style={{ display: "flex", gap: SPACE[5] }}>
          <button
            type="button"
            onClick={onKeepPlaying}
            autoFocus
            style={{ ...buttonStyle("primary", "lg", { mobile }), flexGrow: 1, flexBasis: 0, height: CONTROL_H.lg + SPACE[2], padding: 0 }}
          >
            <AutoFitText minScale={0.6}>Keep Playing</AutoFitText>
          </button>
          <button
            type="button"
            onClick={onLeave}
            style={{ ...buttonStyle("dangerConfirm", "lg", { mobile }), fontStyle: "italic", flexGrow: 1, flexBasis: 0, height: CONTROL_H.lg + SPACE[2], padding: 0 }}
          >
            <AutoFitText minScale={0.6}>Leave</AutoFitText>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DailyLeaveDialog;
