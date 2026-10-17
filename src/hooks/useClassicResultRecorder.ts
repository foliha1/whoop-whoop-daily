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
import { umbrellaOn } from "@/lib/launch";
import { rememberMatch } from "@/lib/playerStats";
import { supabase } from "@/integrations/supabase/client";
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
  settleBy?: number | null;
  settleToken?: number;
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
  const playerCorrect = useRef(0);
  const playerWrong = useRef(0);
  const lastToken = useRef<number | undefined>();
  const started = useRef(0);
  const victory = useRef<number | null>(null);
  const localId = useRef("");

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
      playerCorrect.current = 0;
      playerWrong.current = 0;
      lastToken.current = undefined;
      started.current = Date.now();
      victory.current = null;
      localId.current = crypto.randomUUID();
      void soloIdRef.current?.then((id) => { if (id) localId.current = id; });
    }

    if (isSolo && umbrellaOn() && s.settleKind !== null && s.settleToken !== undefined && s.settleToken !== lastToken.current) {
      lastToken.current = s.settleToken;
      if (s.settleBy === 0) {
        if (s.settleKind === "MATCH") {
          playerCorrect.current += 1;
          if ((s.scores[0] ?? 0) >= 12) victory.current = Date.now() - started.current;
        } else playerWrong.current += 1;
      }
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
      const selectedStats = { correct: playerCorrect.current, wrong: playerWrong.current, victoryMs: victory.current };
      if (umbrellaOn()) rememberMatch({ id: localId.current, mode: "solo", won: report.endReason === "target" && (s.scores[0] ?? 0) >= 12, ...selectedStats });
      const pending = soloIdRef.current;
      if (!pending) return;
      void pending.then((id) => {
        if (!id) return;
        void saveSoloGame({ ...report, gameId: id }).then(async (saved) => {
          if (saved && umbrellaOn()) await supabase.rpc("save_solo_player_stats", { p_game_id: id, p_correct: selectedStats.correct, p_wrong: selectedStats.wrong, p_victory_ms: selectedStats.victoryMs });
        });
      });
      return;
    }

    const gameId = keyRef.current;
    if (!gameId || !UUID_RE.test(gameId) || !roomId || !visitorId || !playerKey) return;
    void saveClassicGame({ ...report, roomId, gameId, visitorId, playerKey });
  }, [snapshot, enabled, isSolo, roomId, visitorId, playerKey]);
}
