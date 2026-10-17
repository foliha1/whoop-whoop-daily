import React from "react";
import ReleaseAnnouncement, { hasSeenAnnouncement } from "@/components/ReleaseAnnouncement";
import { LAUNCHED } from "@/lib/launch";
import { COLORS, FONT_FAMILY, FONT_FAMILY_UI, SPACE } from "@/lib/tokens";

export const LAUNCH_NOTE_KEY = "ww-launch-note-v1";

/** Admin preview (pre-launch) shows it on every Home entry for review; after launch, once per player. */
export function shouldShowLaunchNote(): boolean {
  return LAUNCHED ? !hasSeenAnnouncement(LAUNCH_NOTE_KEY) : true;
}

const WORD: [string, string][] = [["W", COLORS.ink], ["h", COLORS.ink], ["o", COLORS.orangeStat], ["o", COLORS.orangeStat], ["p", COLORS.blue], ["!", COLORS.red]];
const Whoop = () => <span>{WORD.map(([c, color], i) => <span key={i} style={{ color }}>{c}</span>)}</span>;

const body: React.CSSProperties = { fontFamily: FONT_FAMILY_UI, fontSize: 16, lineHeight: 1.45, margin: 0, color: COLORS.ink };
const Section = ({ title, color, children }: { title: string; color: string; children: React.ReactNode }) => (
  <section style={{ display: "flex", flexDirection: "column", gap: SPACE[1] }}>
    <h3 style={{ fontFamily: FONT_FAMILY, fontSize: 24, fontWeight: 700, margin: 0, color }}>{title}</h3>
    <p style={body}>{children}</p>
  </section>
);

const LaunchAnnouncement: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <ReleaseAnnouncement
    seenKey={LAUNCH_NOTE_KEY}
    title="Whoop! Whoop! just got better."
    primaryLabel="Let's Play"
    onPrimary={onClose}
    onDismiss={onClose}
    testId="launch-announcement"
  >
    <h2 style={{ fontFamily: FONT_FAMILY, fontSize: 34, lineHeight: 1.05, fontWeight: 700, margin: 0, color: COLORS.ink }}>
      <Whoop /> <Whoop /><br />just got <em>better.</em>
    </h2>
    <p style={body}>The Daily was only the beginning! Now there are two new ways to play, straight from the card game that inspired it all.</p>
    <Section title="Play Daily!" color={COLORS.orangeStat}>Your daily habit, just like always. Keep that streak going and become a Whoop! Whoop! Legend.</Section>
    <Section title="Play Solo!" color={COLORS.blue}>Think you're quick? Try to outplay <strong>FELIX the bot.</strong> The die sets the rule, find the match, first to 12 wins.</Section>
    <Section title="Play Together!" color={COLORS.red}>Grab your friends, start a table, send the link, and get your Whoop! Whoop! on.</Section>
  </ReleaseAnnouncement>
);

export default LaunchAnnouncement;
