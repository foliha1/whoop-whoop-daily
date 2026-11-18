import React from "react";
import { useNavigate } from "react-router-dom";
import ReleaseAnnouncement, { hasSeenAnnouncement } from "@/components/ReleaseAnnouncement";
import { useIsMobile } from "@/hooks/use-mobile";
import { BORDER, COLORS, RADIUS, SPACE, textStyle } from "@/lib/tokens";
import PreorderCardsPhoto from "@/components/PreorderCardsPhoto";
import { isValidEmail } from "@/lib/dailySubscribe";
import { subscribeToUpdates } from "@/lib/updatesSubscribe";

export const PREORDER_SUBSCRIBER_ANNOUNCEMENT = {
  seenKey: "ww-preorder-announcement-v1",
  headline: "Whoop! Whoop! is coming to the table.",
  intro: "The memory game where the rules keep changing, now as a real card game. 48 cards, a Match Die, and a canvas drawstring bag.",
  offer: "Pre-order for $35 with free shipping.\nShips early December 2026.",
  primary: "Pre-order now",
  secondary: "Not now",
} as const;

export const PREORDER_SIGNUP_ANNOUNCEMENT = {
  seenKey: "ww-preorder-announcement-v2",
  headline: "Play Whoop! Whoop! IRL",
  intro: "Preorders are now live exclusively for the Whoop! Whoop! community. Enter your email to get the details.",
  primary: "Get the details",
  secondary: "Not now",
} as const;

export type PreorderAnnouncementVariant = "signup" | "subscriber";

/** The original announcement remains a one-time message for updates-list members. */
export function shouldShowSubscriberPreorderNote(): boolean {
  return !hasSeenAnnouncement(PREORDER_SUBSCRIBER_ANNOUNCEMENT.seenKey);
}

/** Wait for account restoration before choosing the signup or subscriber version. */
export function preorderAnnouncementVariant(
  accountReady: boolean,
  account: string | null,
  updatesSubscribed: boolean,
): PreorderAnnouncementVariant | null {
  if (!accountReady) return null;
  return account !== null || updatesSubscribed ? "subscriber" : "signup";
}

/** The lobby stays clear while the intro is visible, including its loading state. */
export function introAllowsPreorderAnnouncement(
  introStatus: "running" | "skipped" | "complete" | "timeout" | "none",
): boolean {
  return introStatus !== "running";
}

const PreorderAnnouncement: React.FC<{
  variant: PreorderAnnouncementVariant;
  onClose: () => void;
}> = ({ variant, onClose }) => {
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const signup = variant === "signup";
  const content = signup ? PREORDER_SIGNUP_ANNOUNCEMENT : PREORDER_SUBSCRIBER_ANNOUNCEMENT;
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

  const openPreorder = () => {
    onClose();
    navigate("/preorder");
  };

  return (
    <ReleaseAnnouncement
      seenKey={content.seenKey}
      title={content.headline}
      primaryLabel={signup && busy ? "Joining..." : content.primary}
      primaryDisabled={signup && busy}
      onPrimaryBeforeClose={signup ? subscribe : undefined}
      secondaryLabel={content.secondary}
      onPrimary={openPreorder}
      onDismiss={onClose}
      initialFocusSelector={signup ? "#preorder-announcement-email" : undefined}
      testId="preorder-announcement"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
        <h2 style={{ ...textStyle("hero", mobile), margin: 0, color: COLORS.ink, lineHeight: 1.05, letterSpacing: 0 }}>
          {content.headline}
        </h2>
        <PreorderCardsPhoto maxWidth={420} sizes="(max-width: 640px) 80vw, 420px" />
        <p style={{ ...textStyle("body", mobile), margin: 0, color: COLORS.ink }}>
          {content.intro}
        </p>
        {signup ? (
          <form
            data-testid="preorder-updates-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void subscribe().then((subscribed) => {
                if (subscribed) openPreorder();
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
        ) : null}
      </div>
      {!signup ? (
        <p style={{ ...textStyle("subhead", mobile), margin: 0, color: COLORS.ink, whiteSpace: "pre-line" }}>
          {PREORDER_SUBSCRIBER_ANNOUNCEMENT.offer}
        </p>
      ) : null}
    </ReleaseAnnouncement>
  );
};

export default PreorderAnnouncement;
