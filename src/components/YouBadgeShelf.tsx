import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AppButton } from "@/components/ui/AppButton";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import type { EarnedBadge, PointsTier } from "@/lib/whoopPoints";
import { POINTS_TIER_FLOORS } from "@/lib/whoopPoints";
import { badgeArt, formatBadgeDate, tierName } from "@/lib/whoopTiers";
import { BORDER, COLORS, FONT_SIZE, RADIUS, SPACE, TOUCH_MIN, textStyle } from "@/lib/tokens";

const unlockCriteria = (key: string): string => {
  const tier = POINTS_TIER_FLOORS.find((row) => row.tier === key);
  if (!tier) return "Earned through Daily play.";
  return tier.floor === 0 ? "Play your first Daily game." : `Reach ${tier.floor} total points.`;
};

/** Native horizontal scrolling supports touch swipes; arrows are just a second way to page. */
const YouBadgeShelf: React.FC<{ badges: EarnedBadge[]; mobile: boolean }> = ({ badges, mobile }) => {
  const track = React.useRef<HTMLDivElement>(null);
  const previousArrow = React.useRef<HTMLButtonElement>(null);
  const nextArrow = React.useRef<HTMLButtonElement>(null);
  const [edges, setEdges] = React.useState({ left: false, right: false });
   const canPage = badges.length > 3;
   const measure = React.useCallback(() => {
    const el = track.current;
    if (!el) return;
    const left = canPage && el.scrollLeft > SPACE[1];
    const right = canPage && el.scrollLeft + el.clientWidth < el.scrollWidth - SPACE[1];
    // A paging arrow can vanish at the end of the track. Keep keyboard focus in
    // the shelf instead of dropping it to the document when that happens.
    if ((!left && document.activeElement === previousArrow.current) ||
        (!right && document.activeElement === nextArrow.current)) el.focus({ preventScroll: true });
    setEdges({ left, right });
   }, [canPage]);

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
    const el = track.current;
    if (!el || !canPage) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  const onTrackKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !canPage) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      page(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      track.current?.scrollTo({ left: event.key === "Home" ? 0 : track.current.scrollWidth, behavior: "instant" });
    }
  };

  const arrow = (direction: -1 | 1) => (
    <AppButton
      ref={direction < 0 ? previousArrow : nextArrow}
      type="button"
      aria-label={direction < 0 ? "Previous badges" : "Next badges"}
      title={direction < 0 ? "Previous badges" : "Next badges"}
      onClick={() => page(direction)}
      roleStyle="utility"
      style={{
        position: "absolute", zIndex: 1, bottom: SPACE[4], padding: 0,
        [direction < 0 ? "left" : "right"]: SPACE[2],
        width: TOUCH_MIN, height: TOUCH_MIN, border: BORDER.heavy, borderRadius: RADIUS.sm,
        background: COLORS.surface, color: COLORS.ink, display: "grid", placeItems: "center",
      }}
    >
      <svg width={SPACE[8]} height={SPACE[8]} viewBox="0 0 16 16" aria-hidden="true">
        <path fill="currentColor" d={direction < 0 ? "M3 8 13 2v12z" : "m13 8-10 6V2z"} />
      </svg>
    </AppButton>
  );

  return (
    <div data-testid="you-badges" style={{ position: "relative", minWidth: 0, background: COLORS.panel, border: BORDER.heavy, borderRadius: RADIUS.md }}>
      {edges.left && arrow(-1)}
      <div
        ref={track}
        onScroll={measure}
        aria-label={canPage ? "Earned badges, use Left and Right Arrow keys to page" : "Earned badges"}
        role="region"
        tabIndex={0}
        onKeyDown={onTrackKeyDown}
        className="ww-you-badge-track"
        style={{ display: "flex", justifyContent: "safe center", overflowX: canPage ? "auto" : "hidden", overscrollBehaviorInline: "contain", scrollSnapType: canPage ? "x mandatory" : "none", scrollPaddingInline: canPage ? TOUCH_MIN + SPACE[4] : SPACE[8], padding: `${SPACE[8]}px ${canPage ? TOUCH_MIN + SPACE[4] : SPACE[8]}px`, minWidth: 0 }}
      >
        {badges.map((badge, i) => (
          <div
            key={`${badge.key}-${badge.earnedOn}-${i}`}
            data-testid="you-badge"
            data-badge={badge.key}
            style={{
               boxSizing: "border-box", flex: canPage ? `0 0 calc(100% / 3)` : "1 1 0%",
              minWidth: 0, padding: SPACE[4], scrollSnapAlign: canPage ? "start" : undefined,
              borderRight: i < badges.length - 1 ? `1px solid ${COLORS.inkMuted}` : undefined,
            }}
          >
             <DialogPrimitive.Root>
               <DialogPrimitive.Trigger asChild>
                 <AppButton
                   type="button"
                    roleStyle="quiet"
                   aria-label={`View ${tierName(badge.key as PointsTier) || badge.key} badge details, earned ${formatBadgeDate(badge.earnedOn)}`}
                   className="ww-you-badge-trigger"
                    hoverBackground={COLORS.badgeHover}
                    style={{ boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", minHeight: TOUCH_MIN, minWidth: 0, padding: SPACE[2], border: 0, borderRadius: RADIUS.sm, background: "transparent", color: COLORS.inkMuted, fontStyle: "normal", whiteSpace: "normal" }}
                 >
                   <span aria-hidden="true" style={{ width: "100%", maxWidth: FONT_SIZE["7xl"], aspectRatio: "1", display: "grid", placeItems: "center" }}>
                     {badgeArt(badge.key) ? (
                       <CurrentTierBadge tier={badge.key as PointsTier} size={FONT_SIZE["7xl"]} fluid />
                     ) : (
                       <span style={{ width: "75%", aspectRatio: "1", borderRadius: "50%", background: COLORS.inkMuted }} />
                     )}
                   </span>
                 </AppButton>
               </DialogPrimitive.Trigger>
               <DialogPrimitive.Portal>
                 <DialogPrimitive.Overlay className="ww-ui-modal-backdrop" style={{ position: "fixed", inset: 0, zIndex: 1000, background: `color-mix(in srgb, ${COLORS.ink} 65%, transparent)` }} />
                 <DialogPrimitive.Content
                   data-testid="you-badge-detail"
                    className="ww-ui-revisit ww-you-badge-detail"
                   style={{ position: "fixed", zIndex: 1001, top: "50%", left: "50%", transform: "translate(-50%, -50%)", boxSizing: "border-box", width: `calc(100% - ${SPACE[12] * 2}px)`, maxWidth: FONT_SIZE["8xl"] * 3, maxHeight: "calc(100dvh - 48px)", overflowY: "auto", background: COLORS.surface, color: COLORS.ink, border: BORDER.heavy, borderRadius: RADIUS.md, padding: SPACE[8], display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE[8], textAlign: "center" }}
                 >
                   <DialogPrimitive.Title style={{ ...textStyle("title", mobile), margin: 0 }}>{tierName(badge.key as PointsTier) || badge.key}</DialogPrimitive.Title>
                    <span aria-hidden="true" className="ww-you-badge-flip-host" style={{ width: "100%", maxWidth: FONT_SIZE["7xl"] * 1.5, aspectRatio: "1", display: "grid", placeItems: "center" }}>
                      {badgeArt(badge.key) ? <CurrentTierBadge tier={badge.key as PointsTier} size={FONT_SIZE["7xl"] * 1.5} fluid /> : <span className="ww-ui-small-in" style={{ width: "75%", aspectRatio: "1", borderRadius: "50%", background: COLORS.inkMuted }} />}
                   </span>
                   <DialogPrimitive.Description asChild>
                     <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4], ...textStyle("body", mobile), color: COLORS.ink }}>
                       <span>Earned {formatBadgeDate(badge.earnedOn)}</span>
                       <span>{unlockCriteria(badge.key)}</span>
                     </div>
                   </DialogPrimitive.Description>
                   <DialogPrimitive.Close asChild>
                      <AppButton type="button" roleStyle="utility" aria-label="Close badge details" style={{ minHeight: TOUCH_MIN, paddingInline: SPACE[8] }}>Close</AppButton>
                   </DialogPrimitive.Close>
                 </DialogPrimitive.Content>
               </DialogPrimitive.Portal>
             </DialogPrimitive.Root>
          </div>
        ))}
      </div>
      {edges.right && arrow(1)}
    </div>
  );
};

export default YouBadgeShelf;