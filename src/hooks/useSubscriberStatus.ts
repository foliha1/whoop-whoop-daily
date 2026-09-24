// ============================================================================
// useSubscriberStatus — is this player signed in?
//
// The name is kept for callers. The email is the verified account email from
// the session, never a typed address. "Forget" signs out.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { getSessionEmail, onAccountChange, signOut, whenAccountReady } from "@/lib/account";

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
  }, []);

  const forgetLocal = useCallback(() => {
    void signOut();
    setEmail(null);
  }, []);

  return { subscribed: email !== null, email, markLocal, forgetLocal };
}
