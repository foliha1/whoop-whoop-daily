// ============================================================================
// Pre-launch signup overlay.
//
// A sibling of How to Play, not a new pattern: the same khaki card treatment,
// 4px radius, Friend headings and Geist body, with a close control top right.
// It holds nothing but the email form, and is sized to its content.
// ============================================================================

import React from "react";
import DailyEmailCapture from "@/components/DailyEmailCapture";
import CloseButton from "@/components/CloseButton";
import { useDismiss } from "@/hooks/useDismiss";
import { DAILY_LAUNCH_LABEL } from "@/lib/daily";
import { BORDER, COLORS, RAW, RADIUS, SPACE } from "@/lib/tokens";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])';

const DailyPreLaunchSignup: React.FC<{
  onClose: () => void;
  onSubscribed?: (email: string, restored: boolean) => void;
}> = ({ onClose, onSubscribed }) => {
  const cardRef = React.useRef<HTMLDivElement>(null);

  // Escape + focus return: shared. Backdrop tap is this modal's own behaviour
  // (it is the only Daily modal with a scrim) and is wired through the hook.
  const { onBackdropClick } = useDismiss(onClose, {
    escape: true,
    backdrop: true,
    returnFocus: true,
  });

  // Tab is trapped inside the card while it is open.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !card.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !card.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);


  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Get the first puzzle"
      data-testid="prelaunch-signup"
      className="ww-ui-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        // Scrim over the ready screen, same weight as the rest of the app.
        background: "rgba(35, 31, 32, 0.6)",
      }}
      onClick={onBackdropClick}
    >
      <div
        ref={cardRef}
        className="ww-ui-modal-panel"
        style={{
          width: "100%",
          maxWidth: 354,
          // Sized to its content, never the full screen.
          background: COLORS.panel,
          border: BORDER.heavy,
          borderRadius: RADIUS.sm,
          boxSizing: "border-box",
          padding: `${SPACE[6]}px ${SPACE[8]}px ${SPACE[8]}px`,
          display: "flex",
          flexDirection: "column",
          gap: SPACE[4],
          maxHeight: "calc(100% - 8px)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <CloseButton
            label="Close"
            onClick={onClose}
            ariaLabel="Close"
            data-testid="prelaunch-close"
          />
        </div>

        <DailyEmailCapture
          source="prelaunch"
          autoFocus
          heading={`First puzzle, ${DAILY_LAUNCH_LABEL}.`}
          body="Drop your email and we'll send it the morning it goes live. One a day after that. Nothing else."
          note={null}
          submitLabel="Notify Me"
          successMessage={`You're on the list. See you on the ${DAILY_LAUNCH_LABEL.replace(/^August\s+/, "")}.`}
          onSubscribed={onSubscribed}
        />
      </div>
    </div>
  );
};

export default DailyPreLaunchSignup;
