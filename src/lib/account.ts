// ============================================================================
// Optional accounts — sign-in by a 6-digit email code (no links, no passwords).
//
// Identity is always resolved on the server from the session; the email held
// here is only for display ("Signed in as f•••@…") and for choosing which
// requests to make. Nothing here is ever trusted as proof of who someone is.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitor";
import { trackDaily } from "@/lib/dailyEvents";
import { isAccountOwnedRecord } from "@/lib/daily";

let sessionEmail: string | null = null;
let sessionUserId: string | null = null;
let resolved = false;
const listeners = new Set<(email: string | null) => void>();
let readyResolve: (email: string | null) => void = () => {};
const ready = new Promise<string | null>((res) => {
  readyResolve = res;
});

function publish(next: string | null) {
  const clean = next ? next.trim().toLowerCase() : null;
  const changed = clean !== sessionEmail;
  sessionEmail = clean;
  if (!resolved) {
    resolved = true;
    readyResolve(clean);
  }
  if (changed) listeners.forEach((fn) => fn(clean));
}

/**
 * Identity boundary. Any sign-out, or a switch from one account to another,
 * clears account-owned local state — however the sign-out was triggered, so a
 * direct auth call elsewhere can never skip it.
 */
export function handleAuthIdentity(event: string, nextUserId: string | null): boolean {
  const prev = sessionUserId;
  sessionUserId = nextUserId;
  const crossed = event === "SIGNED_OUT" || (prev !== null && prev !== nextUserId);
  if (crossed) clearLocalPlayerData();
  return crossed;
}

// Legacy note: this module once wiped the typed-email keys ("ww_daily_email",
// "ww_daily_subscribed") on import, treating them as identity. That wipe also
// erased the live reminder flag every load, so subscribed players were asked
// for their email again on every visit. Identity is resolved from the session
// alone; those keys are owned by dailySubscribe (clearSubscribed forgets them
// explicitly) and nothing reads the stored email. Nothing is removed here.

try {
  supabase.auth.onAuthStateChange((event, session) => {
    handleAuthIdentity(event, session?.user?.id ?? null);
    publish(session?.user?.email ?? null);
  });
  void supabase.auth
    .getUser()
    .then(({ data }) => {
      if (sessionUserId === null && data.user?.id) sessionUserId = data.user.id;
      publish(data.user?.email ?? null);
    })
    .catch(() => publish(null));
} catch {
  publish(null);
}

/** The signed-in user id, or null. Synchronous; may be null until ready. */
export function getSessionUserId(): string | null {
  return sessionUserId;
}

/** The signed-in email, or null. Synchronous; may be null until ready. */
export function getSessionEmail(): string | null {
  return sessionEmail;
}

/** Resolves once the stored session has been checked. */
export function whenAccountReady(): Promise<string | null> {
  return ready;
}

