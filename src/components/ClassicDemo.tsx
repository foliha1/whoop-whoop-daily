// ============================================================================
// ClassicDemo — the scripted animated demo that replaced the How to Play
// stepper (the prose stepper was opened 48 times, skipped 29, finished 4).
//
// It is a short FIXED game played *to* the player on the real board: real
// GameCard, real MatchDie, the real ChipCell score chips and the real
// ActionButton, driven with the real timing constants. Nothing is a mock-up, so
// the same machinery can later be reused as an in-game hint.
//
// Structure:
//   • SCRIPT — fifteen steps. Each step has an `enter` patch applied the moment
//     the step opens, and `beats` (ms → patch, with an optional sound) that play
//     out afterwards. A step's settled frame is `enter` + every beat, which is
//     what reduced motion and BACK both render immediately.
//   • Scene — the whole visible board state. Steps only ever patch it, so the
//     board carries forward exactly like a real game.
//   • DemoSpotlight — the one spotlight + tooltip implementation, used
//     identically by every step. `spot` names the lit regions, `lit` narrows the
//     lighting to individual card positions inside the grid.
//
// The player advances; there are no timers between steps. Nothing here touches
// the reducer, the arbiter or the Daily.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePortalHost } from "@/hooks/usePortalHost";
import { useDismiss } from "@/hooks/useDismiss";
import GameCard from "@/components/GameCard";
import MatchDie, { landedComponentsFor } from "@/components/MatchDie";
import { ActionButton, ChipCell, type ButtonKind, type DerivedChip } from "@/components/MultiplayerGameView";
import CloseButton from "@/components/CloseButton";
import DemoSpotlight, { type SpotPlacement } from "@/components/DemoSpotlight";
import { ALL_CARDS, type Card } from "@/cardData";
import type { RollAttribute } from "@/lib/multiplayer";
import { TARGET_SCORE } from "@/hooks/useGameState";
import { trackEvent } from "@/lib/analytics";
import {
  playCorrect,
  playDeal,
  playDiceRoll,
  playDieLand,
  playFlip,
  playSelect,
  playWhoopCall,
  playWrong,
} from "@/lib/sounds";
import {
  CARD_FLIP_MS,
  DAILY_MATCH_GREAT_MS,
  DEMO_BEAT_MS,
  DEMO_DIE_EASE,
  DEMO_DIE_ROLL_MS,
  DEMO_HOLD_MS,
  DEMO_SCORE_TICK_MS,
  SETTLE_REVEAL_HOLD_MS,
  WRONG_ANIM_MS,
} from "@/lib/animationTiming";
import {
  BORDER,
  COLORS,
  MOTION,
  RADIUS,
  RAW,
  SPACE,
  buttonStyle,
  panelStyle,
  textStyle,
} from "@/lib/tokens";

/* ------------------------------------------------------------------ *
 * First-run flag. Replaces the retired stepper's `ww_mp_howto_seen`.
 * ------------------------------------------------------------------ */
const SEEN_KEY = "ww_classic_demo_seen";

export function hasSeenClassicDemo(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked: never trap the player behind the gate
  }
}

export function markClassicDemoSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * The fixed board. Always dealt exactly like this so the copy can name
 * specific cards. Positions are 1..9, never numbered on screen.
 * ------------------------------------------------------------------ */
const CARD_BY_ID = new Map<string, Card>(ALL_CARDS.map((c) => [c.id, c]));
const card = (id: string): Card => {
  const c = CARD_BY_ID.get(id);
  if (!c) throw new Error(`ClassicDemo: unknown card ${id}`);
  return c;
};

/** "Orange" in the copy is the deck's `yellow` ink (#E79024). */
const BOARD: Record<number, string> = {
  1: "circle-3-red",
  2: "star-1-blue",
  3: "square-4-yellow",
  4: "tri-2-blue",
  5: "square-1-red",
  6: "circle-2-yellow",
  7: "square-3-blue",
  8: "tri-1-yellow",
  9: "star-4-red",
};

/** Refills after the player wins positions 1 and 5. Only those two. */
const REFILL: Record<number, string> = { 1: "square-2-blue", 5: "star-3-yellow" };

const POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/* ------------------------------------------------------------------ *
 * Scene — everything visible.
 * ------------------------------------------------------------------ */
type SpotKey = "grid" | "die" | "button" | "chipYou" | "chipWhoop" | "all";
type ChipKindName = "IDLE" | "WHOOP" | "GREAT_MATCH" | "ROLLING" | "FLIPPING" | "PENALTY";

interface Scene {
  cards: Record<number, string>;
  /** Deal-in identity per position; changing it replays the real deal-in. */
  deal: Record<number, { key: string; index: number }>;
  faceUp: number[];
  selected: number[];
  matched: number[];
  wrong: number[];
  /** Face up and spent for this round — the wrong-claim treatment. */
  burned: number[];
  /** Won and gone: the slot is empty until it refills. */
  removed: number[];
  /** The shared active-claim board pulse. */
  pulsing: boolean;
  rule: RollAttribute | null;
  /** Number of rolls so far; drives the tumble's accumulated turns. */
  rolls: number;
  myScore: number;
  whoopScore: number;
  myChip: ChipKindName;
  whoopChip: ChipKindName;
  button: ButtonKind;
  buttonLabel?: string;
  spot: SpotKey[];
  /** Positions that stay bright while the grid is lit. Empty = all of them. */
  lit: number[];
}

const BASE: Scene = {
  cards: { ...BOARD },
  deal: {},
  faceUp: [],
  selected: [],
  matched: [],
  wrong: [],
  burned: [],
  removed: [],
  pulsing: false,
  rule: null,
  rolls: 0,
  myScore: 0,
  whoopScore: 0,
  myChip: "IDLE",
  whoopChip: "IDLE",
  button: "DISABLED",
  spot: ["grid"],
  lit: [],
};

interface Beat {
  at: number;
  patch: Partial<Scene>;
  sound?: () => void;
}

interface Step {
  copy: string;
  /** Region the tooltip hangs off, and which side it sits on. */
  anchor: Exclude<SpotKey, "all">;
  placement: SpotPlacement;
  enter: Partial<Scene>;
  beats: Beat[];
}

const dealAll = (): Scene["deal"] =>
  Object.fromEntries(POSITIONS.map((p) => [p, { key: `${p}-deal1`, index: p - 1 }]));

/* ------------------------------------------------------------------ *
 * THE SCRIPT — fifteen steps.
 * ------------------------------------------------------------------ */
