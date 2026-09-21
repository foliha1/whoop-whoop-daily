// ============================================================================
// WhoopScoreChange — the results screen's hero: did today move me.
//
// Shows the change and the new score together ("+3 → 58"), a drop honestly
// ("−2 → 56"), and the score alone when nothing moved. Below the engine's
// minimum it says how many more games unlock the score instead.
//
// The score handed in must already have been read AFTER today's run was
// written; this component only renders what it is given.
// ============================================================================

import React from "react";
import type { WhoopScore } from "@/lib/whoopScore";
import { tierForScore } from "@/lib/whoopScore";
import { formatGamesNeeded, formatScoreChange, tierName } from "@/lib/whoopTiers";
import {
  BORDER,
  COLORS,
  RADIUS,
  RAW,
  SPACE,
  textStyle,
} from "@/lib/tokens";

const WhoopScoreChange: React.FC<{
  whoop: WhoopScore | null;
  mobile: boolean;
  /** True when today crossed into a higher tier: the block says so. */
  tierUp?: boolean;
}> = ({ whoop, mobile, tierUp = false }) => {
  if (whoop === null) return null;

  if (whoop.score === null) {
    return (
      <p
        data-testid="result-score-locked"
        style={{
          ...textStyle("body", mobile),
          color: COLORS.inkMuted,
          textAlign: "center",
          margin: 0,
        }}
      >
        {formatGamesNeeded(whoop.gamesNeeded ?? 5)}.
      </p>
    );
  }

  const change = formatScoreChange(whoop.previousScore, whoop.score);
  const tier = whoop.tier ?? tierForScore(whoop.score);
  const ink = tierUp ? RAW.warmBlack : COLORS.ink;

  return (
    <div
      data-testid="result-score"
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
      <span style={{ ...textStyle("label", mobile), color: tierUp ? RAW.warmBlack : COLORS.inkMuted }}>
        Your Whoop Score
      </span>
      <span data-testid="result-score-value" style={{ ...textStyle("display", mobile), color: ink }}>
        {change?.text ?? `${whoop.score}`}
      </span>
      <span style={{ ...textStyle("control", mobile), color: ink }}>{tierName(tier)}</span>
      {tierUp && (
        <span data-testid="result-tier-up" style={{ ...textStyle("captionItalic", mobile), color: RAW.warmBlack }}>
          New tier!
        </span>
      )}
    </div>
  );
};

export default WhoopScoreChange;
