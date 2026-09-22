// ============================================================================
// YouPage — /you. The player's long-term self: the Whoop Whoop Score as a
// running points total, the tier ladder, how points are earned, badges, and
// their all-time numbers.
//
// This is not a game screen, so it may scroll: `DailyFrame` without `fill`,
// like the groups page. Everything else is the Daily's own shell — the pattern
// strips, the token helpers and night mode come free.
//
// Only the caller's own data is ever read. The page is not indexed.
// ============================================================================

import React from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import DailyFrame from "@/components/DailyFrame";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import DailyStatsBlock from "@/components/DailyStatsBlock";
import MotionReveal from "@/components/MotionReveal";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import { useDailyProfile } from "@/hooks/useDailyProfile";
import useDailyRecall from "@/hooks/useDailyRecall";
import { usePointsPopulation, useWhoopPointsState } from "@/hooks/useWhoopPoints";
import { getDailyNumber } from "@/lib/daily";
import {
  DECAY_PER_DAY,
  DECAY_PROTECTED_POINTS,
  GRACE_DAYS,
  POINT_FIRST_TRY_MAX,
  MAX_POINTS_PER_GAME,
} from "@/lib/whoopPoints";
import {
  SCORE_LABEL,
  TIER_LADDER,
  badgeArt,
  formatBadgeDate,
  formatPointsToNext,
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

/** How points are earned — the table, in the order a day happens. */
const EARN_ROWS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Played", value: "+1" },
  { label: `Each round solved on the first try (up to ${POINT_FIRST_TRY_MAX})`, value: "+1" },
  { label: "No peek", value: "+1" },
  { label: "Best possible day", value: `${MAX_POINTS_PER_GAME}` },
];

const FADE_LINE = `After ${GRACE_DAYS} days away you lose ${DECAY_PER_DAY} points a day, and your first ${DECAY_PROTECTED_POINTS} points never fade.`;

