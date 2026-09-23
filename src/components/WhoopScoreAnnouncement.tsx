import React from "react";
import { useNavigate } from "react-router-dom";
import YouScoreTiles from "@/components/YouScoreTiles";
import ReleaseAnnouncement, { hasSeenAnnouncement } from "@/components/ReleaseAnnouncement";
import { useIsMobile } from "@/hooks/use-mobile";
import { trackDaily } from "@/lib/dailyEvents";
import type { WhoopPoints } from "@/lib/whoopPoints";
import type { StoredDailyResult } from "@/lib/dailyResults";
import { SPACE, textStyle } from "@/lib/tokens";

/** New releases use a new key; copy and version stay together here. */
export const SCORE_ANNOUNCEMENT = {
  version: "score_v1",
  seenKey: "ww_announce_score_v1",
  headline: "Your games now add up.",
  intro: "These points come from the games you've already played.",
  bullets: [
    "Earn up to 5 points a day. Play, nail rounds on the first try, and skip the peek.",
    "Climb five tiers, from Rookie to Whoop Whoop Legend.",
    "Earn badges you keep forever.",
  ],
  primary: "See Your Stats",
  secondary: "Got it",
} as const;

export function hasSeenScoreAnnouncement(): boolean {
  return hasSeenAnnouncement(SCORE_ANNOUNCEMENT.seenKey);
}

/** Require the persisted result for today and a distinct earlier puzzle date. */
export function hasEarlierDailyResult(rows: StoredDailyResult[], today: string): boolean {
  return rows.some((row) => row.puzzle_date === today) && rows.some((row) => row.puzzle_date < today);
}

export function isReturningScorePlayer(points: WhoopPoints | null, saved: boolean, hasEarlierResult: boolean): boolean {
  return saved && points !== null && hasEarlierResult;
}

/** Score-specific content and measured actions in the reusable release shell. */
const WhoopScoreAnnouncement: React.FC<{
  points: WhoopPoints;
  puzzleNumber: number;
  onClose: () => void;
}> = ({ points, puzzleNumber, onClose }) => {
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const close = (action: "primary" | "dismissed") => {
    trackDaily(action === "primary" ? "announcement_primary_tapped" : "announcement_dismissed", {
      puzzleNumber, props: { version: SCORE_ANNOUNCEMENT.version },
    });
    if (action === "primary") navigate("/you", { state: { wwReturn: "results" } });
    onClose();
  };
  return (
    <ReleaseAnnouncement
      seenKey={SCORE_ANNOUNCEMENT.seenKey}
      title={SCORE_ANNOUNCEMENT.headline}
      primaryLabel={SCORE_ANNOUNCEMENT.primary}
      secondaryLabel={SCORE_ANNOUNCEMENT.secondary}
      returnFocusSelector='[data-testid="results-done"]'
      testId="score-announcement"
      onPrimary={() => close("primary")}
      onDismiss={() => close("dismissed")}
    >
      <YouScoreTiles points={points} mobile={mobile} compact />
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
        <h2 style={{ ...textStyle("heading", mobile), margin: 0 }}>{SCORE_ANNOUNCEMENT.headline}</h2>
        <p style={{ ...textStyle("body", mobile), margin: 0 }}>{SCORE_ANNOUNCEMENT.intro}</p>
        <ul style={{ ...textStyle("body", mobile), margin: 0, paddingLeft: SPACE[8], display: "flex", flexDirection: "column", gap: SPACE[2] }}>
          {SCORE_ANNOUNCEMENT.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>
      </div>
    </ReleaseAnnouncement>
  );
};

export default WhoopScoreAnnouncement;