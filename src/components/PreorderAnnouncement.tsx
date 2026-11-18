import React from "react";
import { useNavigate } from "react-router-dom";
import ReleaseAnnouncement, { hasSeenAnnouncement } from "@/components/ReleaseAnnouncement";
import { useIsMobile } from "@/hooks/use-mobile";
import { BORDER, COLORS, RADIUS, SPACE, textStyle } from "@/lib/tokens";
import PreorderCardsPhoto from "@/components/PreorderCardsPhoto";
import { isValidEmail } from "@/lib/dailySubscribe";
import { subscribeToUpdates } from "@/lib/updatesSubscribe";

export const PREORDER_ANNOUNCEMENT = {
  seenKey: "ww-preorder-announcement-v2",
  headline: "Play Whoop! Whoop! IRL",
  intro: "Preorders are now live exclusively for the Whoop! Whoop! community. Enter your email to get the details.",
  primary: "Get the details",
  secondary: "Not now",
} as const;

/** One announcement per device; dismissing or completing signup marks it seen. */
export function shouldShowPreorderNote(): boolean {
  return !hasSeenAnnouncement(PREORDER_ANNOUNCEMENT.seenKey);
}

/** The lobby stays clear while the intro is visible, including its loading state. */
export function introAllowsPreorderAnnouncement(
  introStatus: "running" | "skipped" | "complete" | "timeout" | "none",
): boolean {
  return introStatus !== "running";
}

/** Never flash the signed-out popup while a stored account is being restored. */
export function accountAllowsPreorderAnnouncement(accountReady: boolean, account: string | null): boolean {
  return accountReady && account === null;
}

const PreorderAnnouncement: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const subscribe = async (): Promise<boolean> => {
    if (busy) return false;
    if (!isValidEmail(email)) {
      setError("That doesn't look like an email.");
      inputRef.current?.focus();
      return false;
    }
    setBusy(true);
    setError(null);
    const subscribed = await subscribeToUpdates(email, "preorder");
    setBusy(false);
    if (!subscribed) {
      setError("We couldn't add you. Try again.");
      inputRef.current?.focus();
      return false;
    }
    return true;
  };

  const completeSignup = () => {
    try { localStorage.setItem(PREORDER_ANNOUNCEMENT.seenKey, "1"); } catch { /* storage unavailable */ }
    onClose();
    navigate("/preorder");
  };

  return (
    <ReleaseAnnouncement
      seenKey={PREORDER_ANNOUNCEMENT.seenKey}
      title={PREORDER_ANNOUNCEMENT.headline}
      primaryLabel={busy ? "Joining..." : PREORDER_ANNOUNCEMENT.primary}
      primaryDisabled={busy}
      onPrimaryBeforeClose={subscribe}
      secondaryLabel={PREORDER_ANNOUNCEMENT.secondary}
      onPrimary={completeSignup}
      onDismiss={onClose}
      initialFocusSelector="#preorder-announcement-email"
      testId="preorder-announcement"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
        <h2 style={{ ...textStyle("hero", mobile), margin: 0, color: COLORS.ink, lineHeight: 1.05, letterSpacing: 0 }}>
          {PREORDER_ANNOUNCEMENT.headline}
        </h2>
        <PreorderCardsPhoto maxWidth={420} sizes="(max-width: 640px) 80vw, 420px" />
        <p style={{ ...textStyle("body", mobile), margin: 0, color: COLORS.ink }}>
          {PREORDER_ANNOUNCEMENT.intro}
        </p>
        <form
          data-testid="preorder-updates-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void subscribe().then((subscribed) => {
              if (subscribed) completeSignup();
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: SPACE[3] }}
        >
          <label htmlFor="preorder-announcement-email" style={{ ...textStyle("caption", mobile), color: COLORS.ink }}>
            Email address
          </label>
          <input
            ref={inputRef}
            id="preorder-announcement-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={255}
            placeholder="you@example.com"
            value={email}
            disabled={busy}
            aria-describedby={error ? "preorder-announcement-error" : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            style={{
              ...textStyle("body", mobile),
              width: "100%",
              minHeight: 48,
              boxSizing: "border-box",
              padding: `0 ${SPACE[4]}px`,
              border: BORDER.heavy,
              borderRadius: RADIUS.sm,
              background: COLORS.surface,
              color: COLORS.ink,
              fontSize: 16,
            }}
          />
          <p style={{ ...textStyle("caption", mobile), margin: 0, color: COLORS.inkMuted }}>
            By signing up, you agree to receive occasional Whoop! Whoop! updates. Unsubscribe any time.{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.inkMuted }}>
              Privacy
            </a>
            .
          </p>
          {error ? (
            <p id="preorder-announcement-error" role="alert" style={{ ...textStyle("caption", mobile), margin: 0, color: COLORS.ink }}>
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </ReleaseAnnouncement>
  );
};

export default PreorderAnnouncement;
