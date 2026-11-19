import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Lock } from "lucide-react";
import { AppButton } from "@/components/ui/AppButton";
import CurrentTierBadge from "@/components/CurrentTierBadge";
import Daily100Badge from "@/components/Daily100Badge";
import { badgeCriteria, badgeGroups, badgeName } from "@/lib/badgeCatalog";
import { isKeepsakeBadge } from "@/lib/daily100";
import type { EarnedBadge } from "@/lib/whoopPoints";
import { badgeArt, formatBadgeDate } from "@/lib/whoopTiers";
import { BORDER, COLORS, FONT_SIZE, RADIUS, SPACE, TOUCH_MIN, textStyle } from "@/lib/tokens";

/**
 * Every badge in one simple grid. Earned badges show their art and date; locked
 * badges show only a plain disc, the name and how to earn them, so the art stays
 * a surprise until it is earned.
 */
const AllBadgesDialog: React.FC<{ earned: EarnedBadge[]; mobile: boolean }> = ({ earned, mobile }) => {
  const earnedOn = new Map(earned.map((b) => [b.key, b.earnedOn]));
  const groups = badgeGroups(earnedOn.has("daily-100"));
  const total = groups.reduce((sum, g) => sum + g.keys.length, 0);
  const count = groups.reduce((sum, g) => sum + g.keys.filter((k) => earnedOn.has(k)).length, 0);
  const art = Math.round(FONT_SIZE["6xl"]);

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <AppButton
          type="button"
          roleStyle="secondary"
          data-testid="all-badges-trigger"
          style={{ alignSelf: "center", minHeight: TOUCH_MIN, paddingInline: SPACE[8] }}
        >
          See All Badges
        </AppButton>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ww-ui-modal-backdrop" style={{ position: "fixed", inset: 0, zIndex: 1000, background: `color-mix(in srgb, ${COLORS.ink} 65%, transparent)` }} />
        <DialogPrimitive.Content
          data-testid="all-badges"
          className="ww-ui-revisit"
          style={{ position: "fixed", zIndex: 1001, top: "50%", left: "50%", transform: "translate(-50%, -50%)", boxSizing: "border-box", width: `calc(100% - ${SPACE[8] * 2}px)`, maxWidth: FONT_SIZE["8xl"] * 6, maxHeight: "calc(100dvh - 48px)", overflowY: "auto", background: COLORS.surface, color: COLORS.ink, border: BORDER.heavy, borderRadius: RADIUS.md, padding: SPACE[8], display: "flex", flexDirection: "column", gap: SPACE[12] }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE[2], textAlign: "center" }}>
            <DialogPrimitive.Title style={{ ...textStyle("title", mobile), margin: 0 }}>All Badges</DialogPrimitive.Title>
            <DialogPrimitive.Description style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>
              {count} of {total} earned
            </DialogPrimitive.Description>
          </div>

          {groups.map((group) => (
            <section key={group.title} aria-label={group.title} style={{ display: "flex", flexDirection: "column", gap: SPACE[6] }}>
              <h3 style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>{group.title}</h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${mobile ? 96 : 120}px, 1fr))`, gap: SPACE[6] }}>
                {group.keys.map((key) => {
                  const date = earnedOn.get(key);
                  const got = date !== undefined;
                  return (
                    <li
                      key={key}
                      data-testid="all-badges-item"
                      data-badge={key}
                      data-earned={got ? "true" : "false"}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE[3], textAlign: "center", minWidth: 0 }}
                    >
                      <span style={{ width: "100%", maxWidth: art, aspectRatio: "1", display: "grid", placeItems: "center" }}>
                        {got && isKeepsakeBadge(key) ? (
                          <Daily100Badge size={art} fluid />
                        ) : got && badgeArt(key) ? (
                          <CurrentTierBadge tier={key} size={art} fluid />
                        ) : (
                          <span
                            data-testid="all-badges-locked"
                            aria-hidden="true"
                            style={{ boxSizing: "border-box", width: "88%", aspectRatio: "1", borderRadius: "50%", background: COLORS.panel, border: `2px dashed ${COLORS.inkMuted}`, display: "grid", placeItems: "center", color: COLORS.inkMuted }}
                          >
                            <Lock size={SPACE[10]} strokeWidth={2} />
                          </span>
                        )}
                      </span>
                      <span style={{ ...textStyle("control", mobile), color: COLORS.ink }}>{badgeName(key)}</span>
                      <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>
                        {got ? `Earned ${formatBadgeDate(date as string)}` : badgeCriteria(key)}
                      </span>
                      {!got && <span className="sr-only">Locked</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <DialogPrimitive.Close asChild>
            <AppButton type="button" roleStyle="utility" aria-label="Close all badges" style={{ alignSelf: "center", minHeight: TOUCH_MIN, paddingInline: SPACE[8] }}>Close</AppButton>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default AllBadgesDialog;
