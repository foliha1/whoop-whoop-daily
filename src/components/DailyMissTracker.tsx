import React from "react";
import { MISSES_PER_ROUND } from "@/lib/dailyEngine";
import { BORDER, COLORS, SPACE } from "@/lib/tokens";

/** Two markers for the current round, filled as its misses are spent. Shared by the board and How to Play. */
const DailyMissTracker: React.FC<{ used: number }> = ({ used }) => (
  <div
    role="img"
    aria-label={`${used} of ${MISSES_PER_ROUND} misses used this round`}
    style={{ display: "flex", gap: SPACE[2], alignItems: "center" }}
  >
    {Array.from({ length: MISSES_PER_ROUND }, (_, i) => (
      <span
        key={i}
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          border: BORDER.heavy,
          background: i < used ? COLORS.red : "transparent",
          transition: "background 200ms ease",
        }}
      />
    ))}
  </div>
);

export default DailyMissTracker;
