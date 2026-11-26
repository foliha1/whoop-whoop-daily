import React from "react";
import { MISSES_PER_ROUND } from "@/lib/dailyEngine";
import { COLORS, RAW, SPACE } from "@/lib/tokens";

/**
 * Two solid dots for the current round: cream while unused, red once spent.
 * Shared by the board and How to Play.
 */
export const MISS_DOT = SPACE[5]; // 10px
const DailyMissTracker: React.FC<{ used: number }> = ({ used }) => (
  <div
    role="img"
    aria-label={`${used} of ${MISSES_PER_ROUND} misses used this round`}
    style={{ display: "flex", gap: SPACE[4], alignItems: "center" }}
  >
    {Array.from({ length: MISSES_PER_ROUND }, (_, i) => (
      <span
        key={i}
        aria-hidden="true"
        style={{
          width: MISS_DOT,
          height: MISS_DOT,
          borderRadius: 999,
          background: i < used ? COLORS.red : RAW.cream,
          transition: "background 200ms ease",
        }}
      />
    ))}
  </div>
);

export default DailyMissTracker;
