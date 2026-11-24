import React from "react";
import { Link } from "react-router-dom";
import { COLORS, RADIUS, SPACE, buttonStyle, textStyle } from "@/lib/tokens";

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
}> = ({ roundsSolved, totalMisses, mobile }) => (
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
      background: COLORS.panel,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE[2] }}>
      <p style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>
        FELIX says
      </p>
      <p style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}>
        {felixDailyComment(roundsSolved, totalMisses)}
      </p>
    </div>
    <Link
      to="/classic?mode=solo"
      className="ww-press"
      data-testid="results-solo"
      style={{ ...buttonStyle("secondary", "lg", { mobile }), alignSelf: "stretch" }}
    >
      Play Solo
    </Link>
  </section>
);

export default DailySoloPrompt;
