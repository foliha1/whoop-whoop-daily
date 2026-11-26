// ============================================================================
// DailyStatusBar — the cream bar that sits on top of the Daily board, one card
// gap above the grid and exactly as wide as it. Shared by the live board and
// the Daily How to Play so both read the same.
//
//   [ exit ]   Round 1 of 3        [ Peek ]
//              Match the Shape
//                   ● ○
//
// Left and right slots are fixed 44px squares, so the centre column stays
// centred whether or not a slot is filled. The bar uses the card's own
// surface, corner radius and resting shadow, so it reads as part of the board.
// ============================================================================

import React from "react";
import AutoFitText from "@/components/AutoFitText";
import { HOME_CONTROL_SIZE } from "@/components/HomeControl";
import { CARD_SHADOW_REST_CSS } from "@/lib/cardLift";
import { COLORS, RADIUS, SPACE, buttonStyle, textStyle } from "@/lib/tokens";

export const STATUS_BAR_PAD_X = SPACE[6]; // 12
export const STATUS_BAR_PAD_Y = SPACE[4]; // 8
const CAPTION_LINE = 1.2;
const TITLE_LINE = 1.1;
const TITLE_TO_DOTS = SPACE[2]; // 4
export const STATUS_BAR_DOT = SPACE[4]; // 8

/** Rendered height of the bar, for the board's height budget. */
export const STATUS_BAR_H = Math.ceil(
  Math.max(
    HOME_CONTROL_SIZE,
    14 * CAPTION_LINE + 26 * TITLE_LINE + TITLE_TO_DOTS + STATUS_BAR_DOT,
  ) + 2 * STATUS_BAR_PAD_Y,
);

/** The Peek square: 44px, blue, one word. Disabled once spent. */
export const peekButtonStyle = (disabled: boolean): React.CSSProperties => ({
  ...buttonStyle("secondary", "sm", { mobile: true, disabled }),
  width: HOME_CONTROL_SIZE,
  height: HOME_CONTROL_SIZE,
  minWidth: HOME_CONTROL_SIZE,
  minHeight: HOME_CONTROL_SIZE,
  padding: 0,
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  flex: "0 0 auto",
});

const Slot: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div style={{ width: HOME_CONTROL_SIZE, height: HOME_CONTROL_SIZE, flex: "0 0 auto", display: "flex" }}>
    {children}
  </div>
);

const DailyStatusBar: React.FC<{
  /** Left slot: Home before Start, the X during a run, empty otherwise. */
  control?: React.ReactNode;
  caption: React.ReactNode;
  /** The rule readout. Plain text is auto-fitted so long rules never wrap. */
  title: React.ReactNode;
  misses: React.ReactNode;
  /** Right slot: the Peek square. */
  peek?: React.ReactNode;
  titleTestId?: string;
  testId?: string;
}> = ({ control, caption, title, misses, peek, titleTestId, testId }) => (
  <div
    data-testid={testId}
    style={{
      display: "flex",
      alignItems: "center",
      gap: SPACE[4],
      width: "100%",
      minHeight: STATUS_BAR_H,
      boxSizing: "border-box",
      padding: `${STATUS_BAR_PAD_Y}px ${STATUS_BAR_PAD_X}px`,
      background: COLORS.surface,
      borderRadius: RADIUS.md,
      boxShadow: CARD_SHADOW_REST_CSS,
    }}
  >
    <Slot>{control}</Slot>
    <div
      style={{
        flex: "1 1 auto",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div style={{ ...textStyle("caption", true), lineHeight: CAPTION_LINE, color: COLORS.inkMuted }}>
        {caption}
      </div>
      <div
        aria-live="polite"
        data-testid={titleTestId}
        style={{ width: "100%", display: "flex", justifyContent: "center", minHeight: `${26 * TITLE_LINE}px` }}
      >
        {typeof title === "string" ? (
          <AutoFitText
            minScale={0.7}
            style={{
              ...textStyle("title", false),
              lineHeight: TITLE_LINE,
              color: COLORS.ink,
              fontVariantNumeric: "tabular-nums",
              margin: "0 auto",
            }}
          >
            {title}
          </AutoFitText>
        ) : (
          title
        )}
      </div>
      <div style={{ marginTop: TITLE_TO_DOTS }}>{misses}</div>
    </div>
    <Slot>{peek}</Slot>
  </div>
);

export default DailyStatusBar;
