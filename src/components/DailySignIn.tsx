// ============================================================================
// DailySignIn — optional sign-in by a 6-digit email code.
//
// Steps: email → code → (first time, not already on the list) a separate
// affirmative reminder choice → done. Signing in joins the updates list only; reminders need a yes.
// ============================================================================

import React, { useEffect, useState } from "react";
import { isValidEmail } from "@/lib/dailySubscribe";
import {
  sendSignInCode,
  isValidSignInCode,
  setReminder,
  verifySignInCode,
  type SignInFailure,
} from "@/lib/account";
import { hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";
import { trackDaily } from "@/lib/dailyEvents";
import { BORDER, COLORS, FONT_FAMILY, RAW, RADIUS, SPACE, buttonStyle } from "@/lib/tokens";

const GEIST = '"Geist", "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

const bodyStyle: React.CSSProperties = {
  fontFamily: GEIST,
  fontWeight: 500,
  fontSize: 14,
  lineHeight: 1.45,
  color: COLORS.ink,
  margin: 0,
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: FONT_FAMILY,
  fontSize: 20,
  lineHeight: 1.2,
  color: COLORS.ink,
};

const inputStyle: React.CSSProperties = {
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
};

const FAILURE_COPY: Record<SignInFailure, string> = {
  invalid_code: "That code didn't match. Check it and try again.",
  expired: "That code has expired. Send a new one.",
  rate_limited: "Too many tries. Wait a minute and try again.",
  send_error: "We couldn't send the code. Try again.",
};

const RESEND_COOLDOWN_SECONDS = 60;

type Step = "email" | "code" | "reminder" | "done";

const DailySignIn: React.FC<{
  autoFocus?: boolean;
  /** Keep text readable when this form sits directly on the fixed orange results panel. */
  onAccentSurface?: boolean;
  /**
   * The Daily results place this form on a fixed blue panel so it stands apart
   * from the score: cream ink, a bigger ask, and a red main button.
   */
  onBlueSurface?: boolean;
  onSignedIn?: (email: string, restored: boolean) => void;
  onChoiceRequiredChange?: (required: boolean) => void;
}> = ({ autoFocus = false, onAccentSurface = false, onBlueSurface = false, onSignedIn, onChoiceRequiredChange }) => {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState(0);
  const [reminderYes, setReminderYes] = useState<boolean | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [restored, setRestored] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Fixed ink for fixed panels: theme ink would vanish on brand fills at night.
  const panelInk = onBlueSurface ? COLORS.onBlue : onAccentSurface ? RAW.warmBlack : null;
  const panelBodyStyle: React.CSSProperties = panelInk
    ? { ...bodyStyle, color: panelInk }
    : bodyStyle;
  const panelHeadingStyle: React.CSSProperties = panelInk
    ? { ...headingStyle, color: panelInk }
    : headingStyle;
  const mutedInk = panelInk ?? COLORS.inkMuted;
  // On the blue panel saving is the screen's main action, so it takes red.
  const mainButton = onBlueSurface ? "primary" : "secondary";

  // Instrumentation only, once per mount: lets the admin report compare how
  // many players saw the ask with how many signed in. Queued, never awaited.
  useEffect(() => {
    trackDaily("subscribe_shown", { props: { source: "signin" } });
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  React.useEffect(() => {
    if (autoFocus || step === "code") inputRef.current?.focus();
  }, [autoFocus, step]);

  const fail = (message: string) => {
    setError(message);
    hapticError();
    inputRef.current?.focus();
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    hapticTap();
    if (!isValidEmail(email)) return fail("That doesn't look like an email.");
    setBusy(true);
    setError(null);
    const res = await sendSignInCode(email);
    setBusy(false);
    if ("reason" in res) return fail(FAILURE_COPY[res.reason]);
    setResendSeconds(RESEND_COOLDOWN_SECONDS);
    setResendStatus(null);
    setStep("code");
  };

  const resendCode = async () => {
    if (busy || resendSeconds > 0) return;
    hapticTap();
    setBusy(true);
    setError(null);
    setResendStatus(null);
    const res = await sendSignInCode(email);
    setBusy(false);
    if ("reason" in res) {
      const message = res.reason === "rate_limited"
        ? FAILURE_COPY.rate_limited
        : "We couldn't resend the code. Try again.";
      setError(message);
      hapticError();
      return;
    }
    setResendSeconds(RESEND_COOLDOWN_SECONDS);
    setResendStatus("A new code is on its way.");
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    hapticTap();
    if (!isValidSignInCode(code)) return fail("Enter the 6-digit code.");
    setBusy(true);
    setError(null);
    const res = await verifySignInCode(email, code);
    setBusy(false);
    if ("reason" in res) return fail(FAILURE_COPY[res.reason]);
    hapticSuccess();
    const merge = "merge" in res ? res.merge : null;
    setGames(merge?.games ?? 0);
    const clean = email.trim().toLowerCase();
    const restoredHistory = (merge?.games ?? 0) > 0;
    setVerifiedEmail(clean);
    setRestored(restoredHistory);
    // Existing subscribers already said yes; anyone who answered already, too.
    if (merge && !merge.wasSubscriber && !merge.reminderAnswered) {
      onChoiceRequiredChange?.(true);
      setStep("reminder");
    } else {
      setStep("done");
      onSignedIn?.(clean, restoredHistory);
    }
  };

  const answer = async (yes: boolean) => {
    hapticTap();
    setBusy(true);
    const saved = await setReminder(yes, "post_signin");
    setBusy(false);
    if (!saved) {
      fail("We couldn't save that choice. Try again.");
      return;
    }
    setReminderYes(yes);
    onChoiceRequiredChange?.(false);
    setStep("done");
    onSignedIn?.(verifiedEmail, restored);
  };

  if (step === "done") {
    return (
      <div data-testid="signin-done" style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SPACE[2], textAlign: "center" }}>
        <p style={panelHeadingStyle}>
          {games > 1 ? `Welcome back — we found ${games} games.` : "You're signed in."}
        </p>
        <p style={{ ...panelBodyStyle, color: mutedInk }}>
          {reminderYes ? "See you tomorrow morning." : "Your score now follows you to any device."}
        </p>
      </div>
    );
  }

  if (step === "reminder") {
    return (
      <div data-testid="signin-reminder" style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SPACE[4] }}>
        <h2 style={panelHeadingStyle}>Want to get a daily reminder?</h2>
        <p style={panelBodyStyle}>One email each morning to help you keep your Daily streak going. Unsubscribe any time.</p>
        <button
          type="button"
          className="ww-press"
          disabled={busy}
          onClick={() => void answer(true)}
          style={{ ...buttonStyle(mainButton, "lg", { fullWidth: true }), width: "100%" }}
        >
          Sounds good!
        </button>
        <button
          type="button"
          className="ww-press"
          disabled={busy}
          onClick={() => void answer(false)}
          style={{ ...buttonStyle("ghost", "lg", { fullWidth: true }), width: "100%" }}
        >
          No thanks.
        </button>
        {error && (
          <p role="alert" style={{ ...panelBodyStyle, fontStyle: "italic" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const isCode = step === "code";
  return (
    <form
      onSubmit={isCode ? submitCode : submitEmail}
      noValidate
      data-testid="signin-form"
      style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: SPACE[4] }}
    >
      <h2 style={onBlueSurface && !isCode ? { ...panelHeadingStyle, fontSize: 28 } : panelHeadingStyle}>
        {isCode ? "Check your email." : onBlueSurface ? "Save your score!" : "Save your score."}
      </h2>
      <p style={panelBodyStyle}>
        {isCode
          ? `We sent a 6-digit code to ${email.trim().toLowerCase()}.`
          : onBlueSurface
            ? "Keep your streak and points on any device. No password, just a code."
            : "Sign in with your email to keep your streak and points on any device. No password, just a code."}
      </p>
      {isCode ? (
        <input
          key="code"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label="6-digit code"
          placeholder="123456"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }}
          style={{ ...inputStyle, letterSpacing: "0.3em", textAlign: "center" }}
        />
      ) : (
        <input
          key="email"
          ref={inputRef}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={255}
          aria-label="Email address"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          style={inputStyle}
        />
      )}
      <button
        type="submit"
        className="ww-press"
        disabled={busy}
        style={{
          ...buttonStyle(mainButton, "lg", { fullWidth: true }),
          width: "100%",
        }}
      >
        {isCode ? "Sign In" : onBlueSurface ? "Save My Score" : "Send Code"}
      </button>
      {isCode && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE[2] }}>
          <button
            type="button"
            disabled={busy || resendSeconds > 0}
            onClick={() => void resendCode()}
            style={{ ...buttonStyle("quiet", "sm", { disabled: resendSeconds > 0 }), minHeight: 44 }}
          >
            {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
              setResendStatus(null);
            }}
            style={{ ...buttonStyle("quiet", "sm"), minHeight: 44 }}
          >
            Use a different email
          </button>
          {resendStatus && <p role="status" style={{ ...panelBodyStyle, fontSize: 13, color: mutedInk }}>{resendStatus}</p>}
        </div>
      )}
      <p style={{ ...panelBodyStyle, fontSize: 12, color: mutedInk }}>
        By adding your email address, you agree to receive occasional updates from the Whoop! Whoop! team. Opt-out at any time (and still track your scores).{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: mutedInk, textDecoration: "underline" }}>
          Privacy
        </a>
        .
      </p>
      {error && (
        <p role="alert" style={{ ...panelBodyStyle, fontStyle: "italic" }}>
          {error}
        </p>
      )}
    </form>
  );
};

export default DailySignIn;