const YouPage: React.FC = () => {
  const mobile = useIsMobile();
  const location = useLocation();
  // Arrived from the results screen's "Your Stats" button: Back returns there,
  // and the Daily page reopens today's result directly.
  const backToResults =
    (location.state as { wwReturn?: string } | null)?.wwReturn === "results";
  const puzzleNumber = React.useMemo(() => getDailyNumber(), []);
  const { stats } = useDailyProfile(puzzleNumber);
  const recall = useDailyRecall();
  const { points, loading } = useWhoopPointsState();
  const pop = usePointsPopulation();

  const myTier = points?.tier ?? null;
  const myShare = pop && myTier ? pop.tiers.find((t) => t.tier === myTier) : null;
  const droppedTier = points !== null && points.highestTierEver !== points.tier;
  const isLegend = myTier === "legend";
  const highestIdx = points
    ? TIER_LADDER.findIndex((t) => t.tier === points.highestTierEver)
    : -1;

  /** Only badges with art render. No placeholders, nothing unfinished. */
  const shownBadges = (points?.badges ?? []).filter((b) => badgeArt(b.key) !== null);

  const sectionLabel = (text: string) => (
    <h2 style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>{text}</h2>
  );

  const panel: React.CSSProperties = {
    boxSizing: "border-box",
    border: BORDER.heavy,
    borderRadius: RADIUS.sm,
    background: COLORS.panel,
  };

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
        <MotionReveal index={0} style={{ alignSelf: "flex-start" }}><Link
          to="/"
          state={backToResults ? { wwOpenResult: true } : undefined}
          className="ww-press"
          style={{ ...buttonStyle("ink", "md", { mobile }), alignSelf: "flex-start" }}
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          Back
        </Link></MotionReveal>

        <MotionReveal index={1}><h1 style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>You</h1></MotionReveal>

        {/* 1 — the total, and the tier it sits in. */}
        {loading ? null : points === null ? (
          <p
            data-testid="you-score-error"
            style={{ ...textStyle("body", mobile), color: COLORS.inkMuted, margin: 0 }}
          >
            {SCORE_LABEL} could not be loaded. Try again in a moment.
          </p>
        ) : (
          <>
            <MotionReveal index={2}><div
              data-testid="you-score"
              style={{
                ...panel,
                alignSelf: "stretch",
                padding: SPACE[8],
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: SPACE[2],
              }}
            >
              {sectionLabel(SCORE_LABEL)}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: SPACE[6],
                  minWidth: 0,
                }}
              >
                <CurrentTierBadge tier={points.tier} size={mobile ? 72 : 88} testId="you-tier-badge" />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: SPACE[1],
                    minWidth: 0,
                  }}
                >
                  <span style={{ ...textStyle("resultHero", mobile), color: COLORS.ink }}>
                    {points.total}
                  </span>
                  <span
                    data-testid="you-tier"
                    style={{ ...textStyle("subhead", mobile), color: COLORS.ink, textAlign: "center" }}
                  >
                    {droppedTier
                      ? `${tierName(points.tier)} \u00b7 Highest: ${tierName(points.highestTierEver)}`
                      : tierName(points.tier)}
                  </span>
                </div>
              </div>
            </div></MotionReveal>

            {/* 2 — two contained stats, the number leading. */}
            <MotionReveal index={3}><div
              data-testid="you-stats"
              style={{ alignSelf: "stretch", display: "flex", gap: SPACE[4] }}
            >
              {myShare && myTier && (
                <div
                  data-testid="you-tier-share"
                  style={{
                    ...panel,
                    flex: 1,
                    padding: `${SPACE[5]}px ${SPACE[5]}px`,
                    display: "flex",
                    flexDirection: "column",
                    gap: SPACE[1],
                  }}
                >
                  <span style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>
                    {Math.round(myShare.share * 100)}%
                  </span>
                  <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
                    of players are {tierName(myTier)}
                  </span>
                </div>
              )}
              <div
                data-testid="you-next-tier"
                style={{
                  ...panel,
                  flex: 1,
                  padding: `${SPACE[5]}px ${SPACE[5]}px`,
                  display: "flex",
                  flexDirection: "column",
                  gap: SPACE[1],
                }}
              >
                <span style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>
                  {isLegend || points.pointsToNextTier === null
                    ? points.peakTotal
                    : points.pointsToNextTier}
                </span>
                <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
                  {isLegend || points.pointsToNextTier === null || points.nextTierThreshold === null
                    ? "your highest ever total"
                    : `points to ${tierName(
                        TIER_LADDER.find((t) => t.floor === points.nextTierThreshold)?.tier ?? null
                      )}`}
                </span>
              </div>
            </div></MotionReveal>

            {/* 3 — the ladder, with your rung marked. */}
            <MotionReveal index={4}><div
              data-testid="you-ladder"
              style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SPACE[4] }}
            >
              {sectionLabel("Tiers")}
              {TIER_LADDER.map((t, i) => {
                const here = t.tier === points.tier;
                const highest = droppedTier && i === highestIdx;
                return (
                  <MotionReveal kind="list" index={i}
                    key={t.tier}
                    data-testid="you-ladder-row"
                    data-here={here ? "1" : undefined}
                    data-highest={highest ? "1" : undefined}
                    style={{
                      ...panel,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: SPACE[4],
                      background: here ? COLORS.orange : COLORS.panel,
                      padding: `${SPACE[4]}px ${SPACE[6]}px`,
                    }}
                  >
                    <span
                      style={{
                        ...textStyle("control", mobile),
                        color: here ? RAW.warmBlack : COLORS.ink,
                      }}
                    >
                      {t.name}
                      {highest ? " \u00b7 Highest" : ""}
                    </span>
                    <span
                      style={{
                        ...textStyle("caption", mobile),
                        color: here ? RAW.warmBlack : COLORS.inkMuted,
                      }}
                    >
                      {tierRange(t.tier)}
                    </span>
                  </MotionReveal>
                );
              })}
            </div></MotionReveal>

            {/* 4 — how points are earned, and how they fade. */}
            <MotionReveal index={5}><div
              data-testid="you-earning"
              style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SPACE[4] }}
            >
              {sectionLabel("How you earn points")}
              <div style={{ ...panel, padding: `${SPACE[2]}px ${SPACE[6]}px` }}>
                {EARN_ROWS.map((row, i) => (
                  <MotionReveal kind="list" index={i}
                    key={row.label}
                    data-testid="you-earn-row"
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: SPACE[4],
                      paddingTop: SPACE[4],
                      paddingBottom: SPACE[4],
                      ...(i === 0
                        ? null
                        : { borderTop: "1px solid rgba(35, 31, 32, 0.18)" }),
                    }}
                  >
                    <span style={{ ...textStyle("body", mobile), color: COLORS.ink }}>
                      {row.label}
                    </span>
                    <span style={{ ...textStyle("control", mobile), color: COLORS.ink }}>
                      {row.value}
                    </span>
                  </MotionReveal>
                ))}
              </div>
              <p style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>
                {FADE_LINE}
              </p>
            </div></MotionReveal>

            {/* 5 — badges. Only art that exists is ever shown. */}
            {shownBadges.length > 0 && (
              <MotionReveal index={6}><div
                data-testid="you-badges"
                style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SPACE[4] }}
              >
                {sectionLabel("Badges")}
                <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE[6] }}>
                  {shownBadges.map((b, i) => (
                    <MotionReveal kind="small" index={i}
                      key={b.key}
                      data-testid="you-badge"
                      data-badge={b.key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: SPACE[2],
                        width: 96,
                      }}
                    >
                      <img
                        src={badgeArt(b.key) as string}
                        alt={tierName(b.key as never) || b.key}
                        width={72}
                        height={72}
                        style={{ display: "block" }}
                      />
                      <span
                        style={{
                          ...textStyle("caption", mobile),
                          color: COLORS.ink,
                          textAlign: "center",
                        }}
                      >
                        {tierName(b.key as never) || b.key}
                      </span>
                      <span
                        style={{
                          ...textStyle("caption", mobile),
                          color: COLORS.inkMuted,
                          textAlign: "center",
                        }}
                      >
                        {formatBadgeDate(b.earnedOn)}
                      </span>
                    </MotionReveal>
                  ))}
                </div>
              </div></MotionReveal>
            )}
          </>
        )}

        {/* 6 — moved here from the results screen. */}
        <MotionReveal index={7}><DailyStatsBlock stats={stats} recall={recall} mobile={mobile} /></MotionReveal>

        {/* 7 — groups. */}
        <MotionReveal index={8}><Link
          to="/groups"
          className="ww-press"
          data-testid="you-groups-link"
          style={{ ...buttonStyle("secondary", "lg", { mobile }), width: "100%" }}
        >
          Your Groups
        </Link></MotionReveal>
      </div>

      <DailyLegalFooter />
    </DailyFrame>
  );
};

export default YouPage;
