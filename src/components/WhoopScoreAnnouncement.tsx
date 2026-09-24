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
  headline: "Introducing Tiers, Points, and more!",
  intro: "After over 40 Whoop! Whoop! Daily challenges, it’s time to get a bit more competitive. You can now track your accumulated points, gain milestone badges, and keep tabs on many other stats in Your Stats. Don’t worry, all of the Daily’s you have played so far have been accounted for. Go check it out, and brag a little.",
  bullets: [
    "Earn up to 5 points a day",
    "Climb all 5 tiers to become a Legend",
    "Show off your Milestone Badges",
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
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
        <ChaseHeadline text={SCORE_ANNOUNCEMENT.headline} mobile={mobile} role="hero" />
        <p style={{ ...textStyle("caption", mobile), margin: 0 }}>{SCORE_ANNOUNCEMENT.intro}</p>
      </div>
      <YouScoreTiles points={points} mobile={mobile} compact />
      <ul style={{ ...textStyle("body", mobile), margin: 0, paddingLeft: SPACE[8], listStyleType: "disc", display: "flex", flexDirection: "column", gap: SPACE[2] }}>
        {SCORE_ANNOUNCEMENT.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
      </ul>
    </ReleaseAnnouncement>
  );
};

export default WhoopScoreAnnouncement;