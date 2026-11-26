import React from "react";
import { MISSES_PER_ROUND } from "@/lib/dailyEngine";
import { COLORS, SPACE } from "@/lib/tokens";

/**
 * Two solid dots for the current round: khaki while unused, red once spent.
 * They sit on the cream status bar. Shared by the board and How to Play.
 */
export const MISS_DOT = SPACE[4]; // 8px
const DailyMissTracker: React.FC<{ used: number }> = ({ used }) => (
  <div
    role="img"
    aria-label={`${used} of ${MISSES_PER_ROUND} misses used this round`}
    style={{ display: "flex", gap: SPACE[3], alignItems: "center", justifyContent: "center" }}
  >
    {Array.from({ length: MISSES_PER_ROUND }, (_, i) => (
      <span
        key={i}
        aria-hidden="true"
        style={{
          width: MISS_DOT,
          height: MISS_DOT,
          borderRadius: 999,
          background: i < used ? COLORS.red : COLORS.panel,
          transition: "background 200ms ease",
        }}
      />
    ))}
  </div>
);

export default DailyMissTracker;