const SCRIPT: Step[] = [
  // 1 — The table.
  {
    copy: "Nine cards, face down. Two to six players. You do not know what any of them are yet.",
    anchor: "grid",
    placement: "bottom",
    enter: { spot: ["grid"], lit: [], deal: dealAll() },
    beats: [{ at: 0, patch: {}, sound: playDeal }],
  },
  // 2 — The die decides.
  {
    copy:
      "This die decides what counts as a match. This round it says colour, so you are hunting two cards that share one. It changes every round.",
    anchor: "die",
    placement: "top",
    enter: { spot: ["die"], lit: [] },
    beats: [
      { at: DEMO_BEAT_MS, patch: { rule: "COLOR", rolls: 1 }, sound: playDiceRoll },
      { at: DEMO_BEAT_MS + DEMO_DIE_ROLL_MS, patch: {}, sound: playDieLand },
    ],
  },
  // 3 — Your first flip.
  {
    copy: "On your turn you flip a card so everyone can see it. Red Circle 3. Remember where it is.",
    anchor: "grid",
    placement: "bottom",
    enter: { spot: ["grid"], lit: [1], myChip: "FLIPPING" },
    beats: [
      { at: DEMO_BEAT_MS, patch: { faceUp: [1] }, sound: playFlip },
      {
        at: DEMO_BEAT_MS + CARD_FLIP_MS + DEMO_HOLD_MS,
        patch: { faceUp: [] },
        sound: playFlip,
      },
    ],
  },
  // 4 — Your second flip.
  {
    copy: "You get two flips on your turn. Red Square 1. That is your turn done.",
    anchor: "grid",
    placement: "bottom",
    enter: { spot: ["grid"], lit: [5], myChip: "FLIPPING" },
    beats: [
      { at: DEMO_BEAT_MS, patch: { faceUp: [5] }, sound: playFlip },
      {
        at: DEMO_BEAT_MS + CARD_FLIP_MS + DEMO_HOLD_MS,
        patch: { faceUp: [], myChip: "IDLE" },
        sound: playFlip,
      },
    ],
  },
  // 5 — WHOOP's turn.
  {
    copy:
      "Now it is WHOOP's turn. Watch their flips too — every flip is public. Blue Square 3. Red Star 4.",
    anchor: "grid",
    placement: "bottom",
    enter: { spot: ["chipWhoop"], lit: [], whoopChip: "FLIPPING" },
    beats: [
      {
        at: DEMO_BEAT_MS,
        patch: { spot: ["chipWhoop", "grid"], lit: [7], faceUp: [7] },
        sound: playFlip,
      },
      {
        at: DEMO_BEAT_MS + CARD_FLIP_MS + DEMO_HOLD_MS,
        patch: { lit: [9], faceUp: [9] },
        sound: playFlip,
      },
      {
        at: DEMO_BEAT_MS + 2 * (CARD_FLIP_MS + DEMO_HOLD_MS),
        patch: { faceUp: [], lit: [7, 9], whoopChip: "IDLE" },
        sound: playFlip,
      },
    ],
  },
  // 6 — Call it.
  {
    copy: "Spotted a match? Call it. You can call at any moment — on your turn, on someone else's, whenever.",
    anchor: "button",
    placement: "top",
    enter: { spot: ["button"], lit: [], button: "WHOOP", buttonLabel: undefined },
    beats: [],
  },
  // 7 — The call.
  {
    copy: "When anyone calls, the whole board lights up blue. Everyone at the table knows a call is happening.",
    anchor: "grid",
    placement: "bottom",
    enter: {
      spot: ["grid"],
      lit: [],
      pulsing: true,
      myChip: "WHOOP",
      button: "SELECT_MATCH",
    },
    beats: [{ at: 0, patch: {}, sound: playWhoopCall }],
  },
  // 8 — Pick two.
  {
    copy: "Tap two cards. The second tap locks it in. Two reds. The die said colour. That is a match.",
    anchor: "grid",
    placement: "bottom",
    enter: { spot: ["grid"], lit: [1, 5], pulsing: true },
    beats: [
      { at: DEMO_BEAT_MS, patch: { selected: [1] }, sound: playSelect },
      { at: 2 * DEMO_BEAT_MS, patch: { selected: [1, 5] }, sound: playSelect },
      {
        at: 3 * DEMO_BEAT_MS,
        patch: { selected: [], faceUp: [1, 5], pulsing: false },
        sound: playFlip,
      },
      {
        at: 3 * DEMO_BEAT_MS + SETTLE_REVEAL_HOLD_MS,
        patch: { matched: [1, 5] },
        sound: playCorrect,
      },
      {
        at: 3 * DEMO_BEAT_MS + SETTLE_REVEAL_HOLD_MS + DAILY_MATCH_GREAT_MS,
        patch: { matched: [], faceUp: [], removed: [1, 5], myChip: "GREAT_MATCH" },
      },
    ],
  },
  // 9 — What you won.
  {
    copy:
      "Both cards go to you. Two points. First to twelve cards wins. Two new cards fill the gaps — only those two. Everything else stays exactly where it was.",
    anchor: "grid",
    placement: "bottom",
    enter: { spot: ["chipYou"], lit: [] },
    beats: [
      { at: DEMO_BEAT_MS, patch: { myScore: 1 } },
      { at: DEMO_BEAT_MS + DEMO_SCORE_TICK_MS, patch: { myScore: 2 } },
      {
        at: 2 * DEMO_BEAT_MS + DEMO_SCORE_TICK_MS,
        patch: {
          spot: ["chipYou", "grid"],
          lit: [1, 5],
          removed: [],
          myChip: "IDLE",
          cards: { ...BOARD, ...REFILL },
          deal: {
            ...dealAll(),
            1: { key: "1-deal2", index: 0 },
            5: { key: "5-deal2", index: 1 },
          },
        },
        sound: playDeal,
      },
    ],
  },
  // 10 — You take the die.
  {
    copy:
      "Winning a match hands you the die. You roll the next rule and you flip first. It says shape now. The cards did not move, but what matters about them just changed.",
    anchor: "die",
    placement: "top",
    enter: { spot: ["die"], lit: [], myChip: "ROLLING" },
    beats: [
      { at: DEMO_BEAT_MS, patch: { rule: "SHAPE", rolls: 2 }, sound: playDiceRoll },
      { at: DEMO_BEAT_MS + DEMO_DIE_ROLL_MS, patch: { myChip: "IDLE" }, sound: playDieLand },
    ],
  },
  // 11 — Getting it wrong.
  {
    copy:
      "Blue Star and Blue Triangle. Both blue — but the die says shape now, and a star is not a triangle. That is a miss.",
    anchor: "grid",
    placement: "bottom",
    enter: {
      spot: ["grid"],
      lit: [2, 4],
      pulsing: true,
      myChip: "WHOOP",
      button: "SELECT_MATCH",
    },
    beats: [
      { at: DEMO_BEAT_MS, patch: { selected: [2] }, sound: playSelect },
      { at: 2 * DEMO_BEAT_MS, patch: { selected: [2, 4] }, sound: playSelect },
      {
        at: 3 * DEMO_BEAT_MS,
        patch: { selected: [], faceUp: [2, 4], pulsing: false },
        sound: playFlip,
      },
      {
        at: 3 * DEMO_BEAT_MS + SETTLE_REVEAL_HOLD_MS,
        patch: { wrong: [2, 4] },
        sound: playWrong,
      },
      {
        at: 3 * DEMO_BEAT_MS + SETTLE_REVEAL_HOLD_MS + WRONG_ANIM_MS,
        patch: { wrong: [], faceUp: [2, 4], myChip: "PENALTY", button: "WHOOP" },
      },
    ],
  },
  // 12 — What a miss costs.
  {
    copy:
      "Three things happen. One card goes back to the deck, from the cards you already won. Those two stay face up for the rest of the round, so everyone can see them. And you cannot use those two again this round — everybody else still can.\nMissing does not use up a flip. If you had one left, you still do.",
    anchor: "grid",
    placement: "bottom",
    enter: { spot: ["chipYou"], lit: [] },
    beats: [
      { at: DEMO_BEAT_MS, patch: { myScore: 1 } },
      {
        at: 2 * DEMO_BEAT_MS,
        patch: { spot: ["chipYou", "grid"], lit: [2, 4], faceUp: [2, 4] },
      },
      {
        at: 2 * DEMO_BEAT_MS + DEMO_HOLD_MS,
        patch: { burned: [2, 4], myChip: "IDLE" },
      },
    ],
  },
  // 13 — Two calls each.
  {
    copy: "You get two calls per round. Use both and you sit out the rest of the round. Your flips still count.",
    anchor: "button",
    placement: "top",
    enter: { spot: ["button"], lit: [], button: "WHOOP", buttonLabel: "1 CALL LEFT" },
    beats: [],
  },
  // 14 — WHOOP calls.
  {
    copy:
      "Anyone can call, not just you. Orange Square and Blue Square — both squares, so WHOOP takes the pair and the die. Now they set the next rule.",
    anchor: "grid",
    placement: "bottom",
    enter: { spot: ["chipWhoop"], lit: [], whoopChip: "WHOOP", button: "DISABLED", buttonLabel: undefined },
    beats: [
      { at: 0, patch: {}, sound: playWhoopCall },
      {
        at: DEMO_BEAT_MS,
        patch: { spot: ["chipWhoop", "grid"], lit: [3, 7], pulsing: true, selected: [3] },
        sound: playSelect,
      },
      { at: 2 * DEMO_BEAT_MS, patch: { selected: [3, 7] }, sound: playSelect },
      {
        at: 3 * DEMO_BEAT_MS,
        patch: { selected: [], pulsing: false, faceUp: [2, 4, 3, 7] },
        sound: playFlip,
      },
      {
        at: 3 * DEMO_BEAT_MS + SETTLE_REVEAL_HOLD_MS,
        patch: { matched: [3, 7], whoopChip: "GREAT_MATCH" },
        sound: playCorrect,
      },
      {
        at: 3 * DEMO_BEAT_MS + SETTLE_REVEAL_HOLD_MS + DAILY_MATCH_GREAT_MS,
        patch: {
          matched: [],
          removed: [3, 7],
          faceUp: [2, 4],
          whoopScore: 2,
          whoopChip: "ROLLING",
        },
      },
    ],
  },
  // 15 — That is it.
  {
    copy: "",
    anchor: "grid",
    placement: "bottom",
    enter: { spot: ["all"], lit: [] },
    beats: [],
  },
];

