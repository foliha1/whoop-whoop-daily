import React from "react";
import { createPortal } from "react-dom";
import { AppButton } from "@/components/ui/AppButton";
import MaterialIcon from "@/components/MaterialIcon";
import { useDismiss } from "@/hooks/useDismiss";
import { useMotionExit } from "@/hooks/useMotionExit";
import { usePortalHost } from "@/hooks/usePortalHost";
import { UI_EASE, UI_EXIT_MS } from "@/lib/animationTiming";
import { BORDER, COLORS, RADIUS, SPACE } from "@/lib/tokens";

/** Supply a new key for each release; the shell owns dismissal and accessibility. */
export function hasSeenAnnouncement(seenKey: string): boolean {
  try { return localStorage.getItem(seenKey) === "1"; } catch { return false; }
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const ReleaseAnnouncement: React.FC<{
  seenKey: string;
  title: string;
  primaryLabel: string;
  secondaryLabel: string;
  children: React.ReactNode;
  onPrimary: () => void;
  onDismiss: () => void;
  returnFocusSelector?: string;
  testId?: string;
}> = ({ seenKey, title, primaryLabel, secondaryLabel, children, onPrimary, onDismiss, returnFocusSelector, testId = "release-announcement" }) => {
  const host = usePortalHost("release-announcement");
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const actionRef = React.useRef<"primary" | "dismissed" | null>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);

  const finish = React.useCallback(() => {
    if (actionRef.current === "primary") onPrimary();
    else onDismiss();
  }, [onPrimary, onDismiss]);
  const { exiting, requestExit } = useMotionExit(finish);

  const close = React.useCallback((action: "primary" | "dismissed") => {
    if (actionRef.current) return;
    actionRef.current = action;
    try { localStorage.setItem(seenKey, "1"); } catch { /* storage unavailable */ }
    requestExit();
  }, [seenKey, requestExit]);
  const dismiss = React.useCallback(() => close("dismissed"), [close]);
  const { onBackdropClick } = useDismiss(dismiss, { escape: true, backdrop: true });

  React.useEffect(() => {
    if (!host) return;
    const active = document.activeElement as HTMLElement | null;
    openerRef.current = active && active !== document.body && !host.contains(active)
      ? active : returnFocusSelector ? document.querySelector<HTMLElement>(returnFocusSelector) : null;
    buttonRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (actionRef.current !== "primary" && opener?.isConnected) window.setTimeout(() => opener.focus(), 0);
    };
  }, [host, returnFocusSelector]);

  React.useEffect(() => {
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", trap, true);
    return () => window.removeEventListener("keydown", trap, true);
  }, []);

  if (!host) return null;
  return createPortal(
    <div
      className="ww-ui-modal-backdrop"
      data-motion-exit={exiting ? "true" : undefined}
      data-testid={`${testId}-backdrop`}
      onClick={onBackdropClick}
      style={{ position: "fixed", inset: 0, height: "var(--ww-vh)", zIndex: 1000, background: `color-mix(in srgb, ${COLORS.ink} 65%, transparent)`, display: "grid", placeItems: "center", padding: SPACE[4], boxSizing: "border-box" }}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label={title}
        data-testid={testId} data-motion-exit={exiting ? "true" : undefined}
        className="ww-ui-modal-panel"
        style={{ width: "100%", maxWidth: "min(100%, 480px)", maxHeight: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box", background: COLORS.surface, color: COLORS.ink, border: BORDER.heavy, borderRadius: RADIUS.md }}
      >
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: SPACE[10], display: "flex", flexDirection: "column", gap: SPACE[6] }}>
          {children}
        </div>
        <div style={{ flex: "0 0 auto", padding: SPACE[10], display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: SPACE[3], background: COLORS.surface }}>
          <AppButton ref={buttonRef} fullWidth tone="blue" style={{ minWidth: 0, whiteSpace: "normal" }} onClick={() => close("primary")}>{primaryLabel}</AppButton>
          <AppButton fullWidth variant="secondary" style={{ minWidth: 0, whiteSpace: "normal" }} onClick={dismiss}>{secondaryLabel}</AppButton>
        </div>
      </div>
    </div>, host
  );
};

export default ReleaseAnnouncement;