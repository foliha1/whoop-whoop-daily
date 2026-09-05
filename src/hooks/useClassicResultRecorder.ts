// ============================================================================
// useClassicResultRecorder — records a completed Classic game exactly once.
//
// Host / solo only: the caller passes `enabled: false` for joiners, so a joiner
// never writes. The write is guarded three ways:
//   - a per-game "written" ref, so a double-firing end-of-game effect writes once
//   - a game key, so a rematch is a new row rather than a lost one
//   - a UNIQUE (game_id) at the server with ON CONFLICT DO NOTHING
//
// It only reads the game state; it never dispatches, so the reducer, the game
// loop and the claim arbiter are untouched.
// ============================================================================

import { useEffect, useRef } from "react";
import {
  saveClassicResultRemote,
  seatResults,
} from "@/lib/classicResults";

export interface ClassicSnapshot {
  phase: string;
  settleKind: "MATCH" | "WRONG" | null;
  scores: number[];
  names: string[];
  roundNum: number;
  /** Host game id. Solo has no wire id, so the recorder mints one per game. */
  gameId: string;
}

interface Opts {
  snapshot: ClassicSnapshot;
  roomCode: string | null;
  isSolo: boolean;
  enabled: boolean;
  hostVisitorId: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const newId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12);
  }
};

export function useClassicResultRecorder({
  snapshot,
  roomCode,
  isSolo,
  enabled,
  hostVisitorId,
}: Opts): void {
  const keyRef = useRef<string | null>(null);
  const wireIdRef = useRef<string>("");
  const startedRef = useRef<number>(0);
  const correctRef = useRef(0);
  const wrongRef = useRef(0);
  const prevSettleRef = useRef<"MATCH" | "WRONG" | null>(null);
  const writtenRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const s = snapshot;
    const wireId = isSolo ? "" : s.gameId;

    // A new game: first sight, a fresh host game id, or a rematch that has
    // moved off GAME_OVER after we already stored the previous game.
    const isNew =
      keyRef.current === null ||
      wireIdRef.current !== wireId ||
      (writtenRef.current && s.phase !== "GAME_OVER");
    if (isNew) {
      wireIdRef.current = wireId;
      keyRef.current = !isSolo && UUID_RE.test(wireId) ? wireId : newId();
      startedRef.current = Date.now();
      correctRef.current = 0;
      wrongRef.current = 0;
      prevSettleRef.current = null;
      writtenRef.current = false;
    }

    // Claim tallies: every entry into a settle animation is one resolved claim.
    if (s.settleKind !== prevSettleRef.current) {
      if (s.settleKind === "MATCH") correctRef.current += 1;
      if (s.settleKind === "WRONG") wrongRef.current += 1;
      prevSettleRef.current = s.settleKind;
    }

    if (s.phase !== "GAME_OVER" || writtenRef.current) return;
    writtenRef.current = true;
    const gameId = keyRef.current;
    if (!gameId) return;

    void saveClassicResultRemote({
      gameId,
      roomCode,
      isSolo,
      startedAt: new Date(startedRef.current).toISOString(),
      endedAt: new Date().toISOString(),
      playerCount: s.scores.length,
      seats: seatResults(s.scores, s.names),
      roundsPlayed: s.roundNum,
      correctClaims: correctRef.current,
      wrongClaims: wrongRef.current,
      hostVisitorId,
    });
  }, [snapshot, enabled, isSolo, roomCode, hostVisitorId]);
}
