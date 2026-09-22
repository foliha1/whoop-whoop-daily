// ============================================================================
// WhoopPointsChange — the compact results-screen score panel.
//
// The total handed in must already have been read AFTER today's run was
// written; this component only renders what it is given.
// ============================================================================

import React from "react";
import { Link } from "react-router-dom";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import type { WhoopPoints } from "@/lib/whoopPoints";
import { SCORE_LABEL, badgeArt, formatPointsChange, tierName } from "@/lib/whoopTiers";
import { BORDER, COLORS, FONT_SIZE, RADIUS, RAW, SPACE, buttonStyle, textStyle } from "@/lib/tokens";

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
  const tierHasArt = badgeArt(points.tier) !== null;
  const innerPanel: React.CSSProperties = {
    boxSizing: "border-box",
    border: BORDER.heavy,
    borderRadius: RADIUS.sm,
    background: COLORS.surface,
  };

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
        padding: SPACE[8],
        display: "flex",
        flexDirection: "column",
        gap: SPACE[4],
      }}
    >
      <span
        style={{
          ...textStyle("label", mobile),
          color: tierUp ? RAW.warmBlack : COLORS.inkMuted,
          textAlign: "center",
        }}
      >
        {SCORE_LABEL}
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) repeat(2, minmax(0, 1fr))",
          gap: SPACE[5],
          minWidth: 0,
        }}
      >
        <div
          data-testid="result-tier-tile"
          style={{
            ...innerPanel,
            minWidth: 0,
            padding: `${SPACE[3]}px ${SPACE[2]}px`,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACE[2],
            textAlign: "center",
          }}
        >
          {tierHasArt && (
            <div style={{ width: FONT_SIZE["4.5xl"], flex: "0 0 auto" }}>
              <CurrentTierBadge tier={points.tier} size={FONT_SIZE["7xl"]} fluid testId="result-tier-badge" />
            </div>
          )}
          <span
            data-testid="result-tier-name"
            style={{
              ...textStyle(tierHasArt ? "control" : "title", mobile),
              color: COLORS.ink,
              textAlign: "center",
            }}
          >
            {tierName(points.tier)}
          </span>
        </div>
        <div
          data-testid="result-points-today"
          style={{
            ...innerPanel,
            minWidth: 0,
            padding: SPACE[3],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...textStyle("subhead", mobile),
            color: ink,
            textAlign: "center",
          }}
        >
          {change.text ?? `+0 today`}
        </div>
        <div
          data-testid="result-points-total"
          style={{
            ...innerPanel,
            minWidth: 0,
            padding: SPACE[3],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...textStyle("subhead", mobile),
            color: COLORS.ink,
            textAlign: "center",
          }}
        >
          {points.total} total
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: SPACE[5],
          minWidth: 0,
        }}
      >
          <Link
            to="/you"
            data-testid="result-you-link"
            className="ww-press"
            style={{ ...buttonStyle("secondary", "md", { mobile, fullWidth: true }), minWidth: 0, paddingInline: SPACE[2] }}
          >
            Your Stats
          </Link>
          <Link
            to="/groups"
            data-testid="result-groups-link"
            className="ww-press"
            style={{ ...buttonStyle("secondary", "md", { mobile, fullWidth: true }), minWidth: 0, paddingInline: SPACE[2] }}
          >
            Groups
          </Link>
      </div>
      {tierUp && (
        <span
          data-testid="result-tier-up"
          style={{ ...textStyle("captionItalic", mobile), color: RAW.warmBlack, textAlign: "center" }}
        >
          New tier!
        </span>
      )}
    </div>
  );
};

export default WhoopPointsChange;
