import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Lock, X } from "lucide-react";
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
          roleStyle="quiet"
          size="sm"
          data-testid="all-badges-trigger"
          style={{
            position: "relative",
            alignSelf: "center",
            minHeight: SPACE[16],
            padding: `${SPACE[1]}px ${SPACE[2]}px`,
            border: 0,
            background: "transparent",
            color: COLORS.inkMuted,
            fontSize: FONT_SIZE.xs,
            textDecoration: "underline",
            textUnderlineOffset: SPACE[1],
          }}
        >
          See All Badges
          <span aria-hidden="true" style={{ position: "absolute", inset: `-${SPACE[3]}px 0` }} />
        </AppButton>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ww-ui-modal-backdrop" style={{ position: "fixed", inset: 0, zIndex: 1000, background: `color-mix(in srgb, ${COLORS.ink} 65%, transparent)` }} />
        <DialogPrimitive.Content
          data-testid="all-badges"
          className="ww-ui-revisit"
          style={{
            position: "fixed",
            zIndex: 1001,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            boxSizing: "border-box",
            width: `calc(100% - ${SPACE[8] * 2}px)`,
            maxWidth: FONT_SIZE["8xl"] * 6,
            maxHeight: "calc(100dvh - 48px)",
            overflow: "hidden",
            background: COLORS.surface,
            color: COLORS.ink,
            border: BORDER.heavy,
            borderRadius: RADIUS.md,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <header
            style={{
              position: "relative",
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: SPACE[1],
              padding: `${SPACE[6]}px ${SPACE[16] + TOUCH_MIN}px ${SPACE[5]}px ${SPACE[6]}px`,
              borderBottom: `1px solid ${COLORS.inkMuted}`,
              background: COLORS.surface,
            }}
          >
            <DialogPrimitive.Title style={{ ...textStyle("title", mobile), margin: 0 }}>All Badges</DialogPrimitive.Title>
            <DialogPrimitive.Description style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>
              {count} of {total} earned
            </DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <AppButton
                type="button"
                roleStyle="quiet"
                aria-label="Close all badges"
                title="Close all badges"
                hoverBackground={COLORS.panelMuted}
                style={{
                  position: "absolute",
                  top: SPACE[4],
                  right: SPACE[4],
                  display: "grid",
                  placeItems: "center",
                  width: TOUCH_MIN,
                  height: TOUCH_MIN,
                  minHeight: TOUCH_MIN,
                  padding: 0,
                  border: 0,
                  borderRadius: RADIUS.sm,
                  background: "transparent",
                  color: COLORS.inkMuted,
                }}
              >
                <X size={SPACE[10]} strokeWidth={2} aria-hidden="true" />
              </AppButton>
            </DialogPrimitive.Close>
          </header>

          <div
            data-testid="all-badges-scroll"
            style={{
              minHeight: 0,
              overflowY: "auto",
              overscrollBehavior: "contain",
              padding: SPACE[6],
              display: "flex",
              flexDirection: "column",
              gap: SPACE[6],
            }}
          >
            {groups.map((group, groupIndex) => (
              <section
                key={group.title}
                aria-label={group.title}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: SPACE[4],
                  paddingTop: groupIndex > 0 ? SPACE[6] : 0,
                  borderTop: groupIndex > 0 ? `1px solid ${COLORS.inkMuted}` : undefined,
                }}
              >
                <h3 style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>{group.title}</h3>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gridTemplateColumns: mobile ? "repeat(2, minmax(0, 1fr))" : `repeat(auto-fill, minmax(${FONT_SIZE["7xl"] * 2}px, 1fr))`,
                    gap: SPACE[4],
                  }}
                >
                  {group.keys.map((key) => {
                    const date = earnedOn.get(key);
                    const got = date !== undefined;
                    return (
                      <li
                        key={key}
                        data-testid="all-badges-item"
                        data-badge={key}
                        data-earned={got ? "true" : "false"}
                        style={{
                          boxSizing: "border-box",
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: SPACE[3],
                          textAlign: "center",
                          minWidth: 0,
                          padding: SPACE[4],
                          background: got ? COLORS.surface : COLORS.panel,
                          border: got ? BORDER.standard : `1px solid ${COLORS.inkMuted}`,
                          borderRadius: RADIUS.sm,
                        }}
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
                              style={{ boxSizing: "border-box", width: "88%", aspectRatio: "1", borderRadius: "50%", background: COLORS.panelMuted, border: `2px dashed ${COLORS.inkMuted}`, display: "grid", placeItems: "center", color: COLORS.inkMuted }}
                            >
                              <Lock size={SPACE[8]} strokeWidth={2} />
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
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default AllBadgesDialog;
