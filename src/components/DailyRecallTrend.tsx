// ============================================================================
// DailyRecallTrend — one line in the All Time Results block, plus a disclosure.
//
// The line sits under the all-time tiles: it compares your first three games to
// your last three, so it is an all-time metric, not today's.
//
// Blue (#0072B2) carries the number and the arrow because blue already means
// "solved" in the result circles. There is no green in the palette.
//
// The explanation is an ACCORDION, not a floating popover: it lives in the
// document, inside the blue-stroked callout, directly under the sentence. There
// is no anchor to measure, no flip logic, no z-index layer and no portal — so
// there is nothing to paint in the wrong place and nothing to clip. Escape and
// focus return stay (via `useDismiss`); tap-outside is deliberately gone.
// ============================================================================

import React from "react";
import { ChevronDown } from "lucide-react";
import {
  COLORS,
  RADIUS,
  SPACE,
  TEXT,
  FONT_FAMILY_UI,
  FONT_WEIGHT_UI,
  textStyle,
} from "@/lib/tokens";
import { formatRecallLine, RECALL_TOOLTIP, type RecallTrend } from "@/lib/dailyRecall";
import { ArrowUp } from "lucide-react";
import useDismiss from "@/hooks/useDismiss";

/**
 * Mounted only while open, so `useDismiss` captures the chevron as the opener
 * and hands focus back to it on close. Renders in flow — no positioning.
 */
const Panel: React.FC<{ onClose: () => void; mobile: boolean }> = ({ onClose, mobile }) => {
  useDismiss(onClose, { escape: true, returnFocus: true });
  return (
    <div
      id="ww-recall-tip"
      data-testid="recall-tooltip-panel"
      style={{
        // 8px on all four sides.
        padding: SPACE[4],
        borderRadius: RADIUS.sm,
        marginTop: SPACE[2],
      }}
    >
      <span
        data-testid="recall-tooltip"
        style={{
          // Geist: this is metadata about a metric, not the game's voice.
          fontFamily: FONT_FAMILY_UI,
          fontWeight: FONT_WEIGHT_UI,
          fontSize: mobile ? TEXT.body.mobileSize : TEXT.body.size,
          lineHeight: 1.45,
          color: COLORS.ink,
          display: "block",
          textAlign: "left",
        }}
      >
        {RECALL_TOOLTIP}
      </span>
    </div>
  );
};

const DailyRecallTrend: React.FC<{ trend: RecallTrend; mobile: boolean }> = ({
  trend,
  mobile,
}) => {
  const [open, setOpen] = React.useState(false);
  const line = formatRecallLine(trend);
  // The percentage (and the arrow) are the only blue parts of the sentence.
  const pct = `${trend.latePct}%`;
  const [before, after] = line.split(pct);

  return (
    <div>
      <p
        data-testid="recall-line"
        style={{
          ...textStyle("control", mobile),
          lineHeight: 1.45,
          color: COLORS.inkMuted,
          textAlign: "center",
          margin: 0,
        }}
      >
        {before}
        {trend.upPoints !== null && (
          // Inline, immediately before the percentage, sized to the text and
          // glued to it so it can never wrap onto a line of its own.
          <span style={{ whiteSpace: "nowrap", color: COLORS.blue }}>
            <ArrowUp
              size="1em"
              strokeWidth={2}
              aria-hidden="true"
              style={{ display: "inline-block", verticalAlign: "-0.12em", marginRight: "0.18em" }}
            />
            <span>{pct}</span>
          </span>
        )}
        {trend.upPoints === null && <span style={{ color: COLORS.blue }}>{pct}</span>}
        {after}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="What is a first-time match?"
          aria-expanded={open}
          aria-controls="ww-recall-tip"
          data-testid="recall-info"
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: SPACE[2],
            verticalAlign: "-3px",
            padding: 0,
            border: "none",
            background: "transparent",
            color: COLORS.inkMuted,
            cursor: "pointer",
          }}
        >
          <ChevronDown
            className="ww-disclosure-icon"
            size={16}
            strokeWidth={2}
            aria-hidden="true"
            style={{
              pointerEvents: "none",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 150ms ease",
            }}
          />
          {/* invisible 44px minimum touch target; the visible chevron keeps its size */}
          <span
            aria-hidden="true"
            data-testid="recall-info-hit"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 44,
              height: 44,
            }}
          />
        </button>
      </p>
      {open && <Panel mobile={mobile} onClose={() => setOpen(false)} />}
    </div>
  );
};

export default DailyRecallTrend;
