// The player's own long-term score. Presentation only; all scoring stays in the points RPC.
import React from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import DailyFrame from "@/components/DailyFrame";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import MotionReveal from "@/components/MotionReveal";
import YouBadgeShelf from "@/components/YouBadgeShelf";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePointsPopulation, useWhoopPointsState } from "@/hooks/useWhoopPoints";
import { fetchDailyStats, type DailyStats } from "@/lib/dailyResults";
import { DECAY_PER_DAY, DECAY_PROTECTED_POINTS, GRACE_DAYS, MAX_POINTS_PER_GAME, POINT_FIRST_TRY_MAX } from "@/lib/whoopPoints";
import { SCORE_LABEL, TIER_LADDER, badgeArt, tierName, tierRange } from "@/lib/whoopTiers";
import { BORDER, COLORS, FONT_SIZE, RADIUS, RAW, SPACE, TEXT, buttonStyle, textStyle } from "@/lib/tokens";

const EARN_ROWS = [
  { label: "Played", value: "+1" },
  { label: "Round Solved on First Try", value: `+1 to +${POINT_FIRST_TRY_MAX}` },
  { label: "No Peek", value: "+1" },
  { label: "Best Possible Day", value: `+${MAX_POINTS_PER_GAME}` },
] as const;

const sectionLabel = (label: string, mobile: boolean) => (
  <h2 style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>{label}</h2>
);

