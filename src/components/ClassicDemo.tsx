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
import { useIsMobile } from "@/hooks/use-mobile";
import GameCard from "@/components/GameCard";
import RollHeroOverlay, { TUMBLE_MS } from "@/components/RollHeroOverlay";
import { ActionButton, ChipCell, DieBox, type ButtonKind, type DerivedChip } from "@/components/MultiplayerGameView";
import CloseButton from "@/components/CloseButton";
import DemoSpotlight from "@/components/DemoSpotlight";
import { MatchGhostCard } from "@/components/matchGhostParts";
import { ALL_CARDS, type Card } from "@/cardData";
import { ROLL_HERO_MS, type RollAttribute, type RollCommitPayload } from "@/lib/multiplayer";
import { CLASSIC_ACTION_ROW_HEIGHT } from "@/lib/layout";
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
  startTheme,
  stopTheme,
  HOW_TO_PLAY_THEME_FILE,
} from "@/lib/sounds";
import {
  CARD_FLIP_MS,
  DAILY_MATCH_GREAT_MS,
  DEAL_MOVE_MS,
  DEAL_STAGGER_MS,
  DEMO_BEAT_MS,
  DEMO_DIE_EASE,
  DEMO_HOLD_MS,
  DEMO_SCORE_TICK_MS,
  DEMO_COPY_FADE_MS,
  DEMO_COPY_SETTLE_MS,
  DEMO_TELL_LEAD_MS,
  PRESS_ANIM_MS,
  SETTLE_REVEAL_HOLD_MS,
  WRONG_ANIM_MS,
} from "@/lib/animationTiming";
import {
  BORDER,
  COLORS,
  FONT_FAMILY,
  FONT_FAMILY_UI,
  FONT_WEIGHT_UI,
  FONT_SIZE,
  LINE_HEIGHT,
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
  buttonPressed: boolean;
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
  buttonPressed: false,
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
  /** Region the fixed bubble's pointer aims toward. */
  anchor: Exclude<SpotKey, "all">;
  order?: "tell-show" | "press-tell-show";
  bullets?: string[];
  /** When every visual treatment triggered by this step has fully settled. */
  settlesAt?: number;
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
    copy: "You start with nine cards face down. You do not know what any of them are yet, neither do your opponents.",
    anchor: "grid",
    enter: { spot: ["grid"], lit: [], deal: dealAll() },
    beats: [{ at: 0, patch: {}, sound: playDeal }],
    settlesAt: 8 * DEAL_STAGGER_MS + DEAL_MOVE_MS,
  },
  // 2 — The die decides.
  {
    copy: "The die decides what is important. This round it says COLOR, so you are trying to find two cards that share the same color. What is important changes every round.",
    anchor: "die",
    enter: { spot: ["die"], lit: [] },
    beats: [
      { at: DEMO_BEAT_MS, patch: { rule: "COLOR", rolls: 1 }, sound: playDiceRoll },
      { at: DEMO_BEAT_MS + TUMBLE_MS, patch: {}, sound: playDieLand },
    ],
    settlesAt: DEMO_BEAT_MS + ROLL_HERO_MS,
  },
  // 3 — Your first flip.
  {
    copy: "On your turn you flip a card so everyone can see it. Your job is to remember what it is and where it is.",
    anchor: "grid",
    enter: { spot: ["grid"], lit: [1], myChip: "FLIPPING" },
    beats: [
      { at: DEMO_BEAT_MS, patch: { faceUp: [1] }, sound: playFlip },
      {
        at: DEMO_BEAT_MS + CARD_FLIP_MS + DEMO_HOLD_MS,
        patch: { faceUp: [] },
        sound: playFlip,
      },
    ],
    settlesAt: DEMO_BEAT_MS + CARD_FLIP_MS + DEMO_HOLD_MS + CARD_FLIP_MS,
  },
  // 4 — Your second flip.
  {
    copy: "You get two flips per turn. After your second flip, your turn is done.",
    anchor: "grid",
    enter: { spot: ["grid"], lit: [5], myChip: "FLIPPING" },
    beats: [
      { at: DEMO_BEAT_MS, patch: { faceUp: [5] }, sound: playFlip },
      {
        at: DEMO_BEAT_MS + CARD_FLIP_MS + DEMO_HOLD_MS,
        patch: { faceUp: [], myChip: "IDLE" },
        sound: playFlip,
      },
    ],
    settlesAt: DEMO_BEAT_MS + CARD_FLIP_MS + DEMO_HOLD_MS + CARD_FLIP_MS,
  },
  // 5 — WHOOP's turn.
  {
    copy: "Now it is your opponent's turn. Watch their flips too, every flip is important.",
    anchor: "grid",
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
    settlesAt: DEMO_BEAT_MS + 2 * (CARD_FLIP_MS + DEMO_HOLD_MS) + CARD_FLIP_MS,
  },
  // 6 — Call it.
  {
    copy: "Did you spot a match? Call it! Press the Whoop! Whoop! button at any time to call a match, during your turn or other players.",
    anchor: "button",
    order: "press-tell-show",
    enter: { spot: ["button"], lit: [], button: "WHOOP", buttonLabel: undefined, buttonPressed: false },
    beats: [
      { at: 0, patch: { buttonPressed: true }, sound: playWhoopCall },
      { at: PRESS_ANIM_MS, patch: { buttonPressed: false } },
      {
        at: PRESS_ANIM_MS + DEMO_COPY_SETTLE_MS + DEMO_TELL_LEAD_MS,
        patch: { spot: ["grid"], pulsing: true, myChip: "WHOOP", button: "SELECT_MATCH" },
      },
    ],
    settlesAt: PRESS_ANIM_MS + DEMO_COPY_SETTLE_MS + DEMO_TELL_LEAD_MS,
  },
  // 7 — The call.
  {
    copy: "When any player calls Whoop! Whoop!, the whole board lights up. Everyone at the table knows a call is happening.",
    anchor: "grid",
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
    copy: "Choose two cards you think match the rule on the die; the second tap locks in your choice. This round is color, so two reds makes a match!",
    anchor: "grid",
    enter: { spot: ["all", "chipYou"], lit: [1, 5], pulsing: true, myChip: "WHOOP" },
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
    settlesAt: 3 * DEMO_BEAT_MS + SETTLE_REVEAL_HOLD_MS + DAILY_MATCH_GREAT_MS,
  },
  // 9 — What you won.
  {
    copy: "A good match = two points. The matched cards go to you. Two new cards fill the gaps, only those two. All other cards stay exactly where they are.",
    anchor: "grid",
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
    settlesAt: 2 * DEMO_BEAT_MS + DEMO_SCORE_TICK_MS + 8 * 60 + 900,
  },
  // 10 — You take the die.
  {
    copy: "A good match hands you the die. Your roll sets the next rule, and you flip first. The cards did not change, but what makes a match did change. It was COLOR, now it is SHAPE.",
    anchor: "die",
    enter: { spot: ["die"], lit: [], myChip: "ROLLING" },
    beats: [
      { at: DEMO_BEAT_MS, patch: { rule: "SHAPE", rolls: 2 }, sound: playDiceRoll },
      { at: DEMO_BEAT_MS + TUMBLE_MS, patch: { myChip: "IDLE" }, sound: playDieLand },
    ],
    settlesAt: DEMO_BEAT_MS + ROLL_HERO_MS,
  },
  // 11 — Getting it wrong.
  {
    copy:
      "Blue Star and Blue Triangle. Both blue — but the die says shape now, and a star is not a triangle. That is a miss.",
    anchor: "grid",
    enter: {
      spot: ["all"],
      lit: [2, 4],
      pulsing: true,
      myChip: "WHOOP",
      button: "WHOOP",
      buttonPressed: true,
    },
    beats: [
      { at: 0, patch: {}, sound: playWhoopCall },
      { at: PRESS_ANIM_MS, patch: { buttonPressed: false, button: "SELECT_MATCH" } },
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
    settlesAt: 3 * DEMO_BEAT_MS + SETTLE_REVEAL_HOLD_MS + WRONG_ANIM_MS,
  },
  // 12 — What a miss costs.
  {
    copy: "A missed match does three things:",
    bullets: [
      "Lose one card you already won to the deck",
      "Keep the missed match face up for the rest of the round",
      "Those cards are locked for you for the round",
    ],
    anchor: "grid",
    enter: { spot: ["all"], lit: [] },
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
    settlesAt: 2 * DEMO_BEAT_MS + DEMO_HOLD_MS,
  },
  // 13 — Two calls each.
  {
    copy: "You only get 2 calls per round. Use them wisely.",
    anchor: "button",
    enter: { spot: ["button"], lit: [], button: "WHOOP", buttonLabel: "1 CALL LEFT" },
    beats: [],
    settlesAt: DEMO_BEAT_MS,
  },
  // 14 — WHOOP calls.
  {
    copy: "Remember, anyone can call at anytime. If another player gets a match, they get the die, set the next rule, and flip first.",
    anchor: "grid",
    enter: { spot: ["all"], lit: [], whoopChip: "WHOOP", button: "DISABLED", buttonLabel: undefined },
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
    settlesAt: 3 * DEMO_BEAT_MS + SETTLE_REVEAL_HOLD_MS + DAILY_MATCH_GREAT_MS,
  },
  // 15 — That is it.
  {
    copy: "First to twelve wins!\nNow go play a solo game with WHOOP Bot, or send a link to your people and play together. Have fun and WHOOP! WHOOP!",
    anchor: "grid",
    enter: {
      spot: ["all"],
      lit: [],
      cards: { ...BOARD },
      removed: [],
      faceUp: [],
      selected: [],
      matched: [],
      wrong: [],
      burned: [],
      pulsing: false,
      myChip: "IDLE",
      whoopChip: "IDLE",
      button: "WHOOP",
      deal: Object.fromEntries(POSITIONS.map((p) => [p, { key: `${p}-final`, index: p - 1 }])),
    },
    beats: [{ at: 0, patch: {}, sound: playDeal }],
    settlesAt: 8 * DEAL_STAGGER_MS + DEAL_MOVE_MS,
  },
];

