import React, { useState } from "react";
import { Check, AlertCircle, LoaderCircle } from "lucide-react";
import { AppButton } from "@/components/ui/AppButton";
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
  source?: "daily_result" | "landing" | "prelaunch" | "restore" | "home";
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
  /** True only while a newly verified player must make the reminder choice. */
  onChoiceRequiredChange?: (required: boolean) => void;
  /** The result screen places this form directly on its fixed orange panel. */
  onAccentSurface?: boolean;
  /** Extra content under the body (the lobby Subscribe benefits list). */
  intro?: React.ReactNode;
  className?: string;
  onDone?: () => void;
}> = ({
  source,
  onSubscribed,
  heading = "Get tomorrow's grid.",
  body = "A new game every morning, plus the odd game update.",
  note = "New here, or coming back? Drop in your email.",
  submitLabel = "Sign Me Up",
  successMessage,
  autoFocus = false,
  onChoiceRequiredChange,
  onAccentSurface = false,
  intro,
  className,
  onDone,
}) => {
  // The results box and the lobby restore are sign-in; pre-launch and the
  // landing page stay an explicit reminder signup. With sign-in off, every box
  // is a reminder signup — and never promises a restore.
  const reminderOnly = source === "prelaunch" || source === "landing" || source === "home";
  if (SIGN_IN_ENABLED && !reminderOnly) {
    return (
      <DailySignIn
        autoFocus={autoFocus}
        onAccentSurface={onAccentSurface}
        onSignedIn={onSubscribed}
        onChoiceRequiredChange={onChoiceRequiredChange}
      />
    );
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
        intro,
        className,
        onDone,
      }}
    />
  );
};

const ReminderSignup: React.FC<{
  source?: "daily_result" | "landing" | "prelaunch" | "restore" | "home";
  onSubscribed?: (email: string, restored: boolean) => void;
  heading?: string;
  body?: string;
  note?: string | null;
  submitLabel?: string;
  successMessage?: string;
  autoFocus?: boolean;
  intro?: React.ReactNode;
  className?: string;
  onDone?: () => void;
}> = ({ source, onSubscribed, heading, body, note, submitLabel, successMessage, autoFocus = false, intro, className, onDone }) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [restored, setRestored] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const doneRef = React.useRef<HTMLButtonElement>(null);
  const errorId = React.useId();
  const [invalidEmail, setInvalidEmail] = useState(false);
  const eventSource = source ?? "daily_result";

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  React.useEffect(() => {
    if (status === "done") doneRef.current?.focus();
  }, [status]);

  // Instrumentation only — queued, never awaited, never surfaced.
  React.useEffect(() => {
    trackDaily("subscribe_shown", { props: { source: eventSource } });
  }, [eventSource]);



  const fail = (message: string) => {
    setStatus("error");
    setErrorMessage(message);
    setInvalidEmail(true);
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
    setInvalidEmail(false);
    // Asked before the write: afterwards this address owns today's row too, so
    // "has history" would always be true.
    const returning = false;
    let ok = false;
    try {
      ok = await subscribeDaily(email, undefined, source);
    } catch {
      // Network failures use the same retry state; never leave the form busy.
    }
    if (ok) {
      setRestored(returning);
      setStatus("done");
      hapticSuccess();
      playSubscribed();
      trackDaily("subscribe_submitted", { props: { source: eventSource } });
      onSubscribed?.(email.trim().toLowerCase(), returning);

    } else {

      setStatus("error");
      setErrorMessage("We couldn't confirm your signup. Please try again.");
      hapticError();
    }
  };


  if (status === "done") {
    if (onDone) return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE[12], textAlign: "center", paddingBlock: SPACE[8] }}>
        <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 64, height: 64, borderRadius: "50%", background: COLORS.success, color: COLORS.ink }}><Check size={32} strokeWidth={2.5} /></span>
        <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: SPACE[8], width: "100%" }}>
          <h2 style={{ margin: 0, fontFamily: FONT_FAMILY, fontSize: 28, lineHeight: 1.2, color: COLORS.ink }}>You're subscribed!</h2>
          <p style={bodyStyle}>Daily reminders and occasional game updates will go to:</p>
          <p style={{ ...bodyStyle, overflowWrap: "anywhere", fontWeight: 700 }}>{email.trim().toLowerCase()}</p>
          <p style={{ ...bodyStyle, color: COLORS.inkMuted }}>See you at tomorrow's grid. You can unsubscribe from any email.</p>
        </div>
        <AppButton ref={doneRef} type="button" roleStyle="secondary" size="lg" fullWidth onClick={onDone}>Let's play</AppButton>
      </div>
    );
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
      className={className}
      onSubmit={submit}
      noValidate
      aria-busy={status === "sending"}
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
      {intro}
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
        aria-invalid={invalidEmail ? true : undefined}
        aria-describedby={status === "error" ? errorId : undefined}
        readOnly={status === "sending"}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status === "error") {
            setStatus("idle");
            setErrorMessage(null);
            setInvalidEmail(false);
          }
        }}

        style={{
          ...bodyStyle,
          fontSize: 16,
          width: "100%",
          boxSizing: "border-box",
          minHeight: 44,
          padding: `0 ${SPACE[8]}px`,
          border: invalidEmail ? `2px solid ${COLORS.redText}` : BORDER.heavy,
          borderRadius: RADIUS.sm,
          background: COLORS.surface,
          color: COLORS.ink,
        }}
      />
      {status === "error" && errorMessage && (
        <p id={errorId} role="alert" style={{ ...bodyStyle, color: COLORS.redText, display: "flex", alignItems: "flex-start", gap: SPACE[4] }}>
          <AlertCircle size={18} aria-hidden="true" style={{ flexShrink: 0 }} />{errorMessage}
        </p>
      )}
      <p style={{ ...bodyStyle, fontSize: 12, color: COLORS.inkMuted }}>
        The daily puzzle, plus the odd game update.{" "}
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
      <AppButton
        type="submit"
        roleStyle="secondary"
        size="lg"
        fullWidth
        className="ww-press"
        disabled={status === "sending"}
        style={{
          ...buttonStyle("secondary", "lg", { fullWidth: true }),
          width: "100%",
          cursor: status === "sending" ? "default" : "pointer",
        }}
      >
        {status === "sending" ? <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: SPACE[4] }}><LoaderCircle size={18} aria-hidden="true" className="ww-progress-spinner" />Subscribing…</span> : status === "error" && !invalidEmail ? "Try again" : submitLabel}
      </AppButton>
    </form>
  );
};

export default DailyEmailCapture;
