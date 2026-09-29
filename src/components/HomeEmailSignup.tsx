// ============================================================================
// HomeEmailSignup — the compact reminder trigger on the umbrella Home. It opens
// the existing Daily email modal, which owns validation, focus containment and
// the shared database-first signup path with source "home".
// ============================================================================

import React, { useState } from "react";
import DailyEmailModal from "@/components/DailyEmailModal";
import { hapticTap } from "@/lib/haptics";
import { COLORS, textStyle } from "@/lib/tokens";

const HomeEmailSignup: React.FC<{ mobile?: boolean; onSubscribed?: (email: string) => void }> = ({
  mobile = false,
  onSubscribed,
}) => {
  const [open, setOpen] = useState(false);
  const subscribedEmailRef = React.useRef<string | null>(null);

  const close = () => {
    setOpen(false);
    const email = subscribedEmailRef.current;
    subscribedEmailRef.current = null;
    if (email) onSubscribed?.(email);
  };

  return (
    <>
      <button
        type="button"
        className="ww-press"
        data-testid="home-email"
        onClick={() => { hapticTap(); setOpen(true); }}
        style={{
          ...textStyle("captionItalic", mobile),
          display: "block",
          width: "100%",
          margin: 0,
          padding: 0,
          border: 0,
          background: "transparent",
          color: COLORS.inkMuted,
          textAlign: "center",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Get a reminder for tomorrow's Daily
      </button>
      {open ? (
        <DailyEmailModal
          mode="subscribe"
          source="home"
          onClose={close}
          onSubscribed={(email) => { subscribedEmailRef.current = email; }}
        />
      ) : null}
    </>
  );
};

export default HomeEmailSignup;