const LAST = SCRIPT.length - 1;

/* ------------------------------------------------------------------ *
 * Folding the script. `enterScene(i)` is the frame a step opens on;
 * `settledScene(i)` is the frame it ends on — what reduced motion and
 * BACK both render immediately.
 * ------------------------------------------------------------------ */
function fold(upTo: number, includeBeatsOfLast: boolean): Scene {
  let s: Scene = { ...BASE };
  for (let i = 0; i <= upTo; i += 1) {
    const step = SCRIPT[i];
    s = { ...s, ...step.enter };
    if (i < upTo || includeBeatsOfLast) {
      for (const b of step.beats) s = { ...s, ...b.patch };
    }
  }
  return s;
}

const enterScene = (i: number): Scene => fold(i, false);
const settledScene = (i: number): Scene => fold(i, true);

const useReducedMotion = (): boolean => {
  const [reduce, setReduce] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
};

/** Card width that lets three rows fit the space the board is given. */
const GRID_GAP = SPACE[3];
const CARD_RATIO = 7 / 5;

const useCardWidth = (): [React.RefObject<HTMLDivElement>, number] => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const byWidth = (box.width - 2 * GRID_GAP) / 3;
      const byHeight = (box.height - 2 * GRID_GAP) / 3 / CARD_RATIO;
      setW(Math.max(0, Math.floor(Math.min(byWidth, byHeight))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};

const dieRotation = (rule: RollAttribute | null, rolls: number): string => {
  if (!rule) return "rotateX(-24deg) rotateY(36deg)";
  const { x, y } = landedComponentsFor(rule, 0);
  return `rotateX(${x - 720 * rolls}deg) rotateY(${y + 1080 * rolls}deg)`;
};

/* ------------------------------------------------------------------ *
 * The demo.
 *
 * `mode` is how the two contexts are told apart. `in-game` is passed only
 * by MultiplayerGameView, which renders this from the IN-GAME settings
 * sheet — so the player is seated by construction. Every exit in that mode
 * closes the overlay and returns them to their table; nothing navigates,
 * and the seat is never touched.
 * ------------------------------------------------------------------ */
let lastOpen: { mode: string; at: number } = { mode: "", at: 0 };

export interface ClassicDemoProps {
  mode: "gate" | "reference" | "in-game";
  /** Proceed to wherever the player was headed (gate), or start play. */
  onStart: () => void;
  /** Dismiss without proceeding (reference), or return to the table (in-game). */
  onClose: () => void;
  onPlaySolo?: () => void;
  onPlayPeeps?: () => void;
}

const ClassicDemo: React.FC<ClassicDemoProps> = ({
  mode,
  onStart,
  onClose,
  onPlaySolo,
  onPlayPeeps,
}) => {
  const portalHost = usePortalHost("classic-demo");
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [scene, setScene] = useState<Scene>(() => enterScene(0));
  const [gridRef, cardW] = useCardWidth();
  const timers = useRef<number[]>([]);

  useEffect(() => {
    markClassicDemoSeen();
    if (!(lastOpen.mode === mode && Date.now() - lastOpen.at < 2000)) {
      lastOpen = { mode, at: Date.now() };
      trackEvent("classic_demo_opened", { metadata: { mode } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the current step: open on its entry frame, then play its beats.
  // Reduced motion holds the settled frame instead of skipping the beat.
  useEffect(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
    if (reduce) {
      setScene(settledScene(step));
      return;
    }
    setScene(enterScene(step));
    const beats = SCRIPT[step].beats;
    for (const beat of beats) {
      const id = window.setTimeout(() => {
        setScene((prev) => ({ ...prev, ...beat.patch }));
        beat.sound?.();
      }, beat.at);
      timers.current.push(id);
    }
    return () => {
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
  }, [step, reduce]);

  const finish = useCallback(() => {
    markClassicDemoSeen();
    trackEvent("classic_demo_finished", { metadata: { mode } });
    if (mode === "in-game") onClose();
    else onStart();
  }, [mode, onClose, onStart]);

  const skip = useCallback(() => {
    markClassicDemoSeen();
    trackEvent("classic_demo_skipped", { metadata: { mode, step: step + 1 } });
    // Skip goes straight where the player was headed; a seated player's only
    // correct destination is their own table.
    if (mode === "gate") onStart();
    else onClose();
  }, [mode, onClose, onStart, step]);

  useDismiss(skip, { escape: true, returnFocus: true });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(LAST, s + 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const spotAll = scene.spot.includes("all");
  const lit = (key: Exclude<SpotKey, "all">) => spotAll || scene.spot.includes(key);
  const current = SCRIPT[step];
  const tip = (key: Exclude<SpotKey, "all">, placement: SpotPlacement) =>
    current.anchor === key && current.copy && step !== LAST
      ? { tooltip: current.copy, placement }
      : {};

  const cardOpacity = (pos: number) =>
    !spotAll && scene.spot.includes("grid") && scene.lit.length > 0 && !scene.lit.includes(pos)
      ? 0.35
      : 1;

  const chip = (name: string, kind: ChipKindName, score: number, seat: number): DerivedChip =>
    ({ kind, name, score, seat } as DerivedChip);

  const grid = (
    <div
      ref={gridRef}
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(3, ${cardW}px)`,
          gap: GRID_GAP,
        }}
      >
        {POSITIONS.map((pos) => {
          const removed = scene.removed.includes(pos);
          return (
            <div
              key={pos}
              style={{
                width: cardW,
                height: Math.round(cardW * CARD_RATIO),
                opacity: cardOpacity(pos),
                transition: `opacity ${MOTION.base}`,
              }}
            >
              {removed ? (
                <div
                  aria-hidden="true"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: RADIUS.md,
                    border: BORDER.standard,
                    opacity: 0.35,
                    boxSizing: "border-box",
                  }}
                />
              ) : (
                <GameCard
                  card={card(scene.cards[pos])}
                  faceUp={scene.faceUp.includes(pos) || scene.burned.includes(pos)}
                  fill
                  interactive={false}
                  highlighted={scene.selected.includes(pos)}
                  matched={scene.matched.includes(pos)}
                  wrong={scene.wrong.includes(pos)}
                  unavailable={scene.burned.includes(pos)}
                  pulsing={scene.pulsing}
                  dealKey={scene.deal[pos]?.key}
                  dealIndex={scene.deal[pos]?.index}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const dieBox = (
    <div
      style={{
        flex: "none",
        boxSizing: "border-box",
        background: COLORS.orange,
        border: BORDER.heavy,
        borderRadius: RADIUS.sm,
        padding: SPACE[3],
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MatchDie
        size={44}
        attribute={scene.rule ?? "SHAPE"}
        faceIndex={0}
        rotation={dieRotation(scene.rule, scene.rolls)}
        transition={reduce ? undefined : `transform ${DEMO_DIE_ROLL_MS}ms ${DEMO_DIE_EASE}`}
      />
    </div>
  );

  const finalPanel = (
    <div
      style={{
        ...panelStyle("surface", 8),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: SPACE[6],
        width: "100%",
      }}
    >
      <p style={{ ...textStyle("caption", true), margin: 0, textAlign: "center", color: COLORS.ink, whiteSpace: "pre-line" }}>
        {mode === "in-game"
          ? "That is it. Your seat is still yours and nothing moved while you watched."
          : "First to twelve cards wins. Play on your own against WHOOP, or send a link and play with people."}
      </p>
      <div style={{ display: "flex", gap: SPACE[4], width: "100%" }}>
        {mode === "in-game" ? (
          <button
            type="button"
            className="ww-press"
            onClick={finish}
            style={{ ...buttonStyle("primary", "md", { mobile: true, fullWidth: true }) }}
          >
            Back to your table
          </button>
        ) : (
          <>
            <button
              type="button"
              className="ww-press"
              onClick={() => {
                markClassicDemoSeen();
                trackEvent("classic_demo_finished", { metadata: { mode, via: "solo" } });
                (onPlaySolo ?? onStart)();
              }}
              style={{ ...buttonStyle("secondary", "md", { mobile: true, fullWidth: true }), flex: "1 1 0" }}
            >
              Play Solo
            </button>
            <button
              type="button"
              className="ww-press"
              onClick={() => {
                markClassicDemoSeen();
                trackEvent("classic_demo_finished", { metadata: { mode, via: "peeps" } });
                (onPlayPeeps ?? onStart)();
              }}
              style={{ ...buttonStyle("primary", "md", { mobile: true, fullWidth: true }), flex: "1 1 0" }}
            >
              Play with Peeps
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (!portalHost) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to Play"
      data-testid="classic-demo"
      style={{
        position: "fixed",
        inset: 0,
        height: "var(--ww-vh)",
        zIndex: 1000,
        background: COLORS.surface,
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        padding: SPACE[4],
        paddingBottom: `calc(${SPACE[4]}px + env(safe-area-inset-bottom))`,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: SPACE[3],
          minHeight: 0,
        }}
      >
        {/* progress + skip */}
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: SPACE[4],
          }}
        >
          <div
            style={{ display: "flex", gap: SPACE[1], flex: "1 1 auto", minWidth: 0 }}
            aria-label={`Step ${step + 1} of ${SCRIPT.length}`}
          >
            {SCRIPT.map((_, i) => (
              <span
                key={i}
                aria-hidden="true"
                style={{
                  flex: "1 1 0",
                  height: SPACE[2],
                  borderRadius: RADIUS.sm,
                  background: i <= step ? COLORS.ink : COLORS.panel,
                  transition: `background ${MOTION.fast}`,
                }}
              />
            ))}
          </div>
          <CloseButton
            label={mode === "in-game" ? "BACK" : "SKIP"}
            onClick={skip}
            ariaLabel={
              mode === "gate"
                ? "Skip the demo and start"
                : mode === "in-game"
                  ? "Back to your table"
                  : "Close the demo"
            }
            data-testid="classic-demo-skip"
          />
        </div>

        {/* score chips — WHOOP sits across the table from you */}
        <div
          style={{
            flex: "none",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: SPACE[4],
            ...panelStyle("panel", 3),
          }}
        >
          <DemoSpotlight active={lit("chipWhoop")} {...tip("chipWhoop", "bottom")}>
            <ChipCell chip={chip("WHOOP", scene.whoopChip, scene.whoopScore, 1)} />
          </DemoSpotlight>
          <DemoSpotlight active={lit("chipYou")} {...tip("chipYou", "bottom")}>
            <ChipCell chip={chip("YOU", scene.myChip, scene.myScore, 0)} />
          </DemoSpotlight>
        </div>

        {/* the board */}
        <DemoSpotlight
          active={lit("grid")}
          {...tip("grid", "bottom")}
          style={{ flex: "1 1 auto", minHeight: 0 }}
        >
          {grid}
        </DemoSpotlight>

        {/* die + call button */}
        <div style={{ flex: "none", display: "flex", alignItems: "stretch", gap: SPACE[4], height: 60 }}>
          <DemoSpotlight active={lit("die")} {...tip("die", "top")}>
            {dieBox}
          </DemoSpotlight>
          <DemoSpotlight
            active={lit("button")}
            {...tip("button", "top")}
            style={{ flex: "1 1 0", minWidth: 0, display: "flex" }}
          >
            <ActionButton kind={scene.button} disabled label={scene.buttonLabel} />
          </DemoSpotlight>
        </div>

        {/* footer: step navigation, or the closing choice */}
        <div style={{ flex: "none", display: "flex", gap: SPACE[4], alignItems: "center" }}>
          {step === LAST ? (
            finalPanel
          ) : (
            <>
              {step > 0 && (
                <button
                  type="button"
                  className="ww-press"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  style={{ ...buttonStyle("neutral", "md", { mobile: true }), flex: "1 1 0" }}
                >
                  <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                  BACK
                </button>
              )}
              <button
                type="button"
                className="ww-press"
                onClick={() => setStep((s) => Math.min(LAST, s + 1))}
                style={{ ...buttonStyle("primary", "md", { mobile: true }), flex: "1 1 0" }}
              >
                NEXT
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    portalHost,
  );
};

export default ClassicDemo;
