// ============================================================================
// useClassicResultRecorder — records a completed Classic game exactly once.
//
// Host / solo only: the caller passes `enabled: false` for joiners, so a joiner
// never writes. Guards:
//   - a per-game "written" ref, so a double-firing end-of-game effect writes once
//   - a game key, so a rematch is a new row rather than a lost one
//   - the server allows one result per game id, ever
//
// The server decides identity, start time and duration. Multiplayer saves are
// accepted only from the room's host (browser id + secret session key) for a
// game whose seats were registered. Solo saves reference a server-issued id,
// requested quietly when each solo game begins.
//
// It only reads the game state; it never dispatches, so the reducer, the game
// loop and the claim arbiter are untouched.
// ============================================================================

import { useEffect, useRef } from "react";
import {
  endReasonFor,
  saveClassicGame,
  saveSoloGame,
  startSoloGame,
} from "@/lib/classicResults";

export interface ClassicSnapshot {
  phase: string;
  settleKind: "MATCH" | "WRONG" | null;
  scores: number[];
  names: string[];
  roundNum: number;
  /** Multiplayer: the server-registered game id. Solo: ignored. */
  gameId: string;
  /** Reducer message type; "warning" on GAME_OVER marks the table-empty end. */
  messageType?: string;
}

interface Opts {
  snapshot: ClassicSnapshot;
  isSolo: boolean;
  enabled: boolean;
  visitorId: string | null;
  /** Multiplayer only. */
  roomId?: string | null;
  /** Multiplayer only: this tab's secret session key (host proof). */
  playerKey?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useClassicResultRecorder({
  snapshot,
  isSolo,
  enabled,
  visitorId,
  roomId = null,
  playerKey = null,
}: Opts): void {
  const keyRef = useRef<string | null>(null);
  const wireIdRef = useRef<string>("");
  const soloIdRef = useRef<Promise<string | null> | null>(null);
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
      keyRef.current = isSolo ? "solo" : wireId;
      correctRef.current = 0;
      wrongRef.current = 0;
      prevSettleRef.current = null;
      writtenRef.current = false;
      soloIdRef.current = isSolo && visitorId ? startSoloGame(visitorId) : null;
    }

    // Claim tallies: every entry into a settle animation is one resolved claim.
    if (s.settleKind !== prevSettleRef.current) {
      if (s.settleKind === "MATCH") correctRef.current += 1;
      if (s.settleKind === "WRONG") wrongRef.current += 1;
      prevSettleRef.current = s.settleKind;
    }

    if (s.phase !== "GAME_OVER" || writtenRef.current) return;
    writtenRef.current = true;

    const report = {
      endReason: endReasonFor(s.scores, s.messageType),
      scores: s.scores,
      names: s.names,
      roundsPlayed: s.roundNum,
      correctClaims: correctRef.current,
      wrongClaims: wrongRef.current,
    };

    if (isSolo) {
      const pending = soloIdRef.current;
      if (!pending) return;
      void pending.then((id) => {
        if (id) void saveSoloGame({ ...report, gameId: id });
      });
      return;
    }

    const gameId = keyRef.current;
    if (!gameId || !UUID_RE.test(gameId) || !roomId || !visitorId || !playerKey) return;
    void saveClassicGame({ ...report, roomId, gameId, visitorId, playerKey });
  }, [snapshot, enabled, isSolo, roomId, visitorId, playerKey]);
}
