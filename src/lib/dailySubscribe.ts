// ============================================================================
// Daily email capture — one address per person, written through the
// `ac-subscribe` edge function, which owns the database write and then forwards
// the address to the email sender. Never blocks the UI: every failure is
// surfaced as a simple boolean and swallowed otherwise.
// ============================================================================


import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitor";
import { getDailyNumber } from "@/lib/daily";
import { getSessionEmail } from "@/lib/account";

const SUBSCRIBED_KEY = "ww_daily_subscribed";
const EMAIL_KEY = "ww_daily_email";
let inMemorySubscribed = false;
let inMemoryEmail: string | null = null;

/** Mirrors the server-side check so we never send obvious junk. */
export function isValidEmail(value: string): boolean {
  const email = (value ?? "").trim();
  if (email.length === 0 || email.length > 255) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

export function hasSubscribed(): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(SUBSCRIBED_KEY) === "1";
    }
  } catch {
    // fall through
  }
  return inMemorySubscribed;
}

/**
 * The address this browser subscribed with, if any. Passed to the streak and
 * stats reads so history from a previous device is folded back in.
 */
export function getSubscribedEmail(): string | null {
  // Only a verified, signed-in email is ever used; typed emails are not identity.
  return getSessionEmail();
}

export function markSubscribed(email?: string): void {
  inMemorySubscribed = true;
  const clean = email ? email.trim().toLowerCase() : null;
  if (clean && isValidEmail(clean)) inMemoryEmail = clean;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SUBSCRIBED_KEY, "1");
      if (inMemoryEmail) localStorage.setItem(EMAIL_KEY, inMemoryEmail);
    }
  } catch {
    // fall through
  }
}

/**
 * Forgets this browser's stored address. Local only: nothing server side is
 * deleted, the visitor id is untouched, and today's stored result survives — so
 * a shared phone can hand the game to the next person without losing the run.
 */
export function clearSubscribed(): void {
  inMemorySubscribed = false;
  inMemoryEmail = null;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SUBSCRIBED_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }
  } catch {
    // fall through
  }
}

/**
 * `felix@gmail.com` → `f•••@gmail.com`. First character of the local part, a
 * fixed three bullets (never a length hint), then the domain verbatim. Junk in
 * gives an empty string out rather than a throw.
 */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return "";
  return `${value[0]}•••${value.slice(at)}`;
}


/**
 * Server-side recognition. Given this browser's visitor id, returns the address
 * already on file for it (a previous signup on this device, or a run that was
 * linked to an address) — so clearing local storage no longer makes the app
 * forget a subscriber. Null on anything unexpected.
 */
export async function fetchServerSubscriberEmail(
  _visitorId: string = getVisitorId()
): Promise<string | null> {
  // Retired: an email is only known through sign-in.
  return null;
}

/**
 * Whether this address already has daily history. Tells a genuine new signup
 * ("You're in.") from a returning player on a fresh browser ("Welcome back.").
 * Failures read as "new" — never block the signup.
 */
export async function emailHasHistory(_email: string): Promise<boolean> {
  // Retired: history is only revealed to a signed-in account.
  return false;
}


/**
 * The puzzle number for the subscriber's *local* calendar date, or null when it
 * cannot be resolved (pre-launch, or anything non-finite). Reuses the one date
 * calculation the daily engine already owns — never UTC.
 */
function localPuzzleNumber(): number | null {
  try {
    const n = getDailyNumber();
    if (!Number.isInteger(n) || n < 1 || n > 100000) return null;
    return n;
  } catch {
    return null;
  }
}

/**
 * Subscribes an address. Duplicates resolve `true` — a repeat signup is quiet,
 * never an error the player sees.
 */
export async function subscribeDaily(
  email: string,
  visitorId: string = getVisitorId(),
  /** Where the signup came from. Omitted keeps the server's own default.
   *  `restore` is a client-side label only — the server maps anything it does
   *  not know to its default, so nothing about ac-subscribe changes. */
  source?: "daily_result" | "landing" | "prelaunch" | "restore"
): Promise<boolean> {
  if (!isValidEmail(email)) return false;
  const puzzleNumber = localPuzzleNumber();
  try {
    const { data, error } = await supabase.functions.invoke("ac-subscribe", {
      body: {
        email: email.trim().toLowerCase(),
        visitorId,
        ...(source ? { source } : {}),
        ...(puzzleNumber !== null ? { puzzleNumber } : {}),
      },
    });

    if (error || (data as { ok?: boolean } | null)?.ok !== true) return false;
    markSubscribed(email);
    return true;
  } catch {
    return false;
  }
}