const LAST = SCRIPT.length - 1;

/** Keep the final phrase together so narrow screens never leave a 1–2 word widow. */
function preventShortLastLine(copy: string): string {
  const words = copy.split(" ");
  if (words.length < 4) return copy;
  return [...words.slice(0, -3), words.slice(-3).join("\u00a0")].join(" ");
}

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

// The board mounts inside a portal, so the node arrives after the first render.
// A callback ref in state is what makes the measurement wait for it instead of
// reading null once and never trying again.
const useCardWidth = (): [(el: HTMLDivElement | null) => void, number] => {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!node) return;
    const measure = () => {
      const box = node.getBoundingClientRect();
      const byWidth = (box.width - 2 * GRID_GAP) / 3;
      const byHeight = (box.height - 2 * GRID_GAP) / 3 / CARD_RATIO;
      setW(Math.max(0, Math.floor(Math.min(byWidth, byHeight))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, w];
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
  const isMobile = useIsMobile();
  // Demo-only music: the How to Play track loops for as long as the demo is
  // open, including the welcome card. The screen underneath (lobby or game)
  // resumes its own music when the demo closes.
  useEffect(() => {
    startTheme(HOW_TO_PLAY_THEME_FILE);
    return () => stopTheme();
  }, []);

  const [welcome, setWelcome] = useState(true);
  const [step, setStep] = useState(0);
  const [scene, setScene] = useState<Scene>(() => enterScene(0));
  const [copyVisible, setCopyVisible] = useState(false);
  const [stepSettled, setStepSettled] = useState(false);
  const [gridRef, cardW] = useCardWidth();
  const dieHomeRef = useRef<HTMLDivElement | null>(null);
  const [rollCommit, setRollCommit] = useState<RollCommitPayload | null>(null);
  const [rollRects, setRollRects] = useState<{ home: DOMRect; target: DOMRect } | null>(null);
  const previousRollRef = useRef(0);
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
    const currentStep = SCRIPT[step];
    if (reduce) {
      setScene(settledScene(step));
      setCopyVisible(true);
      setStepSettled(true);
      return;
    }
    setScene(enterScene(step));
    const pressTellShow = currentStep.order === "press-tell-show";
    const tellFirst = currentStep.order === "tell-show";
    setCopyVisible(tellFirst);
    setStepSettled(false);
    const offset = tellFirst ? DEMO_TELL_LEAD_MS : 0;
    const beats = currentStep.beats;
    for (const beat of beats) {
      const id = window.setTimeout(() => {
        setScene((prev) => ({ ...prev, ...beat.patch }));
        beat.sound?.();
      }, beat.at + offset);
      timers.current.push(id);
    }
    if (pressTellShow) {
      const copyTimer = window.setTimeout(
        () => setCopyVisible(true),
        PRESS_ANIM_MS + DEMO_COPY_SETTLE_MS,
      );
      const settleTimer = window.setTimeout(
        () => setStepSettled(true),
        currentStep.settlesAt ?? PRESS_ANIM_MS + DEMO_COPY_SETTLE_MS + DEMO_TELL_LEAD_MS,
      );
      timers.current.push(copyTimer, settleTimer);
    }
    if (tellFirst) {
      const hideTimer = window.setTimeout(() => setCopyVisible(false), DEMO_TELL_LEAD_MS);
      timers.current.push(hideTimer);
      const settleTimer = window.setTimeout(
        () => setStepSettled(true),
        offset + (currentStep.settlesAt ?? beats.reduce((latest, beat) => Math.max(latest, beat.at), 0)),
      );
      timers.current.push(settleTimer);
    }
    if (!tellFirst && !pressTellShow) {
      const copyTimer = window.setTimeout(
        () => {
          setCopyVisible(true);
          setStepSettled(true);
        },
        (currentStep.settlesAt ?? beats.reduce((latest, beat) => Math.max(latest, beat.at), 0)) + DEMO_COPY_SETTLE_MS,
      );
      timers.current.push(copyTimer);
    }
    return () => {
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
  }, [step, reduce]);

  // Use the live game's roll overlay for both scripted rolls. The small tray
  // only reveals the landed result after the full-screen animation completes.
  useEffect(() => {
    if (scene.rolls <= previousRollRef.current || !scene.rule) return;
    previousRollRef.current = scene.rolls;
    const home = dieHomeRef.current?.getBoundingClientRect();
    const target = document.querySelector<HTMLElement>('[data-testid="classic-demo-board"]')?.getBoundingClientRect();
    if (!home || !target) return;
    setRollRects({ home, target });
    setRollCommit({
      roundId: `demo-${scene.rolls}`,
      attribute: scene.rule,
      faceIndex: 0,
      tumbleSeed: scene.rolls,
      startAt: Date.now(),
    });
  }, [scene.rolls, scene.rule]);

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
      if (e.key === "ArrowRight") {
        if (welcome) setWelcome(false);
        else setStep((s) => Math.min(LAST, s + 1));
      }
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [welcome]);

  // Dimming is tied to the bubble, not to the step: while an animation beat is
  // playing (no copy on screen) the board reads exactly like a live game, and
  // the dim + spotlight rise and fall together with the instruction copy.
  const dimActive = copyVisible;
  const spotAll = scene.spot.includes("all");
  const lit = (key: Exclude<SpotKey, "all">) =>
    !dimActive || spotAll || scene.spot.includes(key);
  const current = SCRIPT[step];

  const cardOpacity = (pos: number) =>
    dimActive && !spotAll && scene.spot.includes("grid") && scene.lit.length > 0 && !scene.lit.includes(pos)
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
                position: "relative",
                width: cardW,
                height: Math.round(cardW * CARD_RATIO),
                opacity: cardOpacity(pos),
                transition: reduce ? undefined : `opacity ${MOTION.base}`,
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
                <>
                  <div style={{ width: "100%", height: "100%", opacity: scene.matched.includes(pos) ? 0 : 1 }}>
                    <GameCard
                      card={card(scene.cards[pos])}
                      faceUp={scene.faceUp.includes(pos) || scene.burned.includes(pos)}
                      fill
                      interactive={false}
                      highlighted={scene.selected.includes(pos)}
                      wrong={scene.wrong.includes(pos)}
                      unavailable={scene.burned.includes(pos)}
                      pulsing={scene.pulsing}
                      dealKey={scene.deal[pos]?.key}
                      dealIndex={scene.deal[pos]?.index}
                    />
                  </div>
                  {scene.matched.includes(pos) && (
                    <MatchGhostCard
                      card={card(scene.cards[pos])}
                      stage="great"
                      faceUp
                      k={cardW / 104.333}
                      radius={RADIUS.md}
                      style={{ position: "absolute", inset: 0 }}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const dieBox = (
    <DieBox
      rule={scene.rule ?? "SHAPE"}
      heroActive={rollCommit !== null}
      waiting={scene.rule === null}
      homeRef={dieHomeRef}
    />
  );

  const finalPanel = (
    <div
      style={{
        ...panelStyle("surface", 4),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: SPACE[4],
        width: "100%",
        height: "100%",
        justifyContent: "center",
        opacity: copyVisible ? 1 : 0,
        transition: reduce ? undefined : `opacity ${DEMO_COPY_FADE_MS}ms ${DEMO_DIE_EASE}`,
        pointerEvents: copyVisible ? "auto" : "none",
      }}
    >
      <p style={{ ...textStyle("body", true), fontFamily: FONT_FAMILY_UI, fontWeight: FONT_WEIGHT_UI, margin: 0, textAlign: "center", color: COLORS.ink, whiteSpace: "pre-line" }}>
        {mode === "in-game"
          ? "First to twelve wins!\nNow go play a solo game with WHOOP Bot, or send a link to your people and play together. Have fun and WHOOP! WHOOP!"
          : "First to twelve wins!\nNow go play a solo game with WHOOP Bot, or send a link to your people and play together. Have fun and WHOOP! WHOOP!"}
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
        background: COLORS.panel,
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        padding: SPACE[6],
        paddingBottom: `calc(${SPACE[6]}px + env(safe-area-inset-bottom))`,
      }}
    >
      {welcome ? (
        <>
          <CloseButton
            label={mode === "in-game" ? "BACK" : "SKIP"}
            onClick={skip}
            ariaLabel={mode === "in-game" ? "Back to your table" : "Skip the demo"}
            data-testid="classic-demo-skip"
            style={{ position: "absolute", top: SPACE[6], right: SPACE[6], zIndex: 1 }}
          />
          <div
            style={{
              width: 290,
              margin: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: 0,
              gap: SPACE[16],
            }}
          >
            <div
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 0,
              }}
            >
              <h1
                style={{
                  width: "100%",
                  margin: 0,
                  fontFamily: FONT_FAMILY,
                  fontSize: FONT_SIZE["5.5xl"],
                  fontWeight: 400,
                  fontStyle: "normal",
                  lineHeight: 1,
                  letterSpacing: "-0.01em",
                  textAlign: "center",
                  color: RAW.warmBlack,
                }}
              >
                Welcome to
                <br />
                Whoop! Whoop! Classic
              </h1>
            </div>
            <div
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: 0,
                gap: SPACE[6],
              }}
            >
              <p
                style={{
                  width: "100%",
                  margin: 0,
                  fontFamily: FONT_FAMILY_UI,
                  fontSize: 16,
                  fontWeight: FONT_WEIGHT_UI,
                  lineHeight: LINE_HEIGHT.snug,
                  textAlign: "center",
                  color: RAW.warmBlack,
                }}
              >
                A fun and fast memory game for two to six players. Flip, remember, and call the match before anyone else.
              </p>
            </div>
            <button
              type="button"
              className="ww-press"
              onClick={() => setWelcome(false)}
              style={{ ...buttonStyle("primary", "lg", { mobile: true, fullWidth: true }) }}
            >
              Learn How to Play
            </button>
          </div>
        </>
      ) : (
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: SPACE[2],
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
                  flex: "none",
                  width: SPACE[3],
                  height: SPACE[3],
                  borderRadius: RADIUS.sm,
                  background: i <= step ? RAW.warmBlack : "transparent",
                  border: BORDER.standard,
                  boxSizing: "border-box",
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
            columnGap: SPACE[4],
            rowGap: SPACE[2],
            ...panelStyle("panel", 4),
          }}
        >
          <DemoSpotlight instant={reduce}
 active={lit("chipWhoop")}>
            <ChipCell chip={chip("WHOOP", scene.whoopChip, scene.whoopScore, 1)} />
          </DemoSpotlight>
          <DemoSpotlight instant={reduce}
 active={lit("chipYou")}>
            <ChipCell chip={chip("YOU", scene.myChip, scene.myScore, 0)} />
          </DemoSpotlight>
        </div>

        {/* the board */}
        <DemoSpotlight instant={reduce}
          active={lit("grid")}
          style={{
            ...panelStyle("panel", 5),
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div data-testid="classic-demo-board" style={{ width: "100%", height: "100%" }}>{grid}</div>
        </DemoSpotlight>

        {/* One fixed lower slot: the real die/action row occupies it while the
            action plays, then the explanation fades over that same reserved
            footprint. Nothing below the board ever reflows. We intentionally
            rely on the spotlight rather than route a connector across cards. */}
        <div
          style={{
            flex: "0 0 176px",
            minHeight: 176,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "stretch",
              gap: SPACE[4],
              height: CLASSIC_ACTION_ROW_HEIGHT,
              opacity: copyVisible || step === LAST ? 0 : 1,
              transition: reduce ? undefined : `opacity ${DEMO_COPY_FADE_MS}ms ${DEMO_DIE_EASE}`,
              pointerEvents: copyVisible || step === LAST ? "none" : "auto",
            }}
          >
            <DemoSpotlight instant={reduce}
 active={lit("die")}>
              {dieBox}
            </DemoSpotlight>
            <DemoSpotlight instant={reduce}
              active={lit("button")}
              style={{ flex: "1 1 0", minWidth: 0, display: "flex" }}
            >
               <div className={scene.buttonPressed ? "ww-press-on" : undefined} style={{ display: "flex", flex: "1 1 0", minWidth: 0 }}>
                 <ActionButton kind={scene.button} disabled label={scene.buttonLabel} />
               </div>
            </DemoSpotlight>
          </div>
          {step === LAST ? (
            finalPanel
          ) : (
            <div
              role="status"
              aria-live="polite"
              style={{
                 ...panelStyle("surface", 4),
                paddingInline: isMobile ? SPACE[10] : SPACE[16],
                background: COLORS.surface,
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: copyVisible ? 1 : 0,
                transition: reduce ? undefined : `opacity ${DEMO_COPY_FADE_MS}ms ${DEMO_DIE_EASE}`,
                pointerEvents: copyVisible ? "auto" : "none",
                zIndex: 6,
              }}
            >
               <div
                style={{
                  ...textStyle("control", true),
                  fontSize: FONT_SIZE.sm,
                  fontFamily: FONT_FAMILY_UI,
                  fontWeight: FONT_WEIGHT_UI,
                  // +5% over the control role's spacing — derived from the
                  // token so it can never drift from the scale.
                  lineHeight: LINE_HEIGHT.tight * 1.05,
                  letterSpacing: 0,
                  display: "block",
                  textAlign: "center",
                  whiteSpace: "pre-line",
                  textWrap: "balance",
                  color: COLORS.ink,
                }}
              >
                <span style={{ whiteSpace: "pre-line" }}>{preventShortLastLine(current.copy)}</span>
                {current.bullets && (
                  <ul style={{ margin: `${SPACE[2]}px 0 0`, paddingInlineStart: SPACE[10], textAlign: "left" }}>
                    {current.bullets.map((item) => <li key={item} style={{ textWrap: "pretty" }}>{preventShortLastLine(item)}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* footer: step navigation, or the closing choice */}
        <div style={{ flex: "0 0 43px", display: "flex", gap: SPACE[4], alignItems: "center" }}>
          {step !== LAST && (
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
                onClick={() => {
                  if (stepSettled) setStep((s) => Math.min(LAST, s + 1));
                }}
                disabled={!stepSettled}
                style={{ ...buttonStyle("primary", "md", { mobile: true, disabled: !stepSettled }), flex: "1 1 0" }}
              >
                NEXT
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
      )}
      {rollCommit && rollRects && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20,
            background: `color-mix(in srgb, ${RAW.warmBlack} 55%, transparent)`,
            pointerEvents: "none",
          }}
        >
          <RollHeroOverlay
            commit={rollCommit}
            homeRect={rollRects.home}
            targetRect={rollRects.target}
            parentRect={new DOMRect(0, 0, window.innerWidth, window.innerHeight)}
            onComplete={() => {
              setRollCommit(null);
              setRollRects(null);
            }}
          />
        </div>
      )}
    </div>,
    portalHost,
  );
};

export default ClassicDemo;