export function onAccountChange(fn: (email: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type SignInFailure = "invalid_code" | "expired" | "rate_limited" | "send_error";
// Must match the Email OTP length configured in the auth settings (6 digits).
export const isValidSignInCode = (code: string): boolean => /^[0-9]{6}$/.test(code.trim());

function classify(message: string | undefined, sending: boolean): SignInFailure {
  const m = (message ?? "").toLowerCase();
  if (m.includes("rate") || m.includes("too many") || m.includes("429")) return "rate_limited";
  if (sending) return "send_error";
  if (m.includes("expired")) return "expired";
  return "invalid_code";
}

export async function sendSignInCode(email: string): Promise<{ ok: true } | { ok: false; reason: SignInFailure }> {
  trackDaily("signin_started");
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    if (error) {
      const reason = classify(error.message, true);
      trackDaily("signin_failed", { props: { reason } });
      return { ok: false, reason };
    }
    trackDaily("signin_code_sent");
    return { ok: true };
  } catch {
    trackDaily("signin_failed", { props: { reason: "send_error" } });
    return { ok: false, reason: "send_error" };
  }
}

export interface MergeResult {
  firstSignIn: boolean;
  games: number;
  wasSubscriber: boolean;
  reminderAnswered: boolean;
}

/** Links this browser to the signed-in account and merges its history. */
export async function linkDeviceAndMerge(): Promise<MergeResult | null> {
  try {
    const { data, error } = await supabase.rpc("link_device_and_merge", {
      p_visitor_id: getVisitorId(),
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      firstSignIn: !!row.first_signin,
      games: Number(row.games ?? 0),
      wasSubscriber: !!row.was_subscriber,
      reminderAnswered: !!row.reminder_answered,
    };
  } catch {
    return null;
  }
}

export async function verifySignInCode(
  email: string,
  code: string
): Promise<{ ok: true; merge: MergeResult | null } | { ok: false; reason: SignInFailure }> {
  if (!isValidSignInCode(code)) return { ok: false, reason: "invalid_code" };
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    if (error || !data.session) {
      const reason = classify(error?.message, false);
      trackDaily("signin_failed", { props: { reason } });
      return { ok: false, reason };
    }
    publish(data.session.user.email ?? null);
    const merge = await linkDeviceAndMerge();
    trackDaily("signin_verified", {
      props: { first_signin: merge?.firstSignIn ?? null, games: merge?.games ?? null },
    });
    return { ok: true, merge };
  } catch {
    trackDaily("signin_failed", { props: { reason: "invalid_code" } });
    return { ok: false, reason: "invalid_code" };
  }
}

/** Keys kept on sign-out: device preferences, not player identity or history. */
const KEEP_ON_SIGN_OUT = new Set([
  "ww_music_enabled",
  "ww_sfx_enabled",
  "ww_intro_seen",
  "ww_classic_demo_seen",
  "ww_daily_howto_seen",
  "ww_display_name",
]);

/** Forgets this browser's player identity and history, keeping preferences. */
export function clearLocalPlayerData(): void {
  try {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith("ww_") &&
          !KEEP_ON_SIGN_OUT.has(k) &&
          // The browser's own played-game records stay so today's Daily
          // can't be replayed; an account's records leave with the account.
          !(k.startsWith("ww_daily_whoop-") && !isAccountOwnedRecord(localStorage.getItem(k)))
      )
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/**
 * Signs out and disconnects this browser from the account: the server link
 * is removed and the browser starts again as a brand-new anonymous player.
 * The account's stats stay safe and return on the next sign-in.
 */
export async function signOut(): Promise<void> {
  try {
    await supabase.rpc("unlink_device", { p_visitor_id: getVisitorId() });
  } catch {
    // still sign out locally
  }
  try {
    await supabase.auth.signOut();
  } finally {
    clearLocalPlayerData();
    publish(null);
  }
  try {
    window.location.reload();
  } catch {
    // ignore
  }
}

/** Latest reminder answer; an older list signup counts as On. Null signed out. */
export async function getReminderStatus(): Promise<boolean | null> {
  try {
    const { data, error } = await supabase.rpc("get_reminder_status");
    if (error) return null;
    return data === null ? null : data === true;
  } catch {
    return null;
  }
}

/**
 * Records a yes/no reminder answer with a timestamp. Only a yes adds the
 * address to the reminder list; a no in Settings takes it off.
 */
export async function setReminder(
  consented: boolean,
  source: "post_signin" | "settings"
): Promise<boolean> {
  const email = sessionEmail;
  if (!email) return false;
  try {
    const { data, error } = await supabase.rpc("set_reminder_consent", {
      p_consented: consented,
      p_source: source,
    });
    if (error || data !== true) return false;
    trackDaily("reminder_opt_in", {
      props: { choice: consented ? "sounds_good" : "no_thanks", source },
    });
    if (consented) {
      await supabase.functions.invoke("ac-subscribe", {
        body: { email, visitorId: getVisitorId(), source: "daily_result" },
      });
    } else if (source === "settings") {
      await supabase.functions.invoke("delete-account", { body: { action: "reminder_off" } });
    }
    return true;
  } catch {
    return false;
  }
}

/** Deletes the account and all its data, then starts this browser fresh. */
export async function deleteAccount(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("delete-account", {
      body: { action: "delete" },
    });
    if (error || !data?.ok) return false;
    trackDaily("account_deleted");
    await signOut();
    try {
      Object.keys(localStorage)
        .filter(
          (k) =>
            (k.startsWith("ww_daily") || k === "ww_visitor_id") &&
            // Only the browser's own played records stay (see above).
            !(k.startsWith("ww_daily_whoop-") && !isAccountOwnedRecord(localStorage.getItem(k)))
        )
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}
