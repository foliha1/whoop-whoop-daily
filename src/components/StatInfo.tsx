// Tap-to-explain for Your Stats tiles (umbrella ON only). The whole tile is the
// button; it opens a focus-trapped panel with what the stat means and how it is
// calculated. Copy only — no stat math lives here.
import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { COLORS, CONTROL_H, SPACE, buttonStyle, panelStyle, textStyle } from "@/lib/tokens";
import { MAX_POINTS_PER_GAME } from "@/lib/whoopPoints";

export const STAT_INFO: Record<string, { what: string; how: string }> = {
  "Your Tier": { what: "Your rank on the Whoop! Whoop! ladder.", how: "Set by your Total Score. Reach the next tier's starting points to move up." },
  "Total Score": { what: "Every Daily point you have earned, all time.", how: `Each Daily earns points for playing, rounds solved on the first try and not peeking — up to ${MAX_POINTS_PER_GAME} a day. Long breaks slowly fade points above your protected base.` },
  "Days Played": { what: "How many Dailies you have played.", how: "One per day you finished or left a Daily." },
  "Clean Runs": { what: "Dailies finished without a single miss.", how: "Counts each day where every round was solved with zero misses." },
  "Longest Streak": { what: "Your best run of days in a row.", how: "The most consecutive days you played the Daily without skipping one." },
  "Matches Played": { what: "Games you have played to the end.", how: "Counts every finished match in this mode." },
  "Solo Wins": { what: "Matches you beat FELIX.", how: "Counts finished Solo matches where you had the most pairs." },
  "1st Place Wins": { what: "Tables where you finished first.", how: "Counts finished Together matches where you had the most pairs." },
  "Win Rate": { what: "How often you win.", how: "Wins ÷ matches played × 100, rounded." },
  "Claim Accuracy": { what: "How often your claims are right.", how: "Correct claims ÷ all your claims (correct + wrong) × 100, rounded." },
  "Quickest Victory": { what: "Your fastest win.", how: "The shortest time from the start of a match to your win." },
  "Total Pairs": { what: "Every pair you have claimed.", how: "Adds up your correct claims across all Solo matches." },
  "Tables Hosted": { what: "Tables you have started for friends.", how: "Counts each new table you created. Rematches at the same table don't add more." },
};

export function StatInfoTile({ label, mobile, style, children }: { label: string; mobile: boolean; style: React.CSSProperties; children: React.ReactNode }) {
  const info = STAT_INFO[label];
  if (!info) return <div style={style}>{children}</div>;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="ww-press" aria-label={`${label}: learn more`} data-testid="stat-info-trigger" style={{ ...style, font: "inherit", cursor: "pointer", width: "100%" }}>
          {children}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(35, 31, 32, 0.6)", zIndex: 1000 }} />
        <Dialog.Content data-testid="stat-info-dialog" style={{ ...panelStyle("surface", 8), position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: `calc(100% - ${SPACE[16]}px)`, maxWidth: 360, zIndex: 1001, display: "flex", flexDirection: "column", gap: SPACE[6] }}>
          <Dialog.Title style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>{label}</Dialog.Title>
          <Dialog.Description style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}>{info.what}</Dialog.Description>
          <div>
            <div style={{ ...textStyle("label", mobile), color: COLORS.inkMuted }}>How it's calculated</div>
            <p style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: `${SPACE[2]}px 0 0` }}>{info.how}</p>
          </div>
          <Dialog.Close asChild>
            <button type="button" className="ww-press" style={{ ...buttonStyle("secondary", "lg", { mobile }), width: "100%", height: CONTROL_H.lg }}>Got it</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
