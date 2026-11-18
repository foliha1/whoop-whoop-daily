import React from "react";
import { useNavigate } from "react-router-dom";
import ReleaseAnnouncement, { hasSeenAnnouncement } from "@/components/ReleaseAnnouncement";
import { useIsMobile } from "@/hooks/use-mobile";
import { COLORS, SPACE, textStyle } from "@/lib/tokens";

export const PREORDER_ANNOUNCEMENT = {
  seenKey: "ww-preorder-announcement-v1",
  headline: "Whoop! Whoop! is coming to the table.",
  intro: "The memory game where the rules keep changing, now as a real card game. 48 cards, a Match Die, and a canvas drawstring bag.",
  offer: "Pre-order for $35 with free shipping. Ships early December 2026.",
  primary: "Pre-order now",
  secondary: "Not now",
} as const;

/** One announcement per device; dismissing or following the link marks it seen. */
export function shouldShowPreorderNote(): boolean {
  return !hasSeenAnnouncement(PREORDER_ANNOUNCEMENT.seenKey);
}

/** The lobby stays clear while the intro is visible, including its loading state. */
export function introAllowsPreorderAnnouncement(
  introStatus: "running" | "skipped" | "complete" | "timeout" | "none",
): boolean {
  return introStatus !== "running";
}

const PreorderAnnouncement: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const mobile = useIsMobile();
  const navigate = useNavigate();

  return (
    <ReleaseAnnouncement
      seenKey={PREORDER_ANNOUNCEMENT.seenKey}
      title={PREORDER_ANNOUNCEMENT.headline}
      primaryLabel={PREORDER_ANNOUNCEMENT.primary}
      secondaryLabel={PREORDER_ANNOUNCEMENT.secondary}
      onPrimary={() => {
        onClose();
        navigate("/preorder");
      }}
      onDismiss={onClose}
      testId="preorder-announcement"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
        <h2 style={{ ...textStyle("hero", mobile), margin: 0, color: COLORS.ink, lineHeight: 1.05, letterSpacing: 0 }}>
          {PREORDER_ANNOUNCEMENT.headline}
        </h2>
        <p style={{ ...textStyle("body", mobile), margin: 0, color: COLORS.ink }}>
          {PREORDER_ANNOUNCEMENT.intro}
        </p>
      </div>
      <p style={{ ...textStyle("subhead", mobile), margin: 0, color: COLORS.ink }}>
        {PREORDER_ANNOUNCEMENT.offer}
      </p>
    </ReleaseAnnouncement>
  );
};

export default PreorderAnnouncement;
