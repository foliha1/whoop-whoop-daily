// ============================================================================
// Daily instrumentation — funnel events for the daily puzzle.
//
// Fire and forget: every call queues, returns immediately, and can never throw
// into a render or delay a tap. The queue is debounced so a run does not emit a
// burst of requests, and flushed on pagehide so the tail is not lost.
//
// Writes go through the `log_daily_events` security-definer RPC (the table has
// RLS on with no policies), same pattern as `save_daily_result`.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitor";

export type DailyEventName =
  | "ready_viewed"
  | "howto_opened"
  | "howto_skipped"
  | "howto_finished"
  | "run_started"
  | "round_solved"
  | "round_failed"
  | "peek_used"
  | "run_finished"
  | "run_abandoned"
  | "share_clicked"
  | "subscribe_shown"
  | "subscribe_submitted"
  | "invite_sent"
  | "invite_landed"
  | "announcement_shown"
  | "announcement_primary_tapped"
  | "announcement_dismissed"
  | "signin_started"
  | "signin_code_sent"
  | "signin_verified"
  | "signin_failed"
  | "account_deleted"
  | "reminder_opt_in";


export interface DailyEventRow {
  event: DailyEventName;
  puzzle_number: number | null;
  props: Record<string, unknown> | null;
  referrer?: string;
  utm_source?: string;
}

const ATTR_KEY = "ww_attr";
const ATTR_SENT_KEY = "ww_attr_sent";
const INVITE_SEEN_KEY = "ww_invite_seen";
export const DAILY_EVENT_FLUSH_MS = 800;


export interface DailyAttribution {
  referrer: string | null;
  utm_source: string | null;
}

/** Host only — never a full URL with a query string. */
function referrerSource(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Token only: letters, digits, dot, dash, underscore, capped. */
function cleanToken(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 60);
  return t || null;
}

function readStored(): DailyAttribution | null {
  try {
    const raw = localStorage.getItem(ATTR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyAttribution;
    return {
      referrer: parsed.referrer ?? null,
      utm_source: parsed.utm_source ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * The visitor's origin, captured the first time we ever see them and persisted
 * so later events can be joined back to it. Only the source itself is kept.
 */
export function getAttribution(search?: string, referrer?: string): DailyAttribution {
  const stored = readStored();
  if (stored) return stored;

  const rawSearch =
    search ?? (typeof window === "undefined" ? "" : window.location.search);
  const rawRef =
    referrer ?? (typeof document === "undefined" ? "" : document.referrer);

  const params = new URLSearchParams(rawSearch);
  const fresh: DailyAttribution = {
    referrer: referrerSource(rawRef),
    utm_source: cleanToken(params.get("utm_source") ?? params.get("ref")),
  };
  try {
    localStorage.setItem(ATTR_KEY, JSON.stringify(fresh));
  } catch {
    /* private mode — attribution just isn't persisted */
  }
  return fresh;
}

function attributionSent(): boolean {
  try {
    return localStorage.getItem(ATTR_SENT_KEY) === "1";
  } catch {
    return false;
  }
}

function markAttributionSent(): void {
  try {
    localStorage.setItem(ATTR_SENT_KEY, "1");
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// suppression — nothing is recorded under ?debug=1, same as daily_results
// ---------------------------------------------------------------------------

let enabled: boolean | null = null;

function trackingEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    const search = typeof window === "undefined" ? "" : window.location.search;
    enabled = new URLSearchParams(search).get("debug") !== "1";
  } catch {
    enabled = true;
  }
  return enabled;
}

/** Explicit override, used by DailyPage (debug context) and by tests. */
export function setDailyTrackingEnabled(value: boolean): void {
  enabled = value;
}

// ---------------------------------------------------------------------------
// queue
// ---------------------------------------------------------------------------

let queue: DailyEventRow[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

/** Test seam: clears the queue, timer and cached suppression state. */
export function resetDailyEvents(): void {
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
  enabled = null;
}

export function pendingDailyEvents(): DailyEventRow[] {
  return queue.slice();
}

/** Sends whatever is queued. Never rejects. */
export async function flushDailyEvents(): Promise<number> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return 0;
  const batch = queue;
  queue = [];

  try {
    if (!attributionSent()) {
      const attr = getAttribution();
      const first = batch[0];
      if (attr.referrer) first.referrer = attr.referrer;
      if (attr.utm_source) first.utm_source = attr.utm_source;
      markAttributionSent();
    }
    const { error } = await supabase.rpc("log_daily_events", {
      p_visitor_id: getVisitorId(),
      p_events: batch as unknown as never,
    });
    if (error) return 0;
    return batch.length;
  } catch {
    return 0;
  }
}

function bindLifecycle(): void {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  const flush = () => void flushDailyEvents();
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

export interface TrackOpts {
  puzzleNumber?: number | null;
  props?: Record<string, unknown>;
}

/**
 * Queue one event. Returns immediately; the write happens later and silently.
 */
export function trackDaily(event: DailyEventName, opts: TrackOpts = {}): void {
  try {
    if (!trackingEnabled()) return;
    // Ensures attribution exists from the very first event onward.
    getAttribution();
    queue.push({
      event,
      // Pre-launch days resolve to a non-positive puzzle number; store null
      // rather than a sentinel so counts never key off a fake puzzle.
      puzzle_number:
        typeof opts.puzzleNumber === "number" && opts.puzzleNumber > 0
          ? opts.puzzleNumber
          : null,

      props: opts.props && Object.keys(opts.props).length > 0 ? opts.props : null,
    });
    bindLifecycle();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flushDailyEvents();
    }, DAILY_EVENT_FLUSH_MS);
  } catch {
    /* instrumentation must never surface an error to the player */
  }
}

// ---------------------------------------------------------------------------
// invite landing — one row per browser, the first time an `?i=` link is opened
// ---------------------------------------------------------------------------

/**
 * Records that this browser arrived on an invite link. Deliberately separate
 * from `getAttribution`: invite codes never touch `utm_source`, `referrer` or
 * the `ww_attr` keys, they live in `props` only.
 *
 * Safe to call on every mount — it is a one-shot per browser.
 */
export function noteInviteLanding(search?: string): void {
  try {
    const raw =
      search ?? (typeof window === "undefined" ? "" : window.location.search);
    const code = cleanToken(new URLSearchParams(raw).get("i"))?.slice(0, 16);
    if (!code) return;
    if (localStorage.getItem(INVITE_SEEN_KEY) === "1") return;
    localStorage.setItem(INVITE_SEEN_KEY, "1");
    trackDaily("invite_landed", { props: { code } });
  } catch {
    /* private mode or no URL — the landing simply isn't recorded */
  }
}
