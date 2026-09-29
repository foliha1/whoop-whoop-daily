// ============================================================================
// HomeEmailSignup — the small reminder signup on the umbrella Home, below the
// tiles and above the legal footer. Same write path as every other signup:
// subscribeDaily → ac-subscribe (database first, then ActiveCampaign), with
// source "home". Eligibility lives in src/lib/homeSignup.ts.
// ============================================================================

import React, { useState } from "react";
import { isValidEmail, subscribeDaily } from "@/lib/dailySubscribe";
import { hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";
import { playSubscribed } from "@/lib/sounds";
import { trackDaily } from "@/lib/dailyEvents";
import { BORDER, COLORS, RADIUS, SPACE, buttonStyle, textStyle } from "@/lib/tokens";

const HomeEmailSignup: React.FC<{ mobile?: boolean; onSubscribed?: (email: string) => void }> = ({
  mobile = false,
  onSubscribed,
}) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    trackDaily("subscribe_shown", { props: { source: "home" } });
  }, []);

  const fail = (text: string) => {
    setStatus("error");
    setMessage(text);
    hapticError();
    inputRef.current?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    hapticTap();
    if (email.trim().length === 0) return fail("Add your email first.");
    if (!isValidEmail(email)) return fail("That doesn't look like an email.");
    setStatus("sending");
    setMessage(null);
    const ok = await subscribeDaily(email, undefined, "home");
    if (!ok) return fail("That didn't send. Try again.");
    setStatus("done");
    hapticSuccess();
    playSubscribed();
    trackDaily("subscribe_submitted", { props: { source: "home" } });
    onSubscribed?.(email.trim().toLowerCase());
  };

  const caption: React.CSSProperties = { ...textStyle("captionItalic", mobile), color: COLORS.inkMuted, textAlign: "center", margin: 0 };

  if (status === "done") {
    return <p role="status" data-testid="home-email-done" style={caption}>You're in. See you tomorrow.</p>;
  }

  return (
    <form onSubmit={submit} noValidate data-testid="home-email" aria-label="Daily reminder" style={{ display: "flex", flexDirection: "column", gap: SPACE[3], width: "100%" }}>
      <p id="home-email-label" style={caption}>Get a nudge when the next Daily drops.</p>
      <div style={{ display: "flex", gap: SPACE[3] }}>
        <input
          ref={inputRef}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={255}
          aria-labelledby="home-email-label"
          aria-invalid={status === "error" ? true : undefined}
          aria-describedby={message ? "home-email-error" : undefined}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") { setStatus("idle"); setMessage(null); }
          }}
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            fontSize: 16,
            height: 44,
            boxSizing: "border-box",
            padding: `0 ${SPACE[6]}px`,
            border: BORDER.heavy,
            borderRadius: RADIUS.sm,
            background: COLORS.surface,
            color: COLORS.ink,
          }}
        />
        <button
          type="submit"
          className="ww-press"
          disabled={status === "sending"}
          style={{ ...buttonStyle("secondary", "md"), height: 44, flex: "none", whiteSpace: "nowrap" }}
        >
          {status === "sending" ? "Sending…" : "Sign Me Up"}
        </button>
      </div>
      {message ? (
        <p id="home-email-error" role="alert" style={{ ...caption, fontStyle: "normal", color: COLORS.ink }}>{message}</p>
      ) : null}
    </form>
  );
};

export default HomeEmailSignup;
