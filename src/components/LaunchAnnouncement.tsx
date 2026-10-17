import React from "react";
import ReleaseAnnouncement, { hasSeenAnnouncement } from "@/components/ReleaseAnnouncement";
import { useIsMobile } from "@/hooks/use-mobile";
import { LAUNCHED } from "@/lib/launch";
import { COLORS, FONT_FAMILY, SPACE, textStyle } from "@/lib/tokens";

export const LAUNCH_NOTE_KEY = "ww-launch-note-v1";
export const LAUNCH_NOTE_HEADLINE = "Whoop! Whoop! just got more fun";

/** Admin preview (pre-launch) shows it on every Home entry for review; after launch, once per player. */
export function shouldShowLaunchNote(): boolean {
  return LAUNCHED ? !hasSeenAnnouncement(LAUNCH_NOTE_KEY) : true;
}

const WORD: [string, string][] = [["W", COLORS.ink], ["h", COLORS.ink], ["o", COLORS.orangeStat], ["o", COLORS.orangeStat], ["p", COLORS.blue], ["!", COLORS.red]];
const Whoop = () => <span>{WORD.map(([c, color], i) => <span key={i} style={{ color }}>{c}</span>)}</span>;

/**
 * Custom marker column (same trick as the Classic demo bullets): the dot carries
 * this section's title colour and wrapped lines return to the text column.
 */
const Section = ({ title, color, mobile, children }: { title: string; color: string; mobile: boolean; children: React.ReactNode }) => (
  <li style={{ display: "flex", gap: SPACE[3], alignItems: "flex-start" }}>
    <span aria-hidden="true" style={{ ...textStyle("subhead", mobile), color, flex: "0 0 auto", width: SPACE[4], textAlign: "center" }}>•</span>
    <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: SPACE[1] }}>
      <h3 style={{ ...textStyle("subhead", mobile), margin: 0, color }}>{title}</h3>
      <p style={{ ...textStyle("body", mobile), margin: 0, color: COLORS.ink }}>{children}</p>
    </div>
  </li>
);

const LaunchAnnouncement: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const mobile = useIsMobile();
  return (
    <ReleaseAnnouncement
      seenKey={LAUNCH_NOTE_KEY}
      title={LAUNCH_NOTE_HEADLINE}
      primaryLabel="Let's Play"
      onPrimary={onClose}
      onDismiss={onClose}
      testId="launch-announcement"
    >
      <h2 style={{ fontFamily: FONT_FAMILY, fontSize: "clamp(32px, 9.5vw, 46px)", lineHeight: 1.02, fontWeight: 700, margin: 0, color: COLORS.ink }}>
        <Whoop /> <Whoop /><br />just got <em>more fun</em> 🙌
      </h2>
      <p style={{ ...textStyle("body", mobile), margin: 0, color: COLORS.ink }}>The Daily was only the beginning! Now there are two new ways to play, straight from the card game that inspired it all.</p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: SPACE[5] }}>
        <Section title="Play Daily!" color={COLORS.orangeStat} mobile={mobile}>Your daily habit, just like always. Keep that streak going and become a Whoop! Whoop! Legend.</Section>
        <Section title="Play Solo!" color={COLORS.blue} mobile={mobile}>Think you're quick? Try to outplay <strong>FELIX the bot.</strong> The die sets the rule, find the match, first to 12 wins.</Section>
        <Section title="Play Together!" color={COLORS.red} mobile={mobile}>Grab your friends, start a table, send the link, and get your Whoop! Whoop! on.</Section>
      </ul>
    </ReleaseAnnouncement>
  );
};

export default LaunchAnnouncement;
