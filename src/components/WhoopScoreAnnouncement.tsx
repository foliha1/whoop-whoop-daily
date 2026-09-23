import React from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import YouScoreTiles from "@/components/YouScoreTiles";
import { AppButton } from "@/components/ui/AppButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDismiss } from "@/hooks/useDismiss";
import { useMotionExit } from "@/hooks/useMotionExit";
import { usePortalHost } from "@/hooks/usePortalHost";
import { getSubscribedEmail } from "@/lib/dailySubscribe";
import { trackDaily } from "@/lib/dailyEvents";
import { fetchDailyResults } from "@/lib/dailyResults";
import { getVisitorId } from "@/lib/visitor";
import type { WhoopPoints } from "@/lib/whoopPoints";
import { BORDER, COLORS, RADIUS, SPACE, textStyle } from "@/lib/tokens";

/** New releases use a new key; copy and version stay together here. */
export const SCORE_ANNOUNCEMENT = {
  version: "score_v1",
  seenKey: "ww_announce_score_v1",
  headline: "Your games now add up.",
  intro: "These points come from the games you've already played.",
  bullets: [
    "Earn up to 5 points a day. Play, nail rounds on the first try, and skip the peek.",
    "Climb five tiers, from Rookie to Whoop Whoop Legend.",
    "Earn badges you keep forever.",
  ],
  primary: "See Your Stats",
  secondary: "Got it",
} as const;

export function hasSeenScoreAnnouncement(): boolean {
  try { return localStorage.getItem(SCORE_ANNOUNCEMENT.seenKey) === "1"; } catch { return false; }
}

/** A positive older row is necessary; a failed history request ([]) is never eligible. */
export async function hasPriorDailyResult(todayNumber: number): Promise<boolean> {
  const rows = await fetchDailyResults(getVisitorId(), getSubscribedEmail());
  return rows.some((row) => row.puzzle_number > 0 && row.puzzle_number < todayNumber);
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Reusable announcement shell with one-shot seen state and measured Daily events. */
const WhoopScoreAnnouncement: React.FC<{
  points: WhoopPoints;
  puzzleNumber: number;
  onClose: () => void;
}> = ({ points, puzzleNumber, onClose }) => {
  const host = usePortalHost("score-announcement");
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const actionRef = React.useRef<"primary" | "dismissed" | null>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);

  const finish = React.useCallback(() => {
    if (actionRef.current === "primary") navigate("/you", { state: { wwReturn: "results" } });
    onClose();
  }, [navigate, onClose]);
  const { exiting, requestExit } = useMotionExit(finish);

  const close = React.useCallback((action: "primary" | "dismissed") => {
    if (actionRef.current) return;
    actionRef.current = action;
    try { localStorage.setItem(SCORE_ANNOUNCEMENT.seenKey, "1"); } catch { /* storage unavailable */ }
    trackDaily(action === "primary" ? "announcement_primary_tapped" : "announcement_dismissed", {
      puzzleNumber, props: { version: SCORE_ANNOUNCEMENT.version },
    });
    requestExit();
  }, [puzzleNumber, requestExit]);
  const dismiss = React.useCallback(() => close("dismissed"), [close]);
  const { onBackdropClick } = useDismiss(dismiss, { escape: true, backdrop: true });

  React.useEffect(() => {
    if (!host) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    buttonRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener?.isConnected) window.setTimeout(() => opener.focus(), 0);
    };
  }, [host]);
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
      data-testid="score-announcement-backdrop"
      onClick={onBackdropClick}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: `color-mix(in srgb, ${COLORS.ink} 65%, transparent)`, display: "grid", placeItems: "center", padding: SPACE[4], boxSizing: "border-box" }}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="score-announcement-title"
        data-testid="score-announcement" data-motion-exit={exiting ? "true" : undefined}
        className="ww-ui-modal-panel"
        style={{ width: "100%", maxWidth: "min(100%, 480px)", maxHeight: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box", background: COLORS.surface, color: COLORS.ink, border: BORDER.heavy, borderRadius: RADIUS.md }}
      >
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: SPACE[6], display: "flex", flexDirection: "column", gap: SPACE[6] }}>
          <YouScoreTiles points={points} mobile={mobile} compact />
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
            <h2 id="score-announcement-title" style={{ ...textStyle("heading", mobile), margin: 0 }}>{SCORE_ANNOUNCEMENT.headline}</h2>
            <p style={{ ...textStyle("body", mobile), margin: 0 }}>{SCORE_ANNOUNCEMENT.intro}</p>
            <ul style={{ ...textStyle("body", mobile), margin: 0, paddingLeft: SPACE[8], display: "flex", flexDirection: "column", gap: SPACE[2] }}>
              {SCORE_ANNOUNCEMENT.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
          </div>
        </div>
        <div style={{ flex: "0 0 auto", padding: SPACE[4], borderTop: BORDER.standard, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: SPACE[3], background: COLORS.surface }}>
          <AppButton ref={buttonRef} fullWidth tone="blue" onClick={() => close("primary")}>{SCORE_ANNOUNCEMENT.primary}</AppButton>
          <AppButton fullWidth variant="secondary" onClick={dismiss}>{SCORE_ANNOUNCEMENT.secondary}</AppButton>
        </div>
      </div>
    </div>, host
  );
};

export default WhoopScoreAnnouncement;