// ============================================================================
// DailyEmailModal — the lobby email entry, in a real dialog.
//
// Why this exists: the previous inline overlay used `position: fixed` from
// inside `.daily-intro`, which animates `transform`. A transformed ancestor
// becomes the containing block for fixed positioning, so the form was laid out
// on top of the trigger line instead of the viewport — no heading, no visible
// submit, no close. This component portals to `document.body` instead, so
// nothing on the ready screen can capture or clip it.
//
// Chrome is deliberately the share modal's language: full-bleed cream surface
// inside the 24px DailyFrame gutter, khaki panel, top-right CLOSE control,
// Escape to dismiss, focus moved in and trapped. The styling is DUPLICATED
// rather than extracted from `DailySharePreview` — that component measures its
// own card slot with a ResizeObserver against its flex chrome, and refactoring
// it into a shared shell would risk changing those measurements. So it is left
// untouched.
//
// Keyboard: the panel is pinned toward the TOP of the *visible* area and the
// container tracks `window.visualViewport` (height + offsetTop), so when the
// on-screen keyboard opens the submit button stays inside what the player can
// actually see. Nothing is vertically centred.
// ============================================================================

import React from "react";
import { createPortal } from "react-dom";
import { usePortalHost } from "@/hooks/usePortalHost";
import DailyShapeRule from "@/components/DailyShapeRule";
import DailyEmailCapture from "@/components/DailyEmailCapture";
import CloseButton from "@/components/CloseButton";
import { useDismiss } from "@/hooks/useDismiss";
import { COLORS, RADIUS, RAW, SPACE } from "@/lib/tokens";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])';

/** Live visual viewport box, so the keyboard cannot push the submit off screen. */
function useVisualViewportBox() {
  const read = () => {
    if (typeof window === "undefined") return { top: 0, height: 0 };
    const vv = window.visualViewport;
    return {
      top: vv ? vv.offsetTop : 0,
      height: vv ? vv.height : window.innerHeight,
    };
  };
  const [box, setBox] = React.useState(read);
  React.useEffect(() => {
    const onChange = () => {
      setBox(read());
      // The page behind must not drift when the field takes focus.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    onChange();
    window.addEventListener("resize", onChange);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onChange);
    vv?.addEventListener("scroll", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      vv?.removeEventListener("resize", onChange);
      vv?.removeEventListener("scroll", onChange);
    };
  }, []);
  return box;
}

const DailyEmailModal: React.FC<{
  /** Restore mode only changes the heading; everything else is shared. */
  mode: "restore" | "subscribe";
  onClose: () => void;
  onSubscribed?: (email: string, restored: boolean) => void;
  /** Delay before the modal closes itself once the success state has shown. */
  successHoldMs?: number;
}> = ({ mode, onClose, onSubscribed, successHoldMs = 1400 }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const vv = useVisualViewportBox();
  // With the keyboard open the visible box is tiny; the decorative shape rules
  // and the 24px gutter are the first things to go so the submit stays in view.
  const compact = vv.height > 0 && vv.height < 560;
  const gutter = compact ? 12 : 24;

  // Escape + focus return live in the shared hook; the Tab trap is local
  // because only this component knows what is focusable inside it.
  useDismiss(onClose, { escape: true, returnFocus: true });

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const host = hostRef.current;
      if (!host) return;
      const items = Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !host.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !host.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  if (!portalHost) return null;

  return createPortal(
    <div
      ref={hostRef}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "restore" ? "Restore your streak" : "Get tomorrow's grid"}
      data-testid="daily-email-modal"
      style={
        {
          position: "fixed",
          left: 0,
          right: 0,
          // Pinned to the visible viewport, never centred: the submit stays
          // reachable with the keyboard open.
          top: vv.top,
          height: vv.height || undefined,
          zIndex: 1000,
          background: COLORS.surface,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: gutter,
          padding: gutter,
          paddingBottom: `calc(${gutter}px + env(safe-area-inset-bottom))`,
          overflowY: "auto",
          overscrollBehavior: "contain",
          "--daily-content-max-width": "402px",
          "--daily-content-padding-x": "24px",
        } as React.CSSProperties
      }
    >
      {!compact && <DailyShapeRule />}

      <div
        data-testid="daily-email-modal-panel"
        style={{
          width: "100%",
          maxWidth: 402,
          flex: "0 0 auto",
          background: RAW.khaki,
          borderRadius: RADIUS.sm,
          boxSizing: "border-box",
          padding: `${SPACE[6]}px clamp(16px, 9%, 32px) ${SPACE[8]}px`,
          display: "flex",
          flexDirection: "column",
          gap: SPACE[4],
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <CloseButton
            ref={closeRef}
            label="CLOSE"
            onClick={onClose}
            ariaLabel="Close"
            data-testid="daily-restore-close"
          />
        </div>

        {/* Same component, same validation, same submit path. Only the heading
            differs between modes. */}
        <DailyEmailCapture
          source={mode === "restore" ? "restore" : "daily_result"}
          autoFocus
          heading={mode === "restore" ? "Restore your streak." : "Get tomorrow's grid."}
          body="Enter the address you used before and your streak and history come back."
          note={null}
          submitLabel={mode === "restore" ? "Restore" : "Sign me up"}
          onSubscribed={(email, restored) => {
            onSubscribed?.(email, restored);
            // The success line shows inside the modal, then it closes itself.
            window.setTimeout(onClose, successHoldMs);
          }}
        />
      </div>

      {!compact && <DailyShapeRule />}
    </div>,
    portalHost
  );
};

export default DailyEmailModal;
