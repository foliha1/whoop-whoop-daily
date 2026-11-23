// ============================================================================
// WhoopPointsChange — the compact results-screen score panel.
//
// The total handed in must already have been read AFTER today's run was
// written; this component only renders what it is given.
// ============================================================================

import React from "react";
import { Link } from "react-router-dom";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import Daily100Badge from "@/components/Daily100Badge";
import { KEEPSAKE_NAME } from "@/lib/daily100";
import MaterialIcon from "@/components/MaterialIcon";
import { formatPoints, type WhoopPoints } from "@/lib/whoopPoints";
import { SCORE_LABEL, badgeArt, tierName } from "@/lib/whoopTiers";
import { BORDER, COLORS, FONT_SIZE, RADIUS, RAW, SPACE, buttonStyle, textStyle } from "@/lib/tokens";

const WhoopPointsChange: React.FC<{
  points: WhoopPoints | null;
  mobile: boolean;
  /** True when today crossed into a higher tier: the block says so. */
  tierUp?: boolean;
  /** True when today's game earned the 100 Days of Daily keepsake. */
  newBadge?: boolean;
  /** The Daily results slot already owns its staggered entrance. */
  animate?: boolean;
  /** Your Stats is for signed-in players; the Daily results hide it until then. */
  showStatsLink?: boolean;
}> = ({ points, mobile, tierUp = false, newBadge = false, animate = true, showStatsLink = true }) => {
  if (points === null) return null;

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
      className={animate ? "daily-intro" : undefined}
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
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACE[2],
            textAlign: "center",
          }}
        >
          {tierHasArt && (
            <div style={{ width: FONT_SIZE["7xl"], maxWidth: "100%", flex: "0 0 auto" }}>
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
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACE[1],
            textAlign: "center",
          }}
        >
          <span style={{ ...textStyle("resultWinner", mobile), color: COLORS.ink }}>
            +{formatPoints(points.todayPoints ?? 0)}
          </span>
          <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
            today
          </span>
        </div>
        <div
          data-testid="result-points-total"
          style={{
            ...innerPanel,
            minWidth: 0,
            padding: SPACE[3],
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACE[1],
            textAlign: "center",
          }}
        >
          <span style={{ ...textStyle("resultWinner", mobile), color: COLORS.ink }}>
            {formatPoints(points.total)}
          </span>
          <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
            total
          </span>
        </div>
      </div>
      {newBadge && (
        <div
          data-testid="result-new-badge"
          style={{
            ...innerPanel,
            display: "flex",
            alignItems: "center",
            gap: SPACE[4],
            padding: `${SPACE[3]}px ${SPACE[4]}px`,
            textAlign: "left",
          }}
        >
          <div style={{ width: FONT_SIZE["6xl"], flex: "0 0 auto" }}>
            <Daily100Badge size={FONT_SIZE["6xl"]} fluid />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ ...textStyle("control", mobile), color: COLORS.ink }}>New Badge!</span>
            <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
              {KEEPSAKE_NAME}. Only for players of Daily #100.
            </span>
          </div>
        </div>
      )}
      {showStatsLink && (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: SPACE[5],
          minWidth: 0,
        }}
      >
        <Link
          to="/you"
          state={{ wwReturn: "results" }}
          data-testid="result-you-link"
          className="ww-press"
          style={{ ...buttonStyle("secondary", "md", { mobile, fullWidth: true }), minWidth: 0, paddingInline: SPACE[2] }}
        >
          <MaterialIcon name="leaderboard" size={16} />
          Your Stats
        </Link>
      </div>
      )}
      {tierUp && !newBadge && (
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
