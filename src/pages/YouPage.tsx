// ============================================================================
// YouPage — /you. The player's long-term self: the Whoop Score, the tier
// ladder, the three parts that make the score, and their all-time numbers.
//
// This is not a game screen, so it may scroll: `DailyFrame` without `fill`,
// like the groups page. Everything else is the Daily's own shell — the pattern
// strips, the token helpers and night mode come free.
//
// Only the caller's own data is ever read. The page is not indexed.
// ============================================================================

import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import DailyFrame from "@/components/DailyFrame";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import DailyStatsBlock from "@/components/DailyStatsBlock";
import { useDailyProfile } from "@/hooks/useDailyProfile";
import useDailyRecall from "@/hooks/useDailyRecall";
import { useTierDistribution, useWhoopScore } from "@/hooks/useWhoopScore";
import { getDailyNumber } from "@/lib/daily";
import { tierForScore } from "@/lib/whoopScore";
import {
  TIER_LADDER,
  formatGamesNeeded,
  formatPercentileBand,
  formatRate,
  formatTierShare,
  tierName,
  tierRange,
} from "@/lib/whoopTiers";
import {
  BORDER,
  COLORS,
  RADIUS,
  RAW,
  SPACE,
  buttonStyle,
  textStyle,
} from "@/lib/tokens";

/** The three parts, each with the one line that makes its number readable. */
const PART_COPY: ReadonlyArray<{ label: string; help: string }> = [
  { label: "No-peek rate", help: "How often you finish without peeking." },
  { label: "Clean-run rate", help: "How often you finish a day with no mistakes." },
  { label: "Consistency", help: "Days you showed up in the last 30." },
];

const YouPage: React.FC = () => {
  const mobile = useIsMobile();
  const puzzleNumber = React.useMemo(() => getDailyNumber(), []);
  const { stats } = useDailyProfile(puzzleNumber);
  const recall = useDailyRecall();
  const whoop = useWhoopScore();
  const dist = useTierDistribution();

  const hasScore = whoop !== null && whoop.score !== null;
  const myTier = hasScore ? (whoop!.tier ?? tierForScore(whoop!.score!)) : null;
  const myShare = dist && myTier ? dist.tiers.find((t) => t.tier === myTier) : null;

  const sectionLabel = (text: string) => (
    <h2 style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>{text}</h2>
  );

  return (
    <DailyFrame gap={SPACE[6]}>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: SPACE[10],
        }}
      >
        <Link
          to="/"
          className="ww-press"
          style={{ ...buttonStyle("ink", "md", { mobile }), alignSelf: "flex-start" }}
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          Back
        </Link>

        <h1 style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>You</h1>

        {/* 1 — the score itself, and the tier it sits in. */}
        {hasScore ? (
          <div
            data-testid="you-score"
            style={{
              alignSelf: "stretch",
              border: BORDER.heavy,
              borderRadius: RADIUS.sm,
              background: COLORS.panel,
              padding: SPACE[8],
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: SPACE[2],
            }}
          >
            {sectionLabel("Your Whoop Score")}
            <span style={{ ...textStyle("resultHero", mobile), color: COLORS.ink }}>
              {whoop!.score}
            </span>
            <span style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>
              {tierName(myTier)}
            </span>
          </div>
        ) : (
          <p
            data-testid="you-locked"
            style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}
          >
            {formatGamesNeeded(whoop?.gamesNeeded ?? 5)}.
          </p>
        )}

        {hasScore && (
          <>
            {/* 2 — the ladder, with your rung marked and the climb named. */}
            <div
              data-testid="you-ladder"
              style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SPACE[4] }}
            >
              {sectionLabel("Tiers")}
              {TIER_LADDER.map((t) => {
                const here = t.tier === myTier;
                return (
                  <div
                    key={t.tier}
                    data-testid="you-ladder-row"
                    data-here={here ? "1" : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: SPACE[4],
                      border: BORDER.heavy,
                      borderRadius: RADIUS.sm,
                      background: here ? COLORS.orange : COLORS.panel,
                      padding: `${SPACE[4]}px ${SPACE[6]}px`,
                    }}
                  >
                    <span
                      style={{
                        ...textStyle("control", mobile),
                        color: here ? "#231f20" : COLORS.ink,
                      }}
                    >
                      {t.name}
                    </span>
                    <span
                      style={{
                        ...textStyle("caption", mobile),
                        color: here ? "#231f20" : COLORS.inkMuted,
                      }}
                    >
                      {tierRange(t.tier)}
                    </span>
                  </div>
                );
              })}
              {whoop!.pointsToNext !== null && whoop!.nextTierThreshold !== null && (
                <p
                  data-testid="you-points-to-next"
                  style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}
                >
                  {whoop!.pointsToNext} more{" "}
                  {whoop!.pointsToNext === 1 ? "point" : "points"} to{" "}
                  {tierName(tierForScore(whoop!.nextTierThreshold!))}.
                </p>
              )}
            </div>

            {/* 3 — the three parts, as the player's own rates. */}
            <div
              data-testid="you-parts"
              style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SPACE[4] }}
            >
              {sectionLabel("What makes your score")}
              {[whoop!.noPeekRate, whoop!.zeroMistakeRate, whoop!.consistencyRate].map(
                (rate, i) => (
                  <div
                    key={PART_COPY[i].label}
                    data-testid="you-part"
                    style={{
                      border: BORDER.heavy,
                      borderRadius: RADIUS.sm,
                      background: COLORS.panel,
                      padding: `${SPACE[5]}px ${SPACE[6]}px`,
                      display: "flex",
                      flexDirection: "column",
                      gap: SPACE[1],
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: SPACE[4],
                      }}
                    >
                      <span style={{ ...textStyle("control", mobile), color: COLORS.ink }}>
                        {PART_COPY[i].label}
                      </span>
                      <span style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>
                        {formatRate(rate)}
                      </span>
                    </div>
                    <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
                      {PART_COPY[i].help}
                    </span>
                  </div>
                )
              )}
            </div>

            {/* 4 — the band, and nothing at all in its place when withheld. */}
            {whoop!.percentileBand !== null && (
              <p
                data-testid="you-percentile"
                style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}
              >
                {formatPercentileBand(whoop!.percentileBand!)}
              </p>
            )}

            {/* 5 — how crowded your own tier is. */}
            {myShare && myTier && (
              <p
                data-testid="you-tier-share"
                style={{ ...textStyle("body", mobile), color: COLORS.inkMuted, margin: 0 }}
              >
                {formatTierShare(myShare.share, myTier)}
              </p>
            )}
          </>
        )}

        {/* 6 — moved here from the results screen. */}
        <DailyStatsBlock stats={stats} recall={recall} mobile={mobile} />

        {/* 7 — groups. */}
        <Link
          to="/groups"
          className="ww-press"
          data-testid="you-groups-link"
          style={{ ...buttonStyle("secondary", "lg", { mobile }), alignSelf: "stretch" }}
        >
          Your Groups
        </Link>
      </div>

      <DailyLegalFooter />
    </DailyFrame>
  );
};

export default YouPage;
