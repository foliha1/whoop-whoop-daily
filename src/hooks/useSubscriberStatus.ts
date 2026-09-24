// ============================================================================
// useSubscriberStatus — is this player signed in (or, with sign-in off, has
// this browser signed up for the daily reminder)?
//
// The email is the verified account email from the session, never a typed
// address. "Forget" signs out. With sign-in off, `subscribed` follows the
// local reminder flag only, so the results box doesn't reappear after signup.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { getSessionEmail, onAccountChange, signOut, whenAccountReady } from "@/lib/account";
import { hasSubscribed } from "@/lib/dailySubscribe";
import { SIGN_IN_ENABLED } from "@/lib/featureFlags";

export function useSubscriberStatus(
  /** Fired when a stored session is found after mount. */
  onRecognized?: () => void
): {
  subscribed: boolean;
  /** The signed-in address, or null. Drives the "Playing as …" line. */
  email: string | null;
  /** Kept for callers: sign-in already updated the session. */
  markLocal: (email: string) => void;
  /** "Not you?" — signs out on this browser. */
  forgetLocal: () => void;
} {
  const [email, setEmail] = useState<string | null>(() => getSessionEmail());
  const [localSubscribed, setLocalSubscribed] = useState(() => hasSubscribed());

  useEffect(() => {
    let live = true;
    const initial = getSessionEmail();
    void whenAccountReady().then((found) => {
      if (!live) return;
      setEmail(found);
      if (found && !initial) onRecognized?.();
    });
    const off = onAccountChange((next) => {
      if (live) setEmail(next);
    });
    return () => {
      live = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markLocal = useCallback(() => {
    setEmail(getSessionEmail());
    setLocalSubscribed(hasSubscribed());
  }, []);

  const forgetLocal = useCallback(() => {
    void signOut();
    setEmail(null);
  }, []);

  const subscribed = SIGN_IN_ENABLED ? email !== null : email !== null || localSubscribed;
  return { subscribed, email, markLocal, forgetLocal };
}
