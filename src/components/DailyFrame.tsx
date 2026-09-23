import React from "react";
import DailyShapeRule from "@/components/DailyShapeRule";
import { COLORS } from "@/lib/tokens";

/** Max width of the content column shared by every daily screen. */
export const DAILY_CONTENT_MAX_W = 402;

/**
 * The single outer shell shared by the daily screens (ready, gameplay,
 * result): cream page, 24px padding, a shape rule top and bottom, and a
 * centred content column capped at 402px in between. Keeping this in one
 * place is what stops the screens drifting apart visually.
 */
const DailyFrame: React.FC<{
  /** Gap inside the content column. */
  gap?: number;
  /** Page edge padding. Shrinks on short viewports so the CTA stays in view. */
  pad?: number;
  /** Gap between the shape rules and the content column. */
  railGap?: number;
  /** When true the content column takes all the space between the rules and
   *  never grows past it, so children can size themselves to fit. */
  fill?: boolean;
  /** Page background tone. Gameplay uses `panel`; every other screen stays cream. */
  tone?: "surface" | "panel";
  /** Let editorial pages use two Daily content columns on large windows. */
  wide?: boolean;
  children?: React.ReactNode;
}> = ({ gap = 24, pad = 24, railGap = 24, fill = false, tone = "surface", wide = false, children }) => (
  <div
    style={{
      position: "relative",
      minHeight: "var(--ww-vh)",
      height: "var(--ww-vh)",
      boxSizing: "border-box",
      background: tone === "panel" ? COLORS.panel : COLORS.surface,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: "center",
      gap: railGap,
      padding: pad,
      paddingBottom: `calc(${pad}px + env(safe-area-inset-bottom))`,
      overflowY: fill ? "hidden" : "auto",
      "--daily-content-max-width": `${DAILY_CONTENT_MAX_W}px`,
      "--daily-content-padding-x": `${pad}px`,
    } as React.CSSProperties}
  >

    <DailyShapeRule />

    <div
      style={{
        width: "100%",
        maxWidth: wide ? DAILY_CONTENT_MAX_W * 2 : DAILY_CONTENT_MAX_W,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap,
        ...(fill ? { flex: "1 1 auto", minHeight: 0 } : {}),
      }}
    >

      {children}
    </div>

    <DailyShapeRule />
  </div>
);

export default DailyFrame;