const YouPage: React.FC = () => {
  const mobile = useIsMobile();
  const location = useLocation();
  const backToResults = (location.state as { wwReturn?: string } | null)?.wwReturn === "results";
  const { points, loading } = useWhoopPointsState();
  const population = usePointsPopulation();
  const [stats, setStats] = React.useState<DailyStats | null>(null);
  React.useEffect(() => {
    let live = true;
    void fetchDailyStats().then((result) => { if (live) setStats(result); });
    return () => { live = false; };
  }, []);

  const tile: React.CSSProperties = {
    boxSizing: "border-box", minWidth: 0, border: BORDER.heavy,
    borderRadius: RADIUS.md, background: COLORS.panel,
  };
  const creamTile: React.CSSProperties = { ...tile, background: COLORS.surface };
  const section: React.CSSProperties = {
    width: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: SPACE[8],
  };
  const currentShare = points && population?.tiers.find((row) => row.tier === points.tier);
  const nextTier = points?.nextTierThreshold === null ? null :
    TIER_LADDER.find((row) => row.floor === points?.nextTierThreshold);
  const earnedKeys = new Set(points?.badges.map((badge) => badge.key) ?? []);

  return (
    <DailyFrame gap={SPACE[6]} wide>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div style={{ width: "100%", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "stretch", gap: SPACE[20] }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: SPACE[4] }}>
          <MotionReveal index={0} style={{ justifySelf: "start" }}>
            <Link to="/" state={backToResults ? { wwOpenResult: true } : undefined} className="ww-press" style={buttonStyle("ink", "md", { mobile })}>
              <ChevronLeft size={SPACE[8]} strokeWidth={2} aria-hidden="true" />Back
            </Link>
          </MotionReveal>
          <MotionReveal index={1}>
            <h1 style={{ ...textStyle("title", mobile), color: COLORS.ink, textAlign: "center", margin: 0 }}>Your Stats</h1>
          </MotionReveal>
          <span aria-hidden="true" />
        </div>

        {loading ? null : points === null ? (
          <p data-testid="you-score-error" style={{ ...textStyle("body", mobile), color: COLORS.inkMuted, margin: 0 }}>
            {SCORE_LABEL} could not be loaded. Try again in a moment.
          </p>
        ) : (
          <>
            <MotionReveal index={2} style={section}>
              <div data-testid="you-score" aria-label={SCORE_LABEL} style={{ width: "100%", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: SPACE[6] }}>
                <div style={{ ...tile, padding: SPACE[8], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", gap: SPACE[6] }}>
                  <span style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, alignSelf: "flex-start" }}>Your Tier</span>
                  <div style={{ width: "min(100%, 128px)", aspectRatio: "1", display: "grid", placeItems: "center" }}>
                    {badgeArt(points.tier) ? (
                      <CurrentTierBadge tier={points.tier} size={FONT_SIZE["8xl"]} fluid testId="you-tier-badge" />
                    ) : (
                      <span aria-hidden="true" style={{ width: "75%", aspectRatio: "1", borderRadius: "50%", background: COLORS.inkMuted }} />
                    )}
                  </div>
                  <span data-testid="you-tier" style={{ ...textStyle("title", mobile), color: COLORS.ink, textAlign: "center", overflowWrap: "anywhere" }}>{tierName(points.tier)}</span>
                </div>
                <div style={{ ...tile, padding: SPACE[8], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE[4], containerType: "inline-size" }}>
                  <span style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, alignSelf: "flex-start" }}>Total Score</span>
                  <span style={{ ...textStyle("scoreTotal", mobile), fontSize: `clamp(${TEXT.display.mobileSize}px, 26cqi, ${TEXT.scoreTotal.size}px)`, color: COLORS.ink, whiteSpace: "nowrap", maxWidth: "100%" }}>{points.total}</span>
                </div>
              </div>
              <div data-testid="you-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: SPACE[4] }}>
                {([
                  ["Days Played", points.gamesPlayed, COLORS.red],
                  ["Clean Runs", stats?.cleanRuns ?? "—", COLORS.blue],
                  ["Longest Streak", stats?.bestStreak ?? "—", COLORS.orangeStat],
                ] as const).map(([label, value, color]) => (
                  <div key={label} style={{ ...creamTile, borderColor: color, padding: SPACE[6], display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: SPACE[4], textAlign: "center" }}>
                    <span style={{ ...textStyle("display", mobile), color }}>{value}</span>
                    <span style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, overflowWrap: "anywhere" }}>{label}</span>
                  </div>
                ))}
              </div>
            </MotionReveal>

            <MotionReveal index={3} style={section}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE[4] }}>
                {sectionLabel("Tiers", mobile)}{sectionLabel("Points", mobile)}
              </div>
              <div data-testid="you-ladder" style={{ ...tile, padding: SPACE[4] }}>
                {TIER_LADDER.map((row, i) => {
                  const here = points.tier === row.tier;
                  const earned = earnedKeys.has(row.tier);
                  return (
                    <MotionReveal kind="list" index={i} key={row.tier}>
                      <div data-testid="you-ladder-row" data-here={here ? "1" : undefined} style={{
                        boxSizing: "border-box", minWidth: 0, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: SPACE[6],
                        padding: SPACE[4], borderRadius: RADIUS.sm,
                        background: here ? COLORS.blue : "transparent", color: here ? RAW.cream : earned ? COLORS.ink : COLORS.inkMuted,
                        opacity: !here && !earned ? 0.55 : 1,
                      }}>
                        <div style={{ width: FONT_SIZE["6xl"], height: FONT_SIZE["6xl"], display: "grid", placeItems: "center" }}>
                          {earned && badgeArt(row.tier) ? <CurrentTierBadge tier={row.tier} size={FONT_SIZE["6xl"]} fluid /> :
                            <span aria-hidden="true" style={{ width: "70%", aspectRatio: "1", borderRadius: "50%", background: here ? RAW.cream : COLORS.inkMuted }} />}
                        </div>
                        <span style={{ ...textStyle("control", mobile), color: "inherit", overflowWrap: "anywhere" }}>{row.name}</span>
                        <span style={{ ...textStyle("caption", mobile), color: "inherit", whiteSpace: "nowrap" }}>{tierRange(row.tier)}</span>
                      </div>
                    </MotionReveal>
                  );
                })}
              </div>
            </MotionReveal>

            {(currentShare || (nextTier && points.pointsToNextTier !== null)) && (
              <MotionReveal index={4} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: SPACE[4] }}>
                {currentShare && (
                  <div data-testid="you-tier-share" style={{ ...creamTile, padding: SPACE[8], ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
                    {Math.round(currentShare.share * 100)}% of players are in the {tierName(points.tier)} Tier
                  </div>
                )}
                {nextTier && points.pointsToNextTier !== null && (
                  <div data-testid="you-next-tier" style={{ ...creamTile, padding: SPACE[8], ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
                    {points.pointsToNextTier} {points.pointsToNextTier === 1 ? "point" : "points"} to {nextTier.name} Tier
                  </div>
                )}
              </MotionReveal>
            )}

            <MotionReveal index={5} style={section}>
              {sectionLabel("How You Earn Daily Points", mobile)}
              <div data-testid="you-earning" style={{ ...creamTile, overflow: "hidden" }}>
                {EARN_ROWS.map((row, i) => (
                  <MotionReveal kind="list" index={i} key={row.label}>
                    <div data-testid="you-earn-row" style={{
                      display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: SPACE[4],
                      padding: `${SPACE[6]}px ${SPACE[8]}px`,
                      background: i === EARN_ROWS.length - 1 ? COLORS.ink : "transparent",
                      color: i === EARN_ROWS.length - 1 ? COLORS.surface : COLORS.ink,
                      borderTop: i > 0 && i < EARN_ROWS.length - 1 ? `1px solid ${COLORS.inkMuted}` : undefined,
                    }}>
                      <span style={{ ...textStyle("control", mobile), color: "inherit" }}>{row.label}</span>
                      <span style={{ ...textStyle("control", mobile), color: "inherit", whiteSpace: "nowrap" }}>{row.value}</span>
                    </div>
                  </MotionReveal>
                ))}
              </div>
              <p style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>
                *After {GRACE_DAYS} days away, you lose {DECAY_PER_DAY} points per day from your total score. Your first {DECAY_PROTECTED_POINTS} points never fade.
              </p>
            </MotionReveal>

            {points.badges.length > 0 && (
              <MotionReveal index={6} style={section}>
                {sectionLabel("Your Badges", mobile)}
                <YouBadgeShelf badges={points.badges} mobile={mobile} />
              </MotionReveal>
            )}
          </>
        )}
      </div>
      <DailyLegalFooter />
    </DailyFrame>
  );
};

export default YouPage;
