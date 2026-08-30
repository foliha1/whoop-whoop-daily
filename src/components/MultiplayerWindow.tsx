import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import AutoFitText from "@/components/AutoFitText";
import {
  COLORS,
  SPACE,
  BORDER,
  RADIUS,
  MOTION,
  textStyle,
  TEXT,
  FONT_FAMILY,
  FONT_FAMILY_UI,
  FONT_WEIGHT_UI,
  buttonStyle,
  panelStyle,
  CONTROL_H,
  TOUCH_MIN,
} from "@/lib/tokens";

import { AppButton } from "@/components/ui/AppButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { getVisitorId, getDisplayName, setDisplayName, DISPLAY_NAME_MAX } from "@/lib/visitor";
import { trackEvent } from "@/lib/analytics";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useMultiplayerHost, useMultiplayerJoiner, useTransientEvents, type SeatMapEntry } from "@/hooks/useMultiplayerGame";
import { useHeartbeatSender, useHeartbeatMonitor } from "@/hooks/useHeartbeat";
import DailyFrame from "@/components/DailyFrame";
import DailyLogoLockup from "@/components/DailyLogoLockup";
import SettingsSheet from "@/components/SettingsSheet";
import { HelpCircle, Settings as SettingsIcon } from "lucide-react";
import { useViewportHeight, compressionFactor, lerpCompress } from "@/hooks/useViewportHeight";
import MultiplayerGameView from "@/components/MultiplayerGameView";
import { useSoloGame } from "@/hooks/useSoloGame";
import MultiplayerHowToSteps, { hasSeenMpHowTo } from "@/components/MultiplayerHowToSteps";

/**
 * Fits an entry screen's column into the frame without scrolling. The column is
 * measured at its natural size and, when it is taller than the space between
 * the pattern strips, uniformly scaled down from the top. This is the same
 * "measure then scale" approach the board uses for cards, and it keeps the
 * entry screens whole at 390x520 instead of clipping them.
 */
