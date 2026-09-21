// ============================================================================
// DailyStatsBlock — the four lifetime stats and the recall trend.
//
// These lived on the results screen; they belong to the player's long-term
// self, so they moved here and the YOU page is their only home. Same data
// (`get_daily_stats`, `useDailyRecall`) and the same `DailyRecallTrend`
// component — only the address changed.
//
// Either half can be null and is then simply absent: no zeroes, no placeholder.
// ============================================================================

import React from "react";
import DailyRecallTrend from "@/components/DailyRecallTrend";
import { formatAvgMisses, type DailyStats } from "@/lib/dailyResults";
import type { RecallTrend } from "@/lib/dailyRecall";
import {
  BORDER,
  COLORS,
  FONT_WEIGHT_UI,
  RADIUS,
  SPACE,
  TEXT,
  textStyle,
} from "@/lib/tokens";

const DailyStatsBlock: React.FC<{
  stats: DailyStats | null;
  recall: RecallTrend | null;
  mobile: boolean;
}> = ({ stats, recall, mobile }) => {
  if (stats === null && recall === null) return null;

  // Same tile treatment as the results screen's numbers: caps label one step
  // under the caption size, with the line box pinned so two-line labels do not
  // change a tile's height.
  const capSize = mobile ? TEXT.caption.mobileSize : TEXT.caption.size;
  const labelStyle: React.CSSProperties = {
    ...textStyle("caption", mobile),
    fontWeight: FONT_WEIGHT_UI,
    fontSize: capSize - (mobile ? 2 : 1),
    lineHeight: 1.15,
    minHeight: `${capSize * TEXT.caption.lineHeight}px`,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: COLORS.inkMuted,
  };

  const tile = (label: string, value: string) => (
    <div
      key={label}
      data-testid="stat-tile"
      style={{
        flex: "1 1 0",
        minWidth: 0,
        border: BORDER.heavy,
        borderRadius: RADIUS.sm,
        background: COLORS.panel,
        padding: `${SPACE[4]}px ${SPACE[3]}px`,
        textAlign: "center",
      }}
    >
      <div style={{ ...textStyle("display", mobile), color: COLORS.ink }}>{value}</div>
      <div style={labelStyle}>{label}</div>
    </div>
  );

  return (
    <div
      data-testid="you-stats-block"
      style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: 0 }}
    >
      <h2 style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>
        All time results
      </h2>
      {stats !== null && (
        <div style={{ display: "flex", gap: SPACE[4], alignSelf: "stretch", marginTop: SPACE[4] }}>
          {tile("Days played", `${stats.totalPlayed}`)}
          {tile("Clean runs", `${stats.cleanRuns}`)}
          {tile("Longest streak", `${stats.bestStreak}`)}
          {tile("Average misses", formatAvgMisses(stats.avgMisses))}
        </div>
      )}
      {recall !== null && (
        <div
          data-testid="recall-container"
          style={{
            marginTop: stats !== null ? SPACE[8] : SPACE[4],
            alignSelf: "stretch",
            background: "transparent",
            border: `2px solid ${COLORS.blue}`,
            borderRadius: RADIUS.sm,
            padding: `${SPACE[4]}px ${SPACE[3]}px`,
          }}
        >
          <DailyRecallTrend trend={recall} mobile={mobile} />
        </div>
      )}
    </div>
  );
};

export default DailyStatsBlock;
