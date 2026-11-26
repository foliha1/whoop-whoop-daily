// ============================================================================
// Together on the table server (PartyKit plan, step 5): the pieces phones
// share. The server lives in party/; this is the phone's side of the wire.
// ============================================================================

import { ALL_CARDS, type Card } from "@/cardData";
import { TABLE_SERVER_MODE } from "@/lib/featureFlags";
import type { PublicState } from "@/lib/publicState";
import type { ClaimRejectPayload, RollCommitPayload, TransientEvent } from "@/lib/multiplayer";

export const TABLE_SERVER_ORIGIN = "wss://whoop-whoop-tables.felixfoliha.workers.dev";

export function tableSocketUrl(roomCode: string, pid: string, origin = TABLE_SERVER_ORIGIN): string {
  return `${origin}/parties/table/${encodeURIComponent(roomCode.toUpperCase())}?pid=${encodeURIComponent(pid)}`;
}

/** Server state: the same public state as before, plus the pause. */
export type TableState = PublicState & {
  serverNow: number;
  paused: boolean;
  waitingFor: number[];
  pauseEndsAt: number | null;
};

export type TableSeat = { seat: number; pid: string; display_name: string };

export type TableServerMessage =
  | { t: "hello"; v: number; serverNow: number }
  | { t: "pong"; id: number; serverNow: number; sentAt?: number }
  | { t: "joined"; seat: number | null; host: boolean }
  | { t: "lobby"; seats: TableSeat[]; started: boolean; gameId: string | null }
  | { t: "state"; seq: number; state: TableState }
  | { t: "roll_committed"; payload: RollCommitPayload }
  | { t: "event"; payload: TransientEvent }
  | { t: "claim_grant"; seat: number; claim_window: number; granted_at: number }
  | { t: "claim_reject"; payload: ClaimRejectPayload }
  | { t: "ack"; id: string; accepted: boolean; reason?: string; recvAt: number }
  | { t: "error"; reason: string };

/** What a phone sends as a tap. Card indexes are checked on the server. */
export type TableIntent =
  | { type: "REQUEST_ROLL" }
  | { type: "FLIP_START"; idx: number }
  | { type: "CLAIM" }
  | { type: "PLAYER_SELECT_CARD"; idx: number }
  | { type: "PLAYER_RESOLVE_MATCH" }
  | { type: "CANCEL_CLAIM" }
  | { type: "NEW_GAME" };

const CARD_BY_ID = new Map<string, Card>(ALL_CARDS.map((c) => [c.id, c]));

/**
 * The server sends cards without art (it has no build-hashed asset URLs).
 * Put each face's art back from the card id; unknown ids pass through.
 */
export function hydrateCards<T extends { grid: PublicState["grid"] }>(state: T): T {
  return {
    ...state,
    grid: state.grid.map((slot) => {
      if (!slot.card) return slot;
      const card = CARD_BY_ID.get(slot.card.id);
      return card ? { ...slot, card } : slot;
    }),
  };
}

/**
 * Clock offset from one ping: server time minus the local midpoint of the
 * round trip. The smallest round trip seen is the most trustworthy.
 */
export function offsetFromPong(sentAt: number, receivedAt: number, serverAt: number): { offset: number; rtt: number } {
  const rtt = Math.max(0, receivedAt - sentAt);
  return { offset: serverAt - (sentAt + rtt / 2), rtt };
}

let adminCheck: Promise<boolean> | null = null;

/**
 * Should a table THIS phone hosts run on the table server? Joiners never ask:
 * they follow their host. "admins" means a signed-in admin (the same check as
 * the umbrella preview), resolved once per page.
 */
export function hostUsesTableServer(): Promise<boolean> {
  if (TABLE_SERVER_MODE === "off") return Promise.resolve(false);
  if (TABLE_SERVER_MODE === "everyone") return Promise.resolve(true);
  if (!adminCheck) {
    adminCheck = (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return false;
        const { data, error } = await supabase.rpc("can_preview_umbrella");
        return !error && data === true;
      } catch {
        return false;
      }
    })();
  }
  return adminCheck;
}

/** Test-only: forget the cached admin answer. */
export function resetTableServerCheckForTests(): void {
  adminCheck = null;
}