const FitColumn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const measure = () => {
      const avail = box.clientHeight;
      const natural = inner.scrollHeight;
      if (!avail || !natural) return;
      setScale(Math.min(1, avail / natural));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      ref={boxRef}
      style={{ width: "100%", flex: "1 1 auto", minHeight: 0, display: "flex", justifyContent: "center" }}
    >
      <div
        ref={innerRef}
        style={{
          width: "100%",
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "center center",
          alignSelf: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * The in-game column. Multiplayer has no site header any more, so the 420px
 * cap and the desktop safe-area padding that used to live on the page wrapper
 * live here, around the board only.
 */
const GameShell: React.FC<{ mobile: boolean; children: React.ReactNode }> = ({ mobile, children }) => (
  <div
    style={{
      width: "100%",
      maxWidth: 420,
      height: "var(--ww-vh)",
      margin: "0 auto",
      padding: mobile
        ? 0
        : "calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left))",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const SoloView: React.FC<{ onLeave: () => void; mobile: boolean }> = ({ onLeave, mobile }) => {
  // Every digital game is 3x3. Grid expansion stays a physical-game concept.
  const solo = useSoloGame(FIXED_GRID);
  return (
    <GameShell mobile={mobile}>
    <MultiplayerGameView
      publicState={solo.publicState}
      mySeat={solo.mySeat}
      events={solo.events}
      rollCommit={solo.rollCommit}
      onIntent={solo.onIntent}
      onLeave={onLeave}
      mobile={mobile}
      roomId={solo.roomId}
      visitorId={solo.visitorId}
      isHost={true}
      soloMode={true}
    />
    </GameShell>
  );
};

import { toPublicState } from "@/lib/publicState";
import {
  createRoom,
  findRoomByCode,
  isValidRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RoomRow,
} from "@/lib/rooms";

import { unlockAudio } from "@/lib/sounds";
import { supabase } from "@/integrations/supabase/client";


interface MultiplayerWindowProps {
  initialRoomCode?: string;
  /** Optional deep-link mode from `?mode=` — skips the idle play-style chooser. */
  initialMode?: "solo" | "multiplayer";
  introStatus?: "running" | "skipped" | "complete" | "timeout" | "none";
}


/** The only grid the digital rules are calibrated for. */
const FIXED_GRID = "3x3" as const;

const ROOM_CAPACITY = 6;

type PendingAction =
  | { kind: "create" }
  | { kind: "join-code"; code: string }
  | { kind: "join-link"; code: string };

type View =
  | { kind: "idle"; error?: string }
  | { kind: "solo" }
  /** Display name screen. The table-code field appears on the peeps path only. */
  | { kind: "name-prompt"; intent: "solo" | "peeps"; via?: "link"; error?: string }
  | { kind: "host"; room: RoomRow }
  | { kind: "joiner"; room: RoomRow }
  | { kind: "full"; code: string }
  | { kind: "host-left" };

const sanitizeCodeInput = (raw: string): string => {
  const upper = raw.toUpperCase();
  let out = "";
  for (const ch of upper) {
    if (ROOM_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length >= ROOM_CODE_LENGTH) break;
  }
  return out;
};

const MultiplayerWindow: React.FC<MultiplayerWindowProps> = ({
  initialRoomCode,
  initialMode,
  introStatus = "none",
}) => {
  const mobile = useIsMobile();
  const [view, setView] = useState<View>(() => {
    // Join-by-link wins over ?mode=; the room-code effect below handles it.
    if (initialRoomCode) return { kind: "idle" };
    if (initialMode === "solo") return { kind: "solo" };
    if (initialMode === "multiplayer") return { kind: "name-prompt", intent: "peeps" };
    return { kind: "idle" };
  });
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [nameInput, setNameInput] = useState<string>(() => getDisplayName());
  // True once the player has typed this session. While false the value is an
  // untouched prefill — the first keystroke replaces it instead of appending.
  const [nameTouched, setNameTouched] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  // Game-started state — seat freeze lives here on the HOST. Joiners learn
  // seats from the wire via PublicState.seatMap.
  const [frozenSeats, setFrozenSeats] = useState<SeatMapEntry[] | null>(null);
  // Host-minted game id. Scopes the arbiter's UNIQUE (room, game, window)
  // constraint so consecutive games in the same room don't collide.
  const [gameId, setGameId] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [shareFlash, setShareFlash] = useState(false);
  const [codeFlash, setCodeFlash] = useState(false);
  // How to Play stepper. `gate` fires once per browser on the first play click
  // and carries the action to run when it closes; `reference` is the header link.
  const [howTo, setHowTo] = useState<{ mode: "gate" | "reference"; then?: () => void } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const shareFlashTimerRef = useRef<number | null>(null);
  const codeFlashTimerRef = useRef<number | null>(null);



  const visitorId = useMemo(() => getVisitorId(), []);
  const activeRoom = view.kind === "host" || view.kind === "joiner" ? view.room : null;
  const isHostView = view.kind === "host";
  const displayName = getDisplayName();
  const { participants, status: presenceStatus, channel, onBroadcast } = useRoomPresence(
    activeRoom ? activeRoom.id : null,
    visitorId,
    displayName,
    isHostView,
  );


  const hostVisitorId = useMemo(() => {
    if (isHostView) return visitorId;
    const hostP = participants.find((p) => p.is_host);
    return hostP?.visitor_id ?? null;
  }, [isHostView, visitorId, participants]);

  // Heartbeat: EVERY client (host + joiner) sends. The host also monitors
  // inbound heartbeats to detect crashed/slept peers that presence never
  // reports as gone. Merged into disconnectedSeats below via UNION with the
  // presence-derived set — either signal is sufficient.
  useHeartbeatSender(channel, visitorId, !!activeRoom);
  const watchedVisitorIds = useMemo(
    () => (frozenSeats ? frozenSeats.map((e) => e.visitor_id) : []),
    [frozenSeats],
  );
  const {
    staleVisitors: heartbeatStaleVisitors,
    awayVisitors: heartbeatAwayVisitors,
    awaySkipVisitors: heartbeatAwaySkipVisitors,
    endGameVisitors: heartbeatEndGameVisitors,
    lastSeenSpreadMs,
  } = useHeartbeatMonitor({
    channel,
    onBroadcast,
    enabled: isHostView && frozenSeats !== null,
    watchedVisitorIds,
    hostVisitorId: visitorId,
  });

  // Compute disconnected seats: union of
  //   (a) seats whose visitor_id is no longer in the presence roster, and
  //   (b) seats whose heartbeat has gone stale past its applicable threshold,
  //       and
  //   (c) seats that have been reporting hidden for longer than the AWAY
  //       skip dwell (AWAY_SKIP_MS). The AWAY chip appears immediately on
  //       the first hidden heartbeat (see awaySeats below), but the reducer
  //       only sees a seat as skippable AFTER the dwell — this keeps a
  //       momentary tab switch from silently forfeiting a turn while still
  //       skipping a genuinely backgrounded player on the same 15s budget
  //       as a silent seat.
  // All three signals feed SET_DISCONNECTED, which uses REPLACE semantics —
  // resuming heartbeats or presence rejoin automatically un-marks a seat.
  // The stricter end-game set below is unchanged and still excludes AWAY.
  const disconnectedSeats = useMemo(() => {
    if (!frozenSeats) return [] as number[];
    const present = new Set(participants.map((p) => p.visitor_id));
    const stale = new Set(heartbeatStaleVisitors);
    const awaySkip = new Set(heartbeatAwaySkipVisitors);
    return frozenSeats
      .filter((e) => !present.has(e.visitor_id) || stale.has(e.visitor_id) || awaySkip.has(e.visitor_id))
      .map((e) => e.seat);
  }, [frozenSeats, participants, heartbeatStaleVisitors, heartbeatAwaySkipVisitors]);

  const awaySeats = useMemo(() => {
    if (!frozenSeats) return [] as number[];
    const away = new Set(heartbeatAwayVisitors);
    return frozenSeats
      .filter((e) => away.has(e.visitor_id))
      .map((e) => e.seat);
  }, [frozenSeats, heartbeatAwayVisitors]);

  // Diagnostic-only seat-number mirrors of the visitor-id sets the heartbeat
  // hook returns. Passed to the debug overlay so testers can see the
  // breakdown between presence-only absence, stale heartbeat, and away-skip
  // dwell before comparing with reducer.disconnected.
  const heartbeatStaleSeats = useMemo(() => {
    if (!frozenSeats) return [] as number[];
    const stale = new Set(heartbeatStaleVisitors);
    return frozenSeats.filter((e) => stale.has(e.visitor_id)).map((e) => e.seat);
  }, [frozenSeats, heartbeatStaleVisitors]);

  const awaySkipSeats = useMemo(() => {
    if (!frozenSeats) return [] as number[];
    const away = new Set(heartbeatAwaySkipVisitors);
    return frozenSeats.filter((e) => away.has(e.visitor_id)).map((e) => e.seat);
  }, [frozenSeats, heartbeatAwaySkipVisitors]);


  // Stricter set for the IRREVERSIBLE end-game guard. A seat is in here only
  // when we've heard NOTHING (visible or hidden) from it for the long window.
  // Presence-absent alone is NOT sufficient — presence has been observed to
  // hold ghost keys for over a minute, so relying on it to trigger a game
  // end would reproduce the very false-positive this fix exists to prevent.
  const endGameDisconnectedSeats = useMemo(() => {
    if (!frozenSeats) return [] as number[];
    const dead = new Set(heartbeatEndGameVisitors);
    return frozenSeats.filter((e) => dead.has(e.visitor_id)).map((e) => e.seat);
  }, [frozenSeats, heartbeatEndGameVisitors]);

  // Host: game controller.
  const gameEnabled = isHostView && frozenSeats !== null;
  const host = useMultiplayerHost({
    channel,
    onBroadcast,
    seatMap: frozenSeats ?? [],
    hostVisitorId: visitorId,
    enabled: gameEnabled,
    gameId,
    gridSize: FIXED_GRID,
    roomId: activeRoom?.id ?? "",
    disconnectedSeats,
    awaySeats,
    endGameDisconnectedSeats,
    presenceStatus,
    lastSeenSpreadMs,
  });
  const hostEvents = useTransientEvents(channel, onBroadcast, gameEnabled);

  // Track claimWindow on the host in parallel to what useMultiplayerHost
  // broadcasts, so the local toPublicState render matches the wire payload.
  const hiddenNameInputRef = useRef<HTMLInputElement | null>(null);
  const hostClaimWindowRef = useRef(0);
  const hostPrevClaimByRef = useRef<number | null>(null);
  const hostPrevRoundRef = useRef<number>(host.state.roundNum);
  const hostPrevGameIdRef = useRef<string>(gameId);
  if (hostPrevGameIdRef.current !== gameId) {
    hostPrevGameIdRef.current = gameId;
    hostClaimWindowRef.current = 0;
    hostPrevRoundRef.current = host.state.roundNum;
    hostPrevClaimByRef.current = null;
  }
  if (host.state.roundNum !== hostPrevRoundRef.current) {
    hostPrevRoundRef.current = host.state.roundNum;
    hostClaimWindowRef.current += 1;
  }
  if (hostPrevClaimByRef.current !== null && host.state.claimBy === null) {
    hostClaimWindowRef.current += 1;
  }
  hostPrevClaimByRef.current = host.state.claimBy;

  // Joiner: pure receiver.
  const joinerEnabled = view.kind === "joiner" && !!channel;
  const joiner = useMultiplayerJoiner({
    channel,
    onBroadcast,
    mySeat: null, // resolved from seatMap after first state msg
    visitorId,
    enabled: joinerEnabled,
  });

  const joinerPublicState = joiner.publicState;
  const joinerSeat = useMemo(() => {
    if (!joinerPublicState) return null;
    const me = joinerPublicState.seatMap.find((e) => e.visitor_id === visitorId);
    return me?.seat ?? null;
  }, [joinerPublicState, visitorId]);

  // Watch for host departure once a game is in progress.
  useEffect(() => {
    if (view.kind !== "joiner") return;
    if (!joinerPublicState) return; // game hasn't started
    if (!hostVisitorId) {
      setView({ kind: "host-left" });
      return;
    }
    const hostStillHere = participants.some((p) => p.visitor_id === hostVisitorId);
    if (!hostStillHere) {
      setView({ kind: "host-left" });
    }
  }, [view.kind, joinerPublicState, participants, hostVisitorId]);

  // Fire game_completed once when host reaches GAME_OVER normally (not on
  // host departure).
  const completedFiredRef = useRef(false);
  useEffect(() => {
    if (!gameEnabled) return;
    if (host.state.phase !== "GAME_OVER") return;
    if (completedFiredRef.current) return;
    completedFiredRef.current = true;
    const top = Math.max(...host.state.scores);
    const winners = host.state.scores
      .map((v, i) => (v === top ? i : -1))
      .filter((i) => i !== -1);
    trackEvent("game_completed", {
      roomCode: activeRoom?.room_code,
      metadata: {
        round_count: host.state.roundNum,
        winner_seat: winners.length === 1 ? winners[0] : null,
      },
    });
  }, [gameEnabled, host.state.phase, host.state.scores, host.state.roundNum, activeRoom]);

  useEffect(() => {
    if (!initialRoomCode) return;
    const normalized = initialRoomCode.toUpperCase();
    // Prefill the code so the player can see which table they are joining
    // before committing to it.
    setCodeInput(sanitizeCodeInput(normalized));
    setView({ kind: "name-prompt", intent: "peeps", via: "link" });
  }, [initialRoomCode]);

  const enterRoom = useCallback(
    async (action: PendingAction) => {
      setBusy(true);
      try {
        if (action.kind === "create") {
          const room = await createRoom(visitorId);
          trackEvent("room_created", { roomCode: room.room_code });
          setView({ kind: "host", room });
          return;
        }
        const code = action.code;
        const room = await findRoomByCode(code, visitorId);
        if (!room) {
          setView({
            kind: "idle",
            error:
              action.kind === "join-link"
                ? `Table "${code}" doesn't exist or has ended.`
                : `Table "${code}" doesn't exist.`,
          });
          if (action.kind === "join-link") {
            trackEvent("invite_link_clicked", { roomCode: code, metadata: { room_found: false } });
          }
          return;
        }
        if (action.kind === "join-link") {
          trackEvent("invite_link_clicked", { roomCode: code, metadata: { room_found: true } });
        }
        if (room.is_host) {
          setView({ kind: "host", room });
        } else {
          setView({ kind: "joiner", room });
          trackEvent("room_joined", {
            roomCode: room.room_code,
            metadata: { via: action.kind === "join-link" ? "link" : "code" },
          });
        }
      } catch (e) {
        console.error("[multiplayer] enterRoom failed", e);
        if (action.kind === "join-link") {
          trackEvent("invite_link_clicked", { roomCode: action.code, metadata: { room_found: false, error: true } });
        }
        setView({ kind: "idle", error: "Couldn't reach the table. Check your connection and try again." });
      } finally {
        setBusy(false);
      }
    },
    [visitorId],
  );

  const startRoomFlow = useCallback(() => {
    setNameInput(getDisplayName());
    setNameTouched(false);
    setView({ kind: "name-prompt", intent: "peeps" });
  }, []);

  const startSoloFlow = useCallback(() => {
    unlockAudio();
    setNameInput(getDisplayName());
    setNameTouched(false);
    setView({ kind: "name-prompt", intent: "solo" });
  }, []);

  /** First play click of the browser opens the gate; the action runs after. */
  const gateOr = useCallback((run: () => void) => {
    if (hasSeenMpHowTo()) {
      run();
      return;
    }
    setHowTo({ mode: "gate", then: run });
  }, []);

  const handleStartRoom = useCallback(() => {
    if (busy) return;
    gateOr(startRoomFlow);
  }, [busy, gateOr, startRoomFlow]);

  const handlePlaySolo = useCallback(() => {
    if (busy) return;
    gateOr(startSoloFlow);
  }, [busy, gateOr, startSoloFlow]);

  const openHowToReference = useCallback(() => setHowTo({ mode: "reference" }), []);

  const howToOverlay = howTo ? (
    <MultiplayerHowToSteps
      mode={howTo.mode}
      onStart={() => {
        const run = howTo.then;
        setHowTo(null);
        run?.();
      }}
      onClose={() => setHowTo(null)}
    />
  ) : null;


  const handleConfirmName = useCallback(() => {
    if (view.kind !== "name-prompt" || busy) return;
    unlockAudio();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setView({ ...view, error: "Enter a name so others can see who you are." });
      return;
    }
    const stored = setDisplayName(trimmed);
    setNameInput(stored);
    if (view.intent === "solo") {
      setView({ kind: "solo" });
      return;
    }
    // Peeps path: a code joins that table, an empty field starts a new one.
    const code = codeInput.toUpperCase();
    if (code.length === 0) {
      void enterRoom({ kind: "create" });
      return;
    }
    if (!isValidRoomCode(code)) {
      setView({ ...view, error: "That doesn't look like a valid table code." });
      return;
    }
    void enterRoom(view.via === "link" ? { kind: "join-link", code } : { kind: "join-code", code });
  }, [view, nameInput, codeInput, busy, enterRoom]);

  // Capacity guard — fixed to `>=` per spec so the "full" state matches
  // rather than admitting a 7th before flipping. (See: prompt 8.1.)
  useEffect(() => {
    if (!activeRoom) return;
    if (view.kind !== "joiner") return;
    if (participants.length >= ROOM_CAPACITY + 1) {
      setView({ kind: "full", code: activeRoom.room_code });
    }
  }, [participants.length, activeRoom, view]);

  const handleStartGame = useCallback(() => {
    if (!isHostView || participants.length < 2 || starting) return;
    unlockAudio();
    const seatMap: SeatMapEntry[] = participants.slice(0, ROOM_CAPACITY).map((p, i) => ({
      seat: i,
      visitor_id: p.visitor_id,
      display_name: p.display_name,
    }));
    setStarting(true);
    // Notify joiners so they can show a loading state immediately.
    try {
      channel?.send({ type: "broadcast", event: "msg", payload: { kind: "game_starting" } });
    } catch {
      /* non-fatal */
    }
    const newGameId = crypto.randomUUID();
    // Persist the frozen seat map so the claim arbiter can verify that a
    // WHOOP really comes from the seat it claims to come from.
    if (activeRoom?.id) {
      void supabase.rpc("register_room_seats", {
        p_room_id: activeRoom.id,
        p_game_id: newGameId,
        p_host_visitor_id: visitorId,
        p_seats: seatMap.map((e) => ({ seat: e.seat, visitor_id: e.visitor_id })),
      }).then(({ error }) => {
        if (error) console.error("[register_room_seats] failed", error);
      });
    }
    setGameId(newGameId);
    setFrozenSeats(seatMap);
    completedFiredRef.current = false;
    trackEvent("game_started", {
      roomCode: activeRoom?.room_code,
      metadata: { player_count: seatMap.length, grid_size: FIXED_GRID },
    });
  }, [isHostView, participants, activeRoom, starting, channel, visitorId]);

  // Joiner: listen for the host's game_starting notice.
  useEffect(() => {
    if (view.kind !== "joiner") return;
    const unsub = onBroadcast(({ payload }) => {
      if (!payload || typeof payload !== "object") return;
      if ((payload as { kind?: string }).kind === "game_starting") setStarting(true);
    });
    return unsub;
  }, [view.kind, onBroadcast]);

  const shareUrl = (code: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/play/${code}` : `/play/${code}`;

  const flashShare = useCallback(() => {
    setShareFlash(true);
    if (shareFlashTimerRef.current) window.clearTimeout(shareFlashTimerRef.current);
    shareFlashTimerRef.current = window.setTimeout(() => setShareFlash(false), 1200);
  }, []);

  const flashCode = useCallback(() => {
    setCodeFlash(true);
    if (codeFlashTimerRef.current) window.clearTimeout(codeFlashTimerRef.current);
    codeFlashTimerRef.current = window.setTimeout(() => setCodeFlash(false), 1200);
  }, []);

  const copyText = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      throw new Error("no clipboard");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  const handleShare = useCallback(async (code: string) => {
    const url = shareUrl(code);
    const shareData = {
      title: "WHOOP! WHOOP!",
      text: `Join my WHOOP! WHOOP! table — code ${code}`,
      url,
    };
    // Feature-detect Web Share API.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled: don't fall back or toast.
        const name = (err as { name?: string })?.name;
        if (name === "AbortError") return;
        // Other error (e.g. share failed) — fall through to clipboard.
      }
    }
    const ok = await copyText(url);
    if (ok) {
      toast.success("Link copied");
      flashShare();
    } else {
      toast.error("Share failed — select the link manually.");
    }
  }, [copyText, flashShare]);

  const handleCopyCode = useCallback(async (code: string) => {
    const ok = await copyText(code);
    if (ok) {
      flashCode();
    } else {
      toast.error("Copy failed");
    }
  }, [copyText, flashCode]);

  useEffect(() => () => {
    if (shareFlashTimerRef.current) window.clearTimeout(shareFlashTimerRef.current);
    if (codeFlashTimerRef.current) window.clearTimeout(codeFlashTimerRef.current);
  }, []);

  const leaveToIdle = useCallback(() => {
    setCodeInput("");
    setFrozenSeats(null);
    
    setGameId("");
    setStarting(false);
    setShowLeaveConfirm(false);
    setView({ kind: "idle" });
  }, []);


  // ---- Entry-screen chrome: the Daily's ready screen, copied ------------
  // Single centred 402px column on the themed ground, brand pattern strip top
  // and bottom (both from DailyFrame), the Classic lockup, one hero line, and
  // the Daily's chip cluster. No header, no stroked containers.
  const vh = useViewportHeight();
  const t = compressionFactor(vh);
  const colGap = lerpCompress(t, 12, 36);
  const framePad = lerpCompress(t, 12, 24);
  const railGap = lerpCompress(t, 10, 24);
  const lockupMax = lerpCompress(t, 120, 251);
  // Lobby / solo-setup: the same compression rhythm applied to the stacked
  // sections so the whole screen still fits at 390x520 with no scrolling.
  const sectionGap = lerpCompress(t, 10, SPACE[8]);
  const innerGap = lerpCompress(t, 6, SPACE[4]);
  const tileH = lerpCompress(t, 52, 80);

  const inputStyle: React.CSSProperties = {
    ...textStyle("control", mobile),
    padding: `${SPACE[4]}px ${SPACE[5]}px`,
    border: BORDER.heavy,
    borderRadius: RADIUS.md,
    background: COLORS.surface,
    color: COLORS.ink,
    flex: 1,
    minWidth: 0,
    outline: "none",
  };

  /** Section title on an entry screen. */
  const titleStyle: React.CSSProperties = {
    ...textStyle("title", mobile),
    textAlign: "center",
    color: COLORS.ink,
  };

  /** Dark utility button (BACK / Cancel) — fixed 100px rail. */
  const railButtonStyle = (disabled = false): React.CSSProperties => ({
    ...buttonStyle("ink", "lg", { mobile, disabled }),
    flex: "0 0 100px",
    width: 100,
    height: "100%",
    padding: 0,
  });

  /** Big italic CTA. */
  const playButtonStyle = (disabled = false): React.CSSProperties => ({
    ...buttonStyle("play", "lg", { mobile, disabled }),
    position: "relative",
    overflow: "hidden",
    flex: "1 1 0",
    minWidth: 0,
    height: "100%",
    padding: 0,
    opacity: 1,
    ...(disabled ? { background: COLORS.inkMuted, color: COLORS.panel } : null),
  });

  /** Inline error/alert strip. */
  const alertStyle: React.CSSProperties = {
    ...textStyle("body", mobile),
    alignSelf: "stretch",
    color: COLORS.red,
    border: `1.5px solid ${COLORS.red}`,
    borderRadius: RADIUS.sm,
    padding: `${SPACE[4]}px ${SPACE[6]}px`,
    background: COLORS.surface,
  };

  // Same chip base the Daily ready screen uses, same class for hover/focus.
  const chipButtonBase: React.CSSProperties = {
    ...textStyle("chip", mobile),
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxSizing: "border-box",
    minHeight: 36,
    padding: "8px 16px",
    border: "none",
    borderRadius: RADIUS.sm,
  };

  const chipRow = (
    <div style={{ display: "inline-flex", alignItems: "center", gap: SPACE[3] }}>
      <button
        type="button"
        className="ww-press daily-btn-howto"
        onClick={openHowToReference}
        style={chipButtonBase}
      >
        <HelpCircle size={16} aria-hidden="true" />
        How to Play
      </button>
      <button
        type="button"
        className="ww-press daily-btn-howto"
        onClick={() => setShowSettings(true)}
        aria-label="Settings"
        title="Settings"
        style={chipButtonBase}
      >
        <SettingsIcon size={16} aria-hidden="true" />
      </button>
    </div>
  );

  // Only the first lobby screen (the play-style chooser) gets the Classic
  // lockup and the How to Play / Settings chips — every later screen drops
  // both so they live in exactly one place.
  const entryFrame = (opts: {
    headline?: React.ReactNode;
    logo?: boolean;
    chips?: boolean;
    fade?: React.CSSProperties;
    children: React.ReactNode;
  }) => (
    <>
      <DailyFrame gap={colGap} pad={framePad} railGap={railGap} fill>
        <FitColumn>
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: colGap,
            ...opts.fade,
          }}
        >
          {opts.logo && (
            <DailyLogoLockup variant="classic" style={{ maxWidth: lockupMax }} />
          )}
          {opts.chips && chipRow}
          {opts.headline !== undefined && (
            <div style={{ ...textStyle("hero", mobile), textAlign: "center", color: COLORS.ink }}>
              {opts.headline}
            </div>
          )}
          {opts.children}
        </div>
        </FitColumn>
      </DailyFrame>
      {howToOverlay}
      {showSettings && (
        <SettingsSheet
          onClose={() => setShowSettings(false)}
          onHowTo={() => {
            setShowSettings(false);
            openHowToReference();
          }}
        />
      )}
    </>
  );

  // ---------- SOLO ----------
  if (view.kind === "solo") {
    return <SoloView onLeave={leaveToIdle} mobile={mobile} />;
  }

  // ---------- GAME IN PROGRESS: HOST ----------
  if (isHostView && frozenSeats !== null && activeRoom) {
    const publicState = toPublicState(
      host.state,
      frozenSeats,
      hostClaimWindowRef.current,
      gameId,
      disconnectedSeats,
      awaySeats,
    );
    return (
      <GameShell mobile={mobile}>
      <MultiplayerGameView
        publicState={publicState}
        mySeat={0}
        events={hostEvents}
        rollCommit={host.rollCommit ?? null}
        lastClaimReject={host.lastClaimReject ?? null}
        onIntent={(action) => {
          if (action.type === "REQUEST_ROLL") {
            host.commitAndRoll();
            return;
          }
          if (action.type === "PLAYER_ENTER_CLAIM") {
            return;
          }
          // Debug-only controls. Host-local: they never travel the wire.
          // The reducer re-checks ?debug=1, so without the flag these are
          // no-ops even if a button somehow renders.
          if (action.type === "DEBUG_DRAIN_DECK") {
            host.dispatch({ type: "DEBUG_DRAIN_DECK" });
            return;
          }
          if (action.type === "DEBUG_FORCE_END_GAME") {
            host.dispatch({ type: "DEBUG_FORCE_END_GAME" });
            return;
          }
          if (action.type === "NEW_GAME") {
            // Rematch: same seats, same grid size, scores reset to zero.
            host.dispatch({
              type: "INIT",
              slotCount: host.state.slotCount,
              seatCount: host.state.seatCount,
              names: host.state.names,
            });
            return;
          }
          if (action.type === "CANCEL_CLAIM") {
            host.dispatch({ type: "CANCEL_CLAIM", by: 0 });
          } else if (action.type === "PLAYER_SELECT_CARD") {
            host.dispatch({ type: "PLAYER_SELECT_CARD", by: 0, idx: action.idx });
          } else if (action.type === "PLAYER_RESOLVE_MATCH") {
            host.dispatch({ type: "PLAYER_RESOLVE_MATCH", by: 0 });
          } else if (action.type === "FLIP_START") {
            host.dispatch({ type: "FLIP_START", by: 0, idx: action.idx, token: action.token });
            setTimeout(() => {
              host.dispatch({ type: "FLIP_COMPLETE", token: action.token });
            }, 2000);
          }
        }}
        onLeave={leaveToIdle}
        mobile={mobile}
        roomId={activeRoom.id}
        visitorId={visitorId}
        isHost={true}
        presenceVisitorIds={participants.map((p) => p.visitor_id)}
        heartbeatStale={heartbeatStaleSeats}
        awaySkip={awaySkipSeats}
        hostDisconnectedSeats={disconnectedSeats}
        presenceStatus={presenceStatus}
      />
      </GameShell>
    );
  }

  // ---------- GAME IN PROGRESS: JOINER ----------
  if (view.kind === "joiner" && joinerPublicState && activeRoom) {
    return (
      <GameShell mobile={mobile}>
      <MultiplayerGameView
        publicState={joinerPublicState}
        mySeat={joinerSeat}
        events={joiner.events}
        rollCommit={joiner.rollCommit ?? null}
        lastClaimReject={joiner.lastClaimReject ?? null}
        onIntent={joiner.sendIntent}
        onLeave={leaveToIdle}
        mobile={mobile}
        roomId={activeRoom.id}
        visitorId={visitorId}
        isHost={false}
        presenceVisitorIds={participants.map((p) => p.visitor_id)}
        presenceStatus={presenceStatus}
      />
      </GameShell>
    );
  }

  if (view.kind === "host-left") {
    return entryFrame({
      headline: "The host left the game.",
      children: (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: SPACE[8] }}>
          <div style={{ ...textStyle("body", mobile), color: COLORS.inkMuted, textAlign: "center" }}>
            Games end when the host leaves. Start your own table to play again.
          </div>
          <AppButton variant="primary" tone="red" size="md" onClick={leaveToIdle} fullWidth>
            Back to lobby
          </AppButton>
        </div>
      ),
    });
  }

  if (view.kind === "name-prompt") {
    const NAME_CAP = DISPLAY_NAME_MAX;
    const canContinue = !busy && nameInput.trim().length > 0;
    const showCodeField = view.intent === "peeps";

    // Small copy on Classic follows the Daily's rule: Geist for metadata and
    // helper lines, Friend for headlines and controls.
    const smallCopy: React.CSSProperties = {
      ...textStyle("caption", mobile),
      fontFamily: FONT_FAMILY_UI,
      fontWeight: FONT_WEIGHT_UI,
    };

    return entryFrame({
      headline: "Pick a display name",
      children: (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: SPACE[8] }}>
          <div style={{ ...smallCopy, color: COLORS.inkMuted, textAlign: "center", whiteSpace: "pre-line" }}>
            {`Your display name is shown during game play.\nUp to ${NAME_CAP} characters.`}
          </div>

          {view.error && (
            <div role="alert" style={alertStyle}>
              {view.error}
            </div>
          )}

          {/* One plain text input. The six-box row read as decoration and hid
              the caret; a single field with a clear focus ring is honest. */}
          <input
            ref={hiddenNameInputRef}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value.slice(0, NAME_CAP))}
            onKeyDown={(e) => {
              // First keystroke on an untouched prefill replaces the whole
              // value: clear before the character lands so typing "ALPHA"
              // over "BRAVO" yields "ALPHA", not "BRAVOA".
              if (!nameTouched && nameInput.length > 0) {
                if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
                  setNameTouched(true);
                  setNameInput("");
                  if (e.key === "Backspace" || e.key === "Delete") e.preventDefault();
                }
              }
              if (e.key === "Enter" && canContinue) handleConfirmName();
            }}
            onPaste={(e) => {
              if (!nameTouched) {
                e.preventDefault();
                setNameTouched(true);
                setNameInput(e.clipboardData.getData("text").slice(0, NAME_CAP));
              }
            }}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            maxLength={NAME_CAP}
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="YOU"
            aria-label="Display name"
            style={{
              ...inputStyle,
              alignSelf: "stretch",
              flex: "none",
              width: "100%",
              boxSizing: "border-box",
              minHeight: CONTROL_H.lg,
              textAlign: "center",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              caretColor: COLORS.blue,
              border: nameFocused ? `3px solid ${COLORS.blue}` : BORDER.heavy,
              boxShadow: nameFocused ? `0 0 0 3px rgba(0,114,178,0.18)` : "none",
              transition: `box-shadow ${MOTION.fast}, border-color ${MOTION.fast}`,
            }}
          />

          {/* Table code — peeps path only. Empty starts a new table; a code
              joins an existing one. Arriving via /play/:roomCode prefills it.
              Brand orange marks it as the "join someone else" lane. */}
          {showCodeField && (
            <div
              style={{
                alignSelf: "stretch",
                display: "flex",
                flexDirection: "column",
                gap: SPACE[4],
                border: `2px solid ${COLORS.orange}`,
                borderRadius: RADIUS.md,
                padding: SPACE[6],
                boxSizing: "border-box",
              }}
            >
              <label
                htmlFor="table-code"
                style={{ ...smallCopy, color: COLORS.orange, textAlign: "center" }}
              >
                {"Already have a table code?\nLeave it blank to start your own."}
              </label>
              <input
                id="table-code"
                value={codeInput}
                onChange={(e) => setCodeInput(sanitizeCodeInput(e.target.value))}
                placeholder="ABC123"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={ROOM_CODE_LENGTH}
                aria-label="Table code"
                style={{
                  ...inputStyle,
                  alignSelf: "stretch",
                  flex: "none",
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: TOUCH_MIN,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textAlign: "center",
                  color: COLORS.orange,
                  caretColor: COLORS.orange,
                  border: `2px solid ${COLORS.orange}`,
                }}
              />
            </div>
          )}

          {/* Button row */}
          <div style={{ alignSelf: "stretch", display: "flex", gap: SPACE[5], height: 72 }}>
            <button
              type="button"
              onClick={leaveToIdle}
              disabled={busy}
              style={{ ...railButtonStyle(busy), opacity: 1 }}
            >
              <AutoFitText minScale={0.6}>Back</AutoFitText>
            </button>
            <button
              type="button"
              onClick={handleConfirmName}
              disabled={!canContinue}
              className={canContinue ? "ww-press" : undefined}
              style={{ ...playButtonStyle(!canContinue), opacity: canContinue ? 1 : 0.7 }}
            >
              <AutoFitText minScale={0.55}>
                {busy ? "Connecting…" : showCodeField ? "Join Table" : "Let's Play!"}
              </AutoFitText>
            </button>
          </div>
        </div>
      ),
    });
  }

  if (view.kind === "full") {
    return entryFrame({
      headline: `Table "${view.code}" is full.`,
      children: (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: SPACE[8] }}>
          <div style={{ ...textStyle("body", mobile), color: COLORS.inkMuted, textAlign: "center" }}>
            Tables hold up to {ROOM_CAPACITY} players.
          </div>
          <AppButton variant="secondary" tone="ink" size="md" onClick={leaveToIdle} fullWidth>
            Back
          </AppButton>
        </div>
      ),
    });
  }

  if (view.kind === "idle") {
    const introRunning = introStatus === "running";
    const introComplete = introStatus === "complete";
    // The intro's final frame lands on the lockup, so the column only fades in
    // once the intro has handed over. Nothing else animates.
    const fade: React.CSSProperties = introRunning
      ? { opacity: 0, pointerEvents: "none" }
      : introComplete
      ? { opacity: 1, transition: `opacity ${MOTION.base} 120ms` }
      : { opacity: 1 };

    const playModeTileStyle = (bg: string): React.CSSProperties => ({
      flex: 1,
      minHeight: 96,
      background: bg,
      border: BORDER.heavy,
      borderRadius: RADIUS.md,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: SPACE[8],
      gap: SPACE[4],
      cursor: busy ? "default" : "pointer",
      opacity: busy ? 0.7 : 1,
      transition: `opacity ${MOTION.fast}`,
    });
    const playModeLabelStyle = (color: string): React.CSSProperties => ({
      ...textStyle("title", mobile),
      color,
      textAlign: "center",
    });

    return entryFrame({
      headline: "How do you want to play today?",
      logo: true,
      chips: true,
      fade,
      children: (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: SPACE[8] }}>
          {view.error && (
            <div role="alert" style={alertStyle}>
              {view.error}
            </div>
          )}

          <div style={{ alignSelf: "stretch", display: "flex", gap: SPACE[8] }}>
            <button
              type="button"
              onClick={handlePlaySolo}
              disabled={busy}
              style={playModeTileStyle(COLORS.blue)}
              aria-label="Play Solo"
            >
              <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
                <circle cx="16" cy="11" r="5" fill="none" stroke={COLORS.soloTint} strokeWidth="2.5" />
                <path d="M6 27c2-5 6-7 10-7s8 2 10 7" fill="none" stroke={COLORS.soloTint} strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <div style={playModeLabelStyle(COLORS.soloTint)}>Play Solo</div>
            </button>

            <button
              type="button"
              onClick={handleStartRoom}
              disabled={busy}
              style={playModeTileStyle(COLORS.red)}
              aria-label="Play with Peeps"
            >
              <svg width="64" height="32" viewBox="0 0 64 32" aria-hidden="true">
                <circle cx="16" cy="12" r="5" fill="none" stroke={COLORS.peepsTint} strokeWidth="2.5" />
                <path d="M6 28c2-5 5-7 10-7s8 2 10 7" fill="none" stroke={COLORS.peepsTint} strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="48" cy="12" r="5" fill="none" stroke={COLORS.peepsTint} strokeWidth="2.5" />
                <path d="M38 28c2-5 5-7 10-7s8 2 10 7" fill="none" stroke={COLORS.peepsTint} strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <div style={playModeLabelStyle(COLORS.peepsTint)}>Play with Peeps</div>
            </button>
          </div>

          <a
            href="/"
            className="ww-daily-link"
            style={{
              ...textStyle("captionItalic", mobile),
              fontFamily: FONT_FAMILY_UI,
              fontWeight: FONT_WEIGHT_UI,
              color: COLORS.inkMuted,
              textAlign: "center",
              alignSelf: "center",
              marginTop: sectionGap,
              textDecoration: "none",
            }}
          >
            Looking for Whoop! Whoop! Daily?
          </a>
        </div>
      ),
    });
  }

  // Host/Joiner LOBBY view (game not yet started).
  const room = (view as { room: RoomRow }).room;
  const isHost = view.kind === "host";
  const visibleParticipants = participants;
  const canStart = visibleParticipants.length >= 2;
  const link = shareUrl(room.room_code);

  const sectionTitleStyle = titleStyle;

  const sectionStyle: React.CSSProperties = {
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: innerGap,
  };

  // ---- Section 1: Your Table Info ----
  const codeTileLabel = codeFlash ? "Copied" : `Tap to copy code ${room.room_code}`;
  const tableInfoSection = (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Your Table Info</div>
      <div style={{ display: "flex", gap: SPACE[5], height: tileH, alignSelf: "stretch" }}>
        <button
          type="button"
          onClick={() => handleCopyCode(room.room_code)}
          aria-label={codeTileLabel}
          aria-live="polite"
          style={{
            ...buttonStyle("accent", "lg", { mobile }),
            ...textStyle("action", mobile),
            color: COLORS.ink,
            flex: "1 1 0",
            minWidth: 0,
            height: "100%",
            padding: 0,
            fontStyle: "normal",
            letterSpacing: "0.08em",
            userSelect: "none",
          }}
        >
          <AutoFitText minScale={0.5}>{codeFlash ? "Copied" : room.room_code}</AutoFitText>
        </button>
        {isHost ? (
          <button
            type="button"
            onClick={() => handleShare(room.room_code)}
            aria-live="polite"
            style={{
              ...buttonStyle(shareFlash ? "ink" : "secondary", "lg", { mobile }),
              flex: "0 0 100px",
              width: 100,
              height: "100%",
              padding: 0,
            }}
          >
            <AutoFitText minScale={0.5}>{shareFlash ? "Copied!" : "SHARE"}</AutoFitText>
          </button>
        ) : null}
      </div>
    </div>
  );


  // ---- Section 3: Players ----
  const seatSlots = Array.from({ length: ROOM_CAPACITY }, (_, i) => visibleParticipants[i] ?? null);

  const playersSection = (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Players (must have at least 2)</div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: innerGap,
      }}>
        {seatSlots.map((p, i) => {
          const isYou = !!p && p.visitor_id === visitorId;
          const name = p ? (p.display_name || p.visitor_id.slice(0, 6)) : "---";
          const label = p ? (isYou ? `${name} (you)` : name) : "---";
          return (
            <div key={i} style={{
              height: lerpCompress(t, 30, CONTROL_H.sm),
              padding: innerGap,
              display: "flex",
              alignItems: "center",
              gap: SPACE[4],
              background: COLORS.surface,
              border: BORDER.heavy,
              borderRadius: RADIUS.sm,
              boxSizing: "border-box",
              minWidth: 0,
            }}>
              <div style={{
                ...textStyle("body", mobile),
                lineHeight: 1,
                width: SPACE[10],
                height: SPACE[10],
                background: COLORS.ink,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                letterSpacing: "0.02em",
                color: COLORS.panel,
                flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <div style={{
                ...textStyle("body", mobile),
                lineHeight: 1,
                letterSpacing: "0.04em",
                color: COLORS.ink,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
                flex: 1,
              }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ---- Section 4: Buttons ----
  const startDisabled = !canStart || starting;
  const buttonsSection = (
    <div style={{ display: "flex", gap: SPACE[4], height: tileH, alignSelf: "stretch" }}>
      <button
        type="button"
        onClick={() => setShowLeaveConfirm(true)}
        disabled={starting}
        className="ww-press" style={{ ...railButtonStyle(starting), opacity: starting ? 0.6 : 1 }}
      >
        <AutoFitText minScale={0.6}>BACK</AutoFitText>
      </button>
      {isHost ? (
        <button
          type="button"
          onClick={handleStartGame}
          disabled={startDisabled}
          aria-busy={starting}
          className={startDisabled ? undefined : "ww-press"} style={playButtonStyle(startDisabled)}
        >
          {!startDisabled ? (
            <>
              <span className="ww-shine-thin" aria-hidden="true" style={{ pointerEvents: "none", background: "#F8F2E9", transformOrigin: "0 0" }} />
              <span className="ww-shine-wide" aria-hidden="true" style={{ pointerEvents: "none", background: "#F8F2E9", transformOrigin: "0 0" }} />
            </>
          ) : null}
          <AutoFitText minScale={0.55}>{starting ? "Starting…" : "Let's Play!"}</AutoFitText>
        </button>
      ) : null}
    </div>
  );


  const statusBarStyle: React.CSSProperties = {
    ...textStyle("control", mobile),
    ...panelStyle("panel", 8),
    alignSelf: "stretch",
    borderRadius: RADIUS.sm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE[6],
    fontStyle: "italic",
    color: COLORS.ink,
    textAlign: "center",
  };

  const startingBanner = starting ? (
    <div role="status" aria-live="polite" style={statusBarStyle}>
      <span
        aria-hidden="true"
        style={{
          width: SPACE[8],
          height: SPACE[8],
          borderRadius: "50%",
          border: BORDER.heavy,
          borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
          display: "inline-block",
        }}
      />
      Starting game…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ) : null;

  const leaveConfirmDialog = showLeaveConfirm ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-confirm-title"
      onClick={(e) => { if (e.target === e.currentTarget) setShowLeaveConfirm(false); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(35, 31, 32, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: SPACE[8],
        zIndex: 1000,
      }}
    >
      <div style={{
        ...panelStyle("surface", 8),
        width: "100%",
        maxWidth: 340,
        display: "flex",
        flexDirection: "column",
        gap: SPACE[8],
      }}>
        <div
          id="leave-confirm-title"
          style={{ ...textStyle("title", mobile), fontStyle: "italic", color: COLORS.ink }}
        >
          Leave the table?
        </div>
        <div style={{ ...textStyle("body", mobile), color: COLORS.ink }}>
          {isHost
            ? "The table will end for everyone if you leave."
            : "You'll drop out of this lobby."}
        </div>
        <div style={{ display: "flex", gap: SPACE[5] }}>
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(false)}
            autoFocus
            style={{
              ...buttonStyle("quiet", "lg", { mobile }),
              flexGrow: 1,
              height: CONTROL_H.lg + SPACE[2],
              padding: 0,
            }}
          >
            <AutoFitText minScale={0.6}>Stay</AutoFitText>
          </button>
          <button
            type="button"
            onClick={leaveToIdle}
            style={{
              ...buttonStyle("danger", "lg", { mobile }),
              fontStyle: "italic",
              flexGrow: 1,
              height: CONTROL_H.lg + SPACE[2],
              padding: 0,
            }}
          >
            <AutoFitText minScale={0.6}>Leave</AutoFitText>
          </button>
        </div>
      </div>
    </div>
  ) : null;


  const joinerStatusBar = !isHost ? (
    <div style={{ ...statusBarStyle, height: CONTROL_H.lg + SPACE[2] }}>
      Your host will start the game soon.
    </div>
  ) : null;

  return entryFrame({
    logo: false,
    headline: isHost ? "Your table is ready." : "You're at the table.",
    children: (
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: sectionGap }}>
        {joinerStatusBar}
        {startingBanner}
        {tableInfoSection}
        {playersSection}
        {buttonsSection}
        {leaveConfirmDialog}
      </div>
    ),
  });

};

export default MultiplayerWindow;
