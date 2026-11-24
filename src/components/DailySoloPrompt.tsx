import React from "react";
import { Link } from "react-router-dom";
import {
  BORDER,
  COLORS,
  RADIUS,
  RAW,
  SPACE,
  buttonStyle,
  textStyle,
} from "@/lib/tokens";

/** FELIX reacts to the saved Daily outcome without changing any game data. */
export function felixDailyComment(roundsSolved: number, totalMisses: number): string {
  if (roundsSolved >= 3 && totalMisses === 0) {
    return "A perfect Daily? Show-off. Now come try that against me.";
  }
  if (roundsSolved >= 3) {
    return "Three rounds solved. I may have met my match. Care to test that theory?";
  }
  if (roundsSolved === 2) {
    return "Two out of three. Not bad, but I think you have one more in you.";
  }
  if (roundsSolved === 1) {
    return "One round solved. I have a feeling you are just warming up.";
  }
  return "That Daily was a tricky one. Come play me in Solo and get your revenge.";
}

const DailySoloPrompt: React.FC<{
  roundsSolved: number;
  totalMisses: number;
  mobile: boolean;
  onDone?: () => void;
  doneDisabled?: boolean;
}> = ({ roundsSolved, totalMisses, mobile, onDone, doneDisabled = false }) => (
  <section
    aria-label="FELIX's Solo challenge"
    data-testid="results-solo-prompt"
    style={{
      alignSelf: "stretch",
      display: "flex",
      flexDirection: "column",
      gap: SPACE[4],
      padding: SPACE[5],
      border: `2px solid ${COLORS.ink}`,
      borderRadius: RADIUS.sm,
      // Brand black in both themes, so every word inside is a literal light
      // tone: themed ink would flip to warm black at night and vanish. The
      // themed border stays because the night page is itself brand black.
      background: RAW.warmBlack,
      color: RAW.cream,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE[2] }}>
      <p style={{ ...textStyle("label", mobile), color: RAW.khakiMuted, margin: 0 }}>
        FELIX says:
      </p>
      <p style={{ ...textStyle("body", mobile), color: RAW.cream, margin: 0 }}>
        {felixDailyComment(roundsSolved, totalMisses)}
      </p>
    </div>
    <div
      data-testid="results-exit-actions"
      style={{
        display: "grid",
        gridTemplateColumns: onDone
          ? "minmax(0, 2fr) minmax(0, 1fr)"
          : "minmax(0, 1fr)",
        gap: SPACE[3],
      }}
    >
      <Link
        to="/classic?mode=solo"
        className="ww-press"
        data-testid="results-solo"
        style={{
          ...buttonStyle("primary", "lg", { mobile, fullWidth: true }),
          minWidth: 0,
          gap: SPACE[2],
          paddingInline: SPACE[3],
        }}
      >
        <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="11" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M6 27c2-5 6-7 10-7s8 2 10 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        Play Solo
      </Link>
      {onDone && (
        <button
          type="button"
          className="ww-press"
          onClick={onDone}
          disabled={doneDisabled}
          data-testid="results-done"
          style={{
            ...buttonStyle("neutral", "lg", { mobile, fullWidth: true, disabled: doneDisabled }),
            minWidth: 0,
            paddingInline: SPACE[3],
            // On a brand-black panel the themed neutral surface would read as
            // black-on-black at night, so the quiet action becomes a literal
            // cream outline. A spent Done keeps its own inactive surface.
            ...(doneDisabled
              ? null
              : {
                  background: RAW.warmBlack,
                  color: RAW.cream,
                  border: `2px solid ${RAW.cream}`,
                  ["--ww-button-hover" as string]: `color-mix(in srgb, ${RAW.cream} 16%, ${RAW.warmBlack})`,
                }),
          }}
        >
          Done
        </button>
      )}
    </div>
  </section>
);

export default DailySoloPrompt;
