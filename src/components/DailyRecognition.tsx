// ============================================================================
// Daily lobby recognition — one line of small text, never a button.
//
// This is a relabelling of something that already exists, not a new system:
// entering an email already unions history across visitor id and email, so a
// returning player on a fresh browser only needs a door that says "come back"
// instead of "subscribe". No accounts, no sessions, nothing server side.
//
// Two states:
//   recognized      → "Playing as f•••@gmail.com  Not you?"
//   not recognized  → "Already playing? Restore your streak."
//
// Height is the constraint on this screen, so the line is a single row of
// 11–13px text scaled by the same compression factor the rest of the ready
// screen uses, and the restore form opens in a fixed overlay rather than
// growing the frame.
// ============================================================================

import React from "react";
import DailyEmailModal from "@/components/DailyEmailModal";
import { maskEmail } from "@/lib/dailySubscribe";
import { hapticTap } from "@/lib/haptics";
import { COLORS, FONT_FAMILY_UI, FONT_WEIGHT_UI } from "@/lib/tokens";


/** Text link that keeps a 44px tap target without taking 44px of layout. */
const InlineAction: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  /** Spoken name; the visible word alone is not always the whole action. */
  ariaLabel: string;
}> = ({ onClick, children, testId, ariaLabel }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    data-testid={testId}
    style={{
      position: "relative",
      appearance: "none",
      background: "none",
      border: "none",
      padding: 0,
      margin: 0,
      font: "inherit",
      color: "inherit",
      cursor: "pointer",
      textDecoration: "underline",
      textUnderlineOffset: 2,
    }}
  >
    {children}
    {/* Absolutely positioned, so a 44x44 minimum hit area costs no layout
        height on the ready screen's 480px budget. */}
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "calc(100% + 8px)",
        minWidth: 44,
        height: 44,
      }}
    />
  </button>
);



/**
 * The recognition line for the ready screen.
 *
 * `scale` is the shared compression factor (0 at a 480px viewport, 1 at 760px)
 * so this line shrinks with everything else instead of being the thing that
 * pushes the CTA off screen.
 */
const DailyRecognition: React.FC<{
  /** The stored address, or null when this browser does not know the player. */
  email: string | null;
  /** Clears the local email + subscribed flag. Nothing else. */
  onForget: () => void;
  /** Fired after a successful restore so the caller can re-read the streak. */
  onRestored?: (email: string, restored: boolean) => void;
  /** 0 → shortest viewport, 1 → full size. */
  scale?: number;
}> = ({ email, onForget, onRestored, scale = 1 }) => {
  const [confirming, setConfirming] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const masked = maskEmail(email);

  const lineStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: FONT_FAMILY_UI,
    fontWeight: FONT_WEIGHT_UI,
    fontSize: Math.round(11 + 2 * scale),
    lineHeight: 1.2,
    color: COLORS.inkMuted,
    textAlign: "center",
    // One row: the whole point is that it costs almost no height.
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };

  // The line itself. The restore modal is rendered separately, below, so a
  // successful restore (which populates `email` in the same batch) cannot
  // unmount the modal before its "Welcome back" line has been seen.
  const line =
    email && confirming ? (
      <p style={lineStyle} data-testid="daily-recognition">
        <span>Forget {masked} on this device?</span>
        <InlineAction
          testId="daily-forget-confirm"
          ariaLabel="Yes, forget this email on this device"
          onClick={() => {
            hapticTap();
            setConfirming(false);
            onForget();
          }}
        >
          Yes, forget
        </InlineAction>
        <span aria-hidden="true">·</span>
        <InlineAction
          testId="daily-forget-cancel"
          ariaLabel="Keep this email on this device"
          onClick={() => {
            hapticTap();
            setConfirming(false);
          }}
        >
          Keep
        </InlineAction>
      </p>
    ) : email ? (
      // (unchanged) signed-in line
      // eslint-disable-next-line react/jsx-no-useless-fragment
      <></>
    ) : null;
      <p style={lineStyle} data-testid="daily-recognition">
        <span>
          Playing as <span data-testid="daily-recognition-email">{masked}</span>
        </span>
        <InlineAction
          testId="daily-not-you"
          ariaLabel="Not you? Forget this email on this device"
          onClick={() => {
            hapticTap();
            setConfirming(true);
          }}
        >
          Not you?
        </InlineAction>
      </p>
    ) : (
      <p style={lineStyle} data-testid="daily-recognition">
        <span>Already playing?</span>
        <InlineAction
          testId="daily-restore-open"
          ariaLabel="Restore your streak with your email"
          onClick={() => {
            hapticTap();
            setRestoring(true);
          }}
        >
          Restore your streak.
        </InlineAction>
      </p>
    );

  return (
    <>
      {line}
      {restoring && (
        <DailyEmailModal
          mode="restore"
          onClose={() => setRestoring(false)}
          onSubscribed={(value, restored) => {
            onRestored?.(value, restored);
          }}
        />
      )}
    </>
  );
};

export default DailyRecognition;
