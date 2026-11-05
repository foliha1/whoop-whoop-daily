// ============================================================================
// SubscribeChip — the lobby "Subscribe" chip next to How to Play. Opens the
// shared email modal with an explainer of what subscribing gives you, and
// writes through the existing reminder signup path (source "home"). The
// caller hides the chip once this browser is subscribed or signed in.
// ============================================================================

import React, { useState } from "react";
import { Mail } from "lucide-react";
import DailyEmailModal from "@/components/DailyEmailModal";
import { hapticTap } from "@/lib/haptics";
import { COLORS, FONT_FAMILY, SPACE } from "@/lib/tokens";

export const SUBSCRIBE_BENEFITS: { title: string; text: string; color: string }[] = [
  { title: "Daily reminder", text: "Tomorrow's grid in your inbox every morning.", color: COLORS.blue },
  { title: "Score keeper", text: "Your streak and stats, kept safe on any device.", color: COLORS.red },
  { title: "Game updates", text: "The odd note when something new drops. No spam, ever.", color: COLORS.orange },
];

const GEIST = '"Geist", "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

const SubscribeBenefits: React.FC = () => (
  <ul data-testid="subscribe-benefits" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: SPACE[3] }}>
    {SUBSCRIBE_BENEFITS.map((b) => (
      <li key={b.title} style={{ display: "flex", gap: SPACE[3], alignItems: "flex-start" }}>
        <span aria-hidden="true" style={{ flex: "0 0 auto", width: 10, height: 10, borderRadius: 999, background: b.color, marginTop: 6 }} />
        <span style={{ fontFamily: GEIST, fontSize: 14, lineHeight: 1.45, color: COLORS.ink }}>
          <strong style={{ fontFamily: FONT_FAMILY, fontWeight: 700 }}>{b.title}.</strong> {b.text}
        </span>
      </li>
    ))}
  </ul>
);

const SubscribeChip: React.FC<{ style: React.CSSProperties; onSubscribed?: (email: string) => void }> = ({ style, onSubscribed }) => {
  const [open, setOpen] = useState(false);
  const doneRef = React.useRef<string | null>(null);
  const close = () => {
    setOpen(false);
    const email = doneRef.current;
    doneRef.current = null;
    if (email) onSubscribed?.(email);
  };
  return (
    <>
      <button
        type="button"
        className="ww-press daily-btn-howto"
        data-testid="lobby-subscribe"
        onClick={() => { hapticTap(); setOpen(true); }}
        style={{ ...style, position: "relative", overflow: "hidden", background: COLORS.blue, color: COLORS.onBlue }}
      >
        <span aria-hidden="true" className="ww-sub-shine" />
        <Mail size={16} aria-hidden="true" />
        Subscribe
      </button>
      {open ? (
        <DailyEmailModal
          mode="subscribe"
          source="home"
          heading="Stay in the loop."
          intro={<SubscribeBenefits />}
          submitLabel="Subscribe"
          floating
          onClose={close}
          onSubscribed={(email) => { doneRef.current = email; }}
        />
      ) : null}
    </>
  );
};

export default SubscribeChip;
