// ============================================================================
// HomeControl — the one top-left 44×44 slot shared by every non-Home screen
// when the umbrella is ON. `home` shows a house and goes to "/"; `leave`
// shows the red X the Daily uses once a run has started. Same box, same spot.
// Only rendered behind useUmbrella(); OFF screens never mount it.
// ============================================================================

import React from "react";
import { House, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BORDER, COLORS, RADIUS, buttonStyle } from "@/lib/tokens";

export const HOME_CONTROL_SIZE = 44;

const srOnly: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};

const HomeControl: React.FC<{
  kind?: "home" | "leave";
  /** Leave only: opens the caller's confirmation. */
  onLeave?: () => void;
}> = ({ kind = "home", onLeave }) => {
  const navigate = useNavigate();
  const leave = kind === "leave";
  return (
    <button
      type="button"
      className="ww-press ww-home-control"
      data-testid={leave ? "daily-leave" : "home-control"}
      aria-label={leave ? "Leave today's Daily" : "Home"}
      onClick={() => (leave ? onLeave?.() : navigate("/"))}
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top) + 12px)",
        left: "calc(env(safe-area-inset-left) + 12px)",
        zIndex: 60,
        width: HOME_CONTROL_SIZE,
        height: HOME_CONTROL_SIZE,
        boxSizing: "border-box",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        ...(leave
          ? { ...buttonStyle("danger", "md"), width: HOME_CONTROL_SIZE, height: HOME_CONTROL_SIZE, padding: 0 }
          : { background: COLORS.ink, color: COLORS.surface, border: BORDER.heavy, borderRadius: RADIUS.sm }),
      }}
    >
      {leave ? <X size={22} aria-hidden="true" /> : <House size={22} aria-hidden="true" />}
      <span style={srOnly}>{leave ? "Leave" : "Home"}</span>
    </button>
  );
};

export default HomeControl;
