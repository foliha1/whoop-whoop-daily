import React, { useState } from "react";
import { isValidEmail, subscribeDaily } from "@/lib/dailySubscribe";
import DailySignIn from "@/components/DailySignIn";
import { hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";
import { playSubscribed } from "@/lib/sounds";
import { trackDaily } from "@/lib/dailyEvents";
import { BORDER, COLORS, FONT_FAMILY, RADIUS, SPACE, buttonStyle } from "@/lib/tokens";
import { SIGN_IN_ENABLED } from "@/lib/featureFlags";


const GEIST = '"Geist", "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

const bodyStyle: React.CSSProperties = {
  fontFamily: GEIST,
  fontWeight: 500,
  fontSize: 14,
  lineHeight: 1.45,
  color: COLORS.ink,
  margin: 0,
};

/**
 * Email capture on the daily result screen. Additive by design — it never
 * blocks or gates the result, and a duplicate signup reads as a success.
 *
 * The copy is overridable so the pre-launch overlay can speak to its own
 * situation without duplicating the form, the validation or the AC path.
 */
const DailyEmailCapture: React.FC<{
  source?: "daily_result" | "landing" | "prelaunch" | "restore";
  /** Fired after a successful signup so the caller can re-read streak/stats. */
  onSubscribed?: (email: string, restored: boolean) => void;
  heading?: string;
  body?: string;
  /** Italic second line. Pass null to drop it. */
  note?: string | null;
  submitLabel?: string;
  /** Shown after a successful signup, in place of the form. */
  successMessage?: string;
  /** Focus the field on mount — used when the form opens in an overlay. */
  autoFocus?: boolean;
}> = ({
  source,
  onSubscribed,
  heading = "Get tomorrow's grid.",
  body = "A new game every morning. Nothing else.",
  note = "New here, or coming back? Drop in your email.",
  submitLabel = "Sign Me Up",
  successMessage,
  autoFocus = false,
}) => {
  // The results box and the lobby restore are sign-in; pre-launch and the
  // landing page stay an explicit reminder signup. With sign-in off, every box
  // is a reminder signup — and never promises a restore.
  const reminderOnly = source === "prelaunch" || source === "landing";
  if (SIGN_IN_ENABLED && !reminderOnly) {
    return <DailySignIn autoFocus={autoFocus} onSignedIn={onSubscribed} />;
  }
  return (
    <ReminderSignup
      {...{
        source: reminderOnly ? source : "daily_result",
        onSubscribed,
        heading,
        body,
        note: reminderOnly ? note : null,
        submitLabel,
        successMessage,
        autoFocus,
      }}
    />
  );
};

const ReminderSignup: React.FC<{
  source?: "daily_result" | "landing" | "prelaunch" | "restore";
  onSubscribed?: (email: string, restored: boolean) => void;
  heading?: string;
  body?: string;
  note?: string | null;
  submitLabel?: string;
  successMessage?: string;
  autoFocus?: boolean;
}> = ({ source, onSubscribed, heading, body, note, submitLabel, successMessage, autoFocus = false }) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [restored, setRestored] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const eventSource = source ?? "daily_result";

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Instrumentation only — queued, never awaited, never surfaced.
  React.useEffect(() => {
    trackDaily("subscribe_shown", { props: { source: eventSource } });
  }, [eventSource]);



  const fail = (message: string) => {
    setStatus("error");
    setErrorMessage(message);
    hapticError();
    inputRef.current?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    hapticTap();
    if (email.trim().length === 0) {
      fail("Add your email first.");
      return;
    }
    if (!isValidEmail(email)) {
      fail("That doesn't look like an email.");
      return;
    }
    setStatus("sending");
    setErrorMessage(null);
    // Asked before the write: afterwards this address owns today's row too, so
    // "has history" would always be true.
    const returning = false;
    const ok = await subscribeDaily(email, undefined, source);
    if (ok) {
      setRestored(returning);
      setStatus("done");
      hapticSuccess();
      playSubscribed();
      trackDaily("subscribe_submitted", { props: { source: eventSource } });
      onSubscribed?.(email.trim().toLowerCase(), returning);

    } else {

      setStatus("error");
      setErrorMessage("That didn't send. Try again.");
      hapticError();
    }
  };


  if (status === "done") {
    return (
      <p
        style={{
          alignSelf: "stretch",
          margin: 0,
          fontFamily: FONT_FAMILY,
          fontSize: 20,
          lineHeight: 1.2,
          color: COLORS.ink,
          textAlign: "center",
        }}
      >
        {restored
          ? "Welcome back."
          : (successMessage ?? "You're in. See you tomorrow.")}
      </p>
    );
  }


  return (
    <form
      onSubmit={submit}
      noValidate
      style={{
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        gap: SPACE[4],
      }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily: FONT_FAMILY,
          fontSize: 20,
          lineHeight: 1.2,
          color: COLORS.ink,
        }}
      >
        {heading}
      </h2>
      <p style={bodyStyle}>{body}</p>
      {note && (
        <p style={{ ...bodyStyle, fontStyle: "italic" }}>
          {note}
        </p>
      )}

      <input
        ref={inputRef}
        type="email"
        inputMode="email"
        autoComplete="email"
        maxLength={255}
        aria-label="Email address"
        aria-invalid={status === "error" ? true : undefined}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status === "error") {
            setStatus("idle");
            setErrorMessage(null);
          }
        }}

        style={{
          ...bodyStyle,
          fontSize: 16,
          width: "100%",
          boxSizing: "border-box",
          minHeight: 44,
          padding: `0 ${SPACE[8]}px`,
          border: BORDER.heavy,
          borderRadius: RADIUS.sm,
          background: COLORS.surface,
          color: COLORS.ink,
        }}
      />
      <p style={{ ...bodyStyle, fontSize: 12, color: COLORS.inkMuted }}>
        We only send the daily puzzle.{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: COLORS.inkMuted, textDecoration: "underline" }}
        >
          Privacy
        </a>
        .
      </p>
      <button
        type="submit"
        className="ww-press"
        disabled={status === "sending"}
        style={{
          ...buttonStyle("secondary", "lg", { fullWidth: true, disabled: status === "sending" }),
          width: "100%",
          cursor: status === "sending" ? "default" : "pointer",
          opacity: status === "sending" ? 0.7 : 1,
        }}
      >
        {submitLabel}
      </button>
      {status === "error" && errorMessage && (
        <p role="alert" style={{ ...bodyStyle, color: COLORS.ink, fontStyle: "italic" }}>
          {errorMessage}
        </p>
      )}
    </form>
  );
};

export default DailyEmailCapture;
