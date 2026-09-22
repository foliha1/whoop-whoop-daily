// ============================================================================
// WhoopPointsChange — the results screen's hero: what today earned.
//
// "+4 today" with the new total beside it and the tier name beneath. A day not
// yet played shows the total alone. Crossing into a higher tier is marked.
//
// The total handed in must already have been read AFTER today's run was
// written; this component only renders what it is given.
// ============================================================================

import React from "react";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import type { WhoopPoints } from "@/lib/whoopPoints";
import { SCORE_LABEL, formatPointsChange, tierName } from "@/lib/whoopTiers";
import { BORDER, COLORS, RADIUS, RAW, SPACE, textStyle } from "@/lib/tokens";

const WhoopPointsChange: React.FC<{
  points: WhoopPoints | null;
  mobile: boolean;
  /** True when today crossed into a higher tier: the block says so. */
  tierUp?: boolean;
}> = ({ points, mobile, tierUp = false }) => {
  if (points === null) return null;

  const change = formatPointsChange(
    points.todayPoints,
    points.totalBeforeToday,
    points.total
  );
  const ink = tierUp ? RAW.warmBlack : COLORS.ink;

  return (
    <div
      data-testid="result-points"
      data-tier-up={tierUp ? "1" : undefined}
      style={{
        alignSelf: "stretch",
        boxSizing: "border-box",
        border: BORDER.heavy,
        borderRadius: RADIUS.sm,
        background: tierUp ? COLORS.orange : COLORS.panel,
        padding: SPACE[6],
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: SPACE[1],
      }}
    >
      <span
        style={{
          ...textStyle("label", mobile),
          color: tierUp ? RAW.warmBlack : COLORS.inkMuted,
        }}
      >
        {SCORE_LABEL}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: SPACE[3],
        }}
      >
        {change.text && (
          <span
            data-testid="result-points-today"
            style={{ ...textStyle("display", mobile), color: ink }}
          >
            {change.text}
          </span>
        )}
        <span
          data-testid="result-points-total"
          style={{ ...textStyle(change.text ? "subhead" : "display", mobile), color: ink }}
        >
          {points.total}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: SPACE[3],
          minWidth: 0,
        }}
      >
        <CurrentTierBadge tier={points.tier} size={mobile ? 36 : 42} testId="result-tier-badge" />
        <span style={{ ...textStyle("control", mobile), color: ink }}>
          {tierName(points.tier)}
        </span>
      </div>
      {tierUp && (
        <span
          data-testid="result-tier-up"
          style={{ ...textStyle("captionItalic", mobile), color: RAW.warmBlack }}
        >
          New tier!
        </span>
      )}
    </div>
  );
};

export default WhoopPointsChange;
