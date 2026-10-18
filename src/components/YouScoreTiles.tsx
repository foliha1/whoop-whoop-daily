import React from "react";
import { StatInfoTile } from "@/components/StatInfo";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import type { WhoopPoints } from "@/lib/whoopPoints";
import { SCORE_LABEL, badgeArt, tierName } from "@/lib/whoopTiers";
import { BORDER, COLORS, FONT_SIZE, RADIUS, SPACE, TEXT, textStyle } from "@/lib/tokens";

/** The same current-tier/total pair on Your Stats and in score announcements. */
const YouScoreTiles: React.FC<{ points: WhoopPoints; mobile: boolean; compact?: boolean; explain?: boolean }> = ({ points, mobile, compact = false, explain = false }) => {
  const badgeSize = compact ? FONT_SIZE["6xl"] : FONT_SIZE["8xl"];
  const tile: React.CSSProperties = {
    boxSizing: "border-box", minWidth: 0, border: BORDER.heavy,
    borderRadius: RADIUS.md, background: COLORS.panel,
  };

  const Box = ({ label, style, children }: { label: string; style: React.CSSProperties; children: React.ReactNode }) =>
    explain ? <StatInfoTile label={label} mobile={mobile} style={style}>{children}</StatInfoTile> : <div style={style}>{children}</div>;
  return (
    <div data-testid="you-score" aria-label={SCORE_LABEL} style={{ width: "100%", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: compact ? SPACE[4] : SPACE[6] }}>
      <Box label="Your Tier" style={{ ...tile, padding: compact ? SPACE[4] : SPACE[8], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", gap: compact ? SPACE[2] : SPACE[6] }}>
        <span style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, textAlign: "center" }}>Your Tier</span>
        <div style={{ width: "80%", maxWidth: badgeSize * 0.8, aspectRatio: "1", display: "grid", placeItems: "center" }}>
          {badgeArt(points.tier) ? (
            <CurrentTierBadge tier={points.tier} size={badgeSize} fluid testId="you-tier-badge" />
          ) : (
            <span aria-hidden="true" style={{ width: "75%", aspectRatio: "1", borderRadius: "50%", background: COLORS.inkMuted }} />
          )}
        </div>
        <span data-testid="you-tier" style={{ ...textStyle("title", mobile), color: COLORS.ink, textAlign: "center", overflowWrap: "anywhere" }}>{tierName(points.tier)}</span>
      </Box>
      <Box label="Total Score" style={{ ...tile, padding: compact ? SPACE[4] : SPACE[8], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE[4], containerType: "inline-size" }}>
        <span style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, textAlign: "center" }}>Total Score</span>
        <span style={{ ...textStyle("scoreTotal", mobile), fontSize: `min(${compact ? TEXT.scoreTotal.mobileSize : TEXT.scoreTotal.size}px, ${Math.floor((compact ? FONT_SIZE["8xl"] : 240) / String(points.total).length)}cqi)`, color: COLORS.ink, whiteSpace: "nowrap", maxWidth: "100%" }}>{points.total}</span>
      </Box>
    </div>
  );
};

export default YouScoreTiles;