import React from "react";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import type { EarnedBadge, PointsTier } from "@/lib/whoopPoints";
import { badgeArt, formatBadgeDate, tierName } from "@/lib/whoopTiers";
import { BORDER, COLORS, FONT_SIZE, RADIUS, SPACE, TOUCH_MIN, textStyle } from "@/lib/tokens";

/** Native horizontal scrolling supports touch swipes; arrows are just a second way to page. */
const YouBadgeShelf: React.FC<{ badges: EarnedBadge[]; mobile: boolean }> = ({ badges, mobile }) => {
  const track = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ left: false, right: false });
  const measure = React.useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > SPACE[1],
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - SPACE[1],
    });
  }, []);

  React.useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [badges, measure]);

  const page = (direction: -1 | 1) => {
    track.current?.scrollBy({ left: direction * track.current.clientWidth, behavior: "smooth" });
  };

  const arrow = (direction: -1 | 1) => (
    <button
      type="button"
      aria-label={direction < 0 ? "Previous badges" : "Next badges"}
      onClick={() => page(direction)}
      style={{
        position: "absolute", zIndex: 1, top: "50%", transform: "translateY(-50%)",
        [direction < 0 ? "left" : "right"]: SPACE[2],
        width: TOUCH_MIN, height: TOUCH_MIN, border: BORDER.heavy, borderRadius: RADIUS.sm,
        background: COLORS.panel, color: COLORS.ink, display: "grid", placeItems: "center", cursor: "pointer",
      }}
    >
      <svg width={SPACE[8]} height={SPACE[8]} viewBox="0 0 16 16" aria-hidden="true">
        <path fill="currentColor" d={direction < 0 ? "M3 8 13 2v12z" : "m13 8-10 6V2z"} />
      </svg>
    </button>
  );

  return (
    <div data-testid="you-badges" style={{ position: "relative", minWidth: 0, background: COLORS.panel, border: BORDER.heavy, borderRadius: RADIUS.md }}>
      {edges.left && arrow(-1)}
      <div
        ref={track}
        onScroll={measure}
        aria-label="Earned badges"
        style={{ display: "flex", overflowX: "auto", overscrollBehaviorInline: "contain", scrollSnapType: "x mandatory", padding: SPACE[8], minWidth: 0 }}
      >
        {badges.map((badge, i) => (
          <div
            key={`${badge.key}-${badge.earnedOn}-${i}`}
            data-testid="you-badge"
            data-badge={badge.key}
            style={{
              boxSizing: "border-box", flex: `0 0 ${mobile ? "42%" : "25%"}`,
              minWidth: 0, padding: SPACE[4], scrollSnapAlign: "start",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE[4],
              borderRight: i < badges.length - 1 ? `1px solid ${COLORS.inkMuted}` : undefined,
            }}
          >
            <div style={{ width: "100%", maxWidth: FONT_SIZE["7xl"], aspectRatio: "1", display: "grid", placeItems: "center" }}>
              {badgeArt(badge.key) ? (
                <CurrentTierBadge tier={badge.key as PointsTier} size={FONT_SIZE["7xl"]} fluid />
              ) : (
                <span aria-label={`${badge.key} badge`} style={{ width: "75%", aspectRatio: "1", borderRadius: "50%", background: COLORS.inkMuted }} />
              )}
            </div>
            <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, textAlign: "center" }}>
              {tierName(badge.key as PointsTier) || badge.key} · {formatBadgeDate(badge.earnedOn)}
            </span>
          </div>
        ))}
      </div>
      {edges.right && arrow(1)}
    </div>
  );
};

export default YouBadgeShelf;