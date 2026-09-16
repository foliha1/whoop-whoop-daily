import React from "react";
import { COLORS, FONT_FAMILY_UI, FONT_SIZE, FONT_WEIGHT_UI, LINE_HEIGHT } from "@/lib/tokens";
import DailyLogoLockup from "@/components/DailyLogoLockup";

/**
 * Branded loading screen for the Classic route's lazy chunks. The lockup
 * breathes gently (see `ww-loading-breathe` in index.css) instead of a bare
 * "Loading…" line. Reduced-motion users get the static lockup, no pulse.
 */
const ClassicLoading: React.FC = () => (
  <div
    role="status"
    aria-label="Loading WHOOP! WHOOP! Classic"
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      backgroundColor: COLORS.surface,
    }}
  >
    <div className="ww-loading-breathe" style={{ width: "min(60vw, 220px)" }}>
      <DailyLogoLockup variant="classic" />
    </div>
    <span
      style={{
        fontFamily: FONT_FAMILY_UI,
        fontSize: FONT_SIZE.sm,
        fontWeight: FONT_WEIGHT_UI,
        lineHeight: LINE_HEIGHT.label,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: COLORS.inkMuted,
      }}
    >
      Loading…
    </span>
  </div>
);

export default ClassicLoading;
