// ============================================================================
// MultiplayerHowToSteps — the multiplayer sibling of DailyHowToSteps.
//
// Architecture is carried over wholesale from the Daily stepper: one SLIDES
// array, a VisualFit box that scales the picture into whatever room the copy
// leaves, one loop driver (`usePhase`), reduced motion resting on a single
// representative frame, a pause while the tab is hidden, an image-ready gate,
// swipe + arrow keys + Escape, and two modes (gate / reference).
//
// Every visual mounts the REAL board pieces — GameCard, MatchDie, ChipCell —
// and replays them with the real timing constants. Nothing here re-draws a
// treatment, so a change to the board cannot silently drift these slides.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import GameCard from "@/components/GameCard";
import MatchDie from "@/components/MatchDie";
import { ChipCell } from "@/components/MultiplayerGameView";
import CloseButton from "@/components/CloseButton";
import { useDismiss } from "@/hooks/useDismiss";
import { ALL_CARDS, type Card } from "@/cardData";
import type { RollAttribute } from "@/lib/multiplayer";
import { SETTLE_MATCH_MS, SETTLE_WRONG_MS } from "@/hooks/useGameState";
import {
  CARD_FLIP_MS,
  DEAL_MOVE_MS,
  DEAL_STAGGER_MS,
  PRESS_ANIM_MS,
  SELECT_ANIM_MS,
} from "@/lib/animationTiming";
import { trackEvent } from "@/lib/analytics";
import DailyShapeRule from "@/components/DailyShapeRule";
import {
  COLORS,
  FONT_FAMILY,
  FONT_FAMILY_UI,
  FONT_WEIGHT_UI,
  MOTION,
  RADIUS,
  RAW,
  textStyle,
} from "@/lib/tokens";

/** localStorage flag: the first-run gate fires exactly once per browser. */
const SEEN_KEY = "ww_mp_howto_seen";

export function hasSeenMpHowTo(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked: never trap the player behind the gate
  }
}

export function markMpHowToSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

const CARD_BACK = "/cards/card-back.svg";

/* ------------------------------------------------------------------ *
 * Loop holds. Durations that belong to a treatment come from
 * animationTiming / useGameState; only the dwell beats live here.
 * ------------------------------------------------------------------ */
const T = {
  table: { faceDown: 900, faceUpHold: 1100, rest: 700 },
  die: { dwell: 2000, punch: 180 },
  turn: { lead: 500, firstHold: 700, secondHold: 1400, rest: 600 },
  whoop: { lead: 400, pressHold: 200, firstHold: 550, secondHold: 1200, rest: 700 },
  match: { lead: 400, firstHold: 350, secondHold: 250, restHold: 700, lockedHold: 1600 },
  chip: { dwell: 1400 },
} as const;

/* ---- shared hooks, identical in behaviour to the Daily's ----------------- */

/** `prefers-reduced-motion: reduce` — every loop stops on one static frame. */
const useReducedMotion = (): boolean => {
  const [reduce, setReduce] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
};

/** False while the tab is hidden, so nothing loops in the background. */
const usePageVisible = (): boolean => {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
};

/** Steps through `steps` (ms) forever while `running`; resets to 0 otherwise. */
const usePhase = (steps: readonly number[], running: boolean): number => {
  const [phase, setPhase] = useState(0);
  const key = steps.join(",");
  useEffect(() => {
    setPhase(0);
    if (!running) return;
    const durations = key.split(",").map(Number);
    let i = 0;
    let t = 0;
    const tick = () => {
      t = window.setTimeout(() => {
        i = (i + 1) % durations.length;
        setPhase(i);
        tick();
      }, durations[i]);
    };
    tick();
    return () => window.clearTimeout(t);
  }, [running, key]);
  return phase;
};

/** Decodes a set of images once and reports when they are all ready. */
const useImagesReady = (srcs: readonly string[]): boolean => {
  const [ready, setReady] = useState(false);
  const key = srcs.join(",");
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      key.split(",").map(
        (src) =>
          new Promise<void>((resolve) => {
            const im = new Image();
            im.decoding = "async";
            im.onload = () => resolve();
            im.onerror = () => resolve();
            im.src = src;
          }),
      ),
    ).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return ready;
};

/* ------------------------------------------------------------------ *
 * Responsive steps. Authored against a 390-wide phone; type stays put
 * and only the visual scales.
 * ------------------------------------------------------------------ */
const CARD_BASE_W = 354;
const CARD_BASE_H = 569;
const CARD_RATIO = CARD_BASE_H / CARD_BASE_W;

type Step = {
  cardMaxW: number;
  innerMaxW: number;
  headingBig: number;
  heading: number;
  bodyBig: number;
  body: number;
  vis: number;
};

const STEPS: { min: number; step: Step }[] = [
  { min: 1280, step: { cardMaxW: 520, innerMaxW: 426, headingBig: 64, heading: 48, bodyBig: 18, body: 16, vis: 520 / CARD_BASE_W } },
  { min: 768, step: { cardMaxW: 440, innerMaxW: 360, headingBig: 56, heading: 42, bodyBig: 17, body: 15, vis: 440 / CARD_BASE_W } },
  { min: 0, step: { cardMaxW: CARD_BASE_W, innerMaxW: 290, headingBig: 48, heading: 36, bodyBig: 16, body: 14, vis: 1 } },
];

const stepFor = (w: number): Step => STEPS.find((s) => w >= s.min)!.step;

const useStep = (): Step => {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 390 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return stepFor(w);
};

/** The khaki card is a literal brand artifact in both themes. */
const INK = RAW.warmBlack;

/** Card art paints a full-bleed rectangle: the rounded edge is a DOM clip. */
const CARD_RADIUS_RATIO = 0.0607;
const cardRadius = (w: number) => w * CARD_RADIUS_RATIO;

const cardById = (id: string): Card => ALL_CARDS.find((c) => c.id === id)!;

/** A fixed-size slot holding one presentational GameCard. */
const slotCard = (
  w: number,
  h: number,
  props: React.ComponentProps<typeof GameCard>,
  key?: React.Key,
) => (
  <div key={key} style={{ width: w, height: h, position: "relative" }}>
    <GameCard {...props} fill interactive={false} radius={cardRadius(w)} />
  </div>
);

/* ------------------------------------------------------------------ *
 * Slide 2 — The Table. Six cards, face down. One flips up and back:
 * you only ever learn a card by watching it flip.
 * ------------------------------------------------------------------ */
const TABLE_IDS = [
  "circle-2-red",
  "star-4-yellow",
  "square-1-blue",
  "tri-3-yellow",
  "star-2-blue",
  "square-4-red",
] as const;
const TABLE_CARDS = TABLE_IDS.map(cardById);
const TABLE_SRCS = [CARD_BACK, ...TABLE_CARDS.map((c) => c.svgPath)];
/** The one card that flips in the loop. */
const TABLE_FLIP_SLOT = 4;

const TABLE_STEPS = [
  T.table.faceDown,
  CARD_FLIP_MS,
  T.table.faceUpHold,
  CARD_FLIP_MS,
  T.table.rest,
] as const;

const TableVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const ready = useImagesReady(TABLE_SRCS);
  const phase = usePhase(TABLE_STEPS, active && visible && !reduce && ready);
  // Reduced motion rests on the representative frame: one card face up.
  const up = reduce || phase === 1 || phase === 2;

  const w = 63 * v;
  const h = 88.2 * v;

  return (
    <div
      aria-hidden="true"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${w}px)`,
        gridAutoRows: `${h}px`,
        gap: 8 * v,
      }}
    >
      {TABLE_CARDS.map((card, i) =>
        slotCard(w, h, { card, faceUp: i === TABLE_FLIP_SLOT && up }, card.id),
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Slide 3 — The Die Decides. The real MatchDie cycles its three faces,
 * with a real pair of cards that match under that rule.
 * ------------------------------------------------------------------ */
type DieExample = { attribute: RollAttribute; label: string; pair: [string, string] };

const DIE_EXAMPLES: DieExample[] = [
  { attribute: "COLOR", label: "Match the COLOR", pair: ["circle-2-yellow", "star-4-yellow"] },
  { attribute: "SHAPE", label: "Match the SHAPE", pair: ["circle-3-red", "circle-1-blue"] },
  { attribute: "NUMBER", label: "Match the NUMBER", pair: ["square-3-yellow", "tri-3-red"] },
];

const DIE_SRCS = DIE_EXAMPLES.flatMap((e) => e.pair.map((id) => cardById(id).svgPath));

const DieVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const pageVisible = usePageVisible();
  const [i, setI] = useState(0);
  /** Bumped on manual interaction so the auto-cycle timer restarts. */
  const [cycleKey, setCycleKey] = useState(0);
  const advance = useCallback(() => setI((n) => (n + 1) % DIE_EXAMPLES.length), []);
  const running = active && pageVisible && !reduce;

  useEffect(() => {
    if (!active) setI(0);
  }, [active]);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(advance, T.die.dwell);
    return () => window.clearInterval(t);
  }, [advance, cycleKey, running]);

  const ex = DIE_EXAMPLES[i];
  const w = 74.83 * v;
  const h = 104.72 * v;
  const dot = 9 * v;
  const dieSize = 104 * v;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * v }}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          advance();
          setCycleKey((k) => k + 1);
        }}
        style={{ display: "flex", alignItems: "center", gap: 28 * v, cursor: "pointer" }}
      >
        <div
          key={ex.attribute}
          style={{
            flex: "0 0 auto",
            // A hard cut with a small landing punch — the die has already rolled.
            animation: reduce
              ? undefined
              : `ww-die-punch ${T.die.punch}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
        >
          <MatchDie size={dieSize} attribute={ex.attribute} faceIndex={0} />
        </div>

        <div style={{ display: "flex", gap: 8 * v }}>
          {ex.pair.map((id) => slotCard(w, h, { card: cardById(id), faceUp: true }, id))}
        </div>
      </div>

      {/* example indicators — circles, deliberately unlike the slide dots */}
      <div style={{ display: "flex", gap: 8 * v }}>
        {DIE_EXAMPLES.map((e, n) => (
          <button
            key={e.attribute}
            type="button"
            aria-label={e.label}
            aria-current={n === i}
            onClick={(ev) => {
              ev.stopPropagation();
              setI(n);
              setCycleKey((k) => k + 1);
            }}
            style={{
              width: dot,
              height: dot,
              padding: 0,
              borderRadius: "50%",
              background: n === i ? INK : "transparent",
              border: n === i ? "none" : `1.5px solid ${INK}`,
              boxSizing: "border-box",
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Slide 4 — Your Turn. Two flips, one at a time, both left face up for
 * everyone to see.
 * ------------------------------------------------------------------ */
const TURN_STEPS = [
  T.turn.lead,
  CARD_FLIP_MS + T.turn.firstHold,
  CARD_FLIP_MS + T.turn.secondHold,
  CARD_FLIP_MS,
  T.turn.rest,
] as const;

const TURN_FLIPS = [1, 5] as const;

const TurnVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const ready = useImagesReady(TABLE_SRCS);
  const phase = usePhase(TURN_STEPS, active && visible && !reduce && ready);

  // Reduced motion rests on the representative frame: both flips showing.
  const firstUp = reduce || phase === 1 || phase === 2;
  const secondUp = reduce || phase === 2;

  const w = 63 * v;
  const h = 88.2 * v;

  return (
    <div
      aria-hidden="true"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${w}px)`,
        gridAutoRows: `${h}px`,
        gap: 8 * v,
      }}
    >
      {TABLE_CARDS.map((card, i) =>
        slotCard(
          w,
          h,
          {
            card,
            faceUp: (i === TURN_FLIPS[0] && firstUp) || (i === TURN_FLIPS[1] && secondUp),
          },
          card.id,
        ),
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Slide 5 — WHOOP! WHOOP! The call, then two taps; the second locks it.
 * ------------------------------------------------------------------ */
const WHOOP_STEPS = [
  T.whoop.lead,
  PRESS_ANIM_MS + T.whoop.pressHold,
  SELECT_ANIM_MS + T.whoop.firstHold,
  SELECT_ANIM_MS + T.whoop.secondHold,
  T.whoop.rest,
] as const;

const WHOOP_PICKS = [0, 3] as const;

const WhoopVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const ready = useImagesReady(TABLE_SRCS);
  const phase = usePhase(WHOOP_STEPS, active && visible && !reduce && ready);

  const pressed = !reduce && phase === 1;
  // Reduced motion rests on the locked claim: both cards selected.
  const firstSel = reduce || phase === 2 || phase === 3;
  const secondSel = reduce || phase === 3;

  const w = 63 * v;
  const h = 88.2 * v;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * v }}>
      <div
        aria-hidden="true"
        className={pressed ? "ww-press-on" : undefined}
        style={{
          ...textStyle("control"),
          width: 190 * v,
          height: 32 * v,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          background: COLORS.red,
          border: `2px solid ${INK}`,
          borderRadius: RADIUS.sm,
          color: RAW.cream,
          fontStyle: "italic",
          fontSize: 16 * v,
          transition: reduce
            ? undefined
            : `transform ${PRESS_ANIM_MS}ms ease, filter ${PRESS_ANIM_MS}ms ease`,
        }}
      >
        WHOOP! WHOOP!
      </div>
      <div
        aria-hidden="true"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(3, ${w}px)`,
          gridAutoRows: `${h}px`,
          gap: 8 * v,
        }}
      >
        {TABLE_CARDS.map((card, i) =>
          slotCard(
            w,
            h,
            {
              card,
              faceUp: false,
              highlighted:
                (i === WHOOP_PICKS[0] && firstSel) || (i === WHOOP_PICKS[1] && secondSel),
            },
            card.id,
          ),
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Slide 6 — Match or Miss. The load-bearing slide: a match takes the
 * pair and refills, then a miss leaves its two cards face up and locked
 * for the rest of the round.
 * ------------------------------------------------------------------ */
const MATCH_IDS = [
  "circle-2-yellow",
  "square-1-blue",
  "star-4-red",
  "tri-3-blue",
  "star-4-yellow",
  "circle-1-red",
] as const;
/** Slots 0 and 4 are the matching pair (both orange); 2 and 3 are the miss. */
const MATCH_PAIR = [0, 4] as const;
const MISS_PAIR = [2, 3] as const;
const MATCH_REFILL_IDS = ["square-4-blue", "circle-3-red"] as const;

const MATCH_CARDS = MATCH_IDS.map(cardById);
const MATCH_REFILL_CARDS = MATCH_REFILL_IDS.map(cardById);
const MATCH_SRCS = [
  CARD_BACK,
  ...MATCH_CARDS.map((c) => c.svgPath),
  ...MATCH_REFILL_CARDS.map((c) => c.svgPath),
];

const MATCH_STEPS = [
  T.match.lead,
  SELECT_ANIM_MS + T.match.firstHold,
  SELECT_ANIM_MS + T.match.secondHold,
  CARD_FLIP_MS,
  SETTLE_MATCH_MS,
  DEAL_MOVE_MS + DEAL_STAGGER_MS,
  T.match.restHold,
  SELECT_ANIM_MS + T.match.firstHold,
  SELECT_ANIM_MS + T.match.secondHold,
  CARD_FLIP_MS,
  SETTLE_WRONG_MS,
  T.match.lockedHold,
] as const;

const MatchVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const ready = useImagesReady(MATCH_SRCS);
  const phase = usePhase(MATCH_STEPS, active && visible && !reduce && ready);

  const w = 63 * v;
  const h = 88.2 * v;

  const isMatchSlot = (i: number) => MATCH_PAIR.includes(i as 0 | 4);
  const isMissSlot = (i: number) => MISS_PAIR.includes(i as 2 | 3);

  const selected = (i: number): boolean => {
    if (reduce) return false;
    if (phase === 1) return i === MATCH_PAIR[0];
    if (phase === 2 || phase === 3) return isMatchSlot(i);
    if (phase === 7) return i === MISS_PAIR[0];
    if (phase === 8 || phase === 9) return isMissSlot(i);
    return false;
  };

  const matchFaceUp = !reduce && phase >= 3 && phase <= 4;
  const matched = !reduce && phase === 4;
  const refilled = !reduce && phase >= 5;
  // Reduced motion rests on the consequence: the missed pair face up and locked.
  const missFaceUp = reduce || phase >= 9;
  const wrong = !reduce && phase === 10;
  const missLocked = reduce || phase === 11;

  return (
    <div
      aria-hidden="true"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${w}px)`,
        gridAutoRows: `${h}px`,
        gap: 8 * v,
      }}
    >
      {MATCH_CARDS.map((card, i) => {
        const refill = isMatchSlot(i) && refilled;
        const shown = refill ? MATCH_REFILL_CARDS[MATCH_PAIR.indexOf(i as 0 | 4)] : card;
        return (
          <div
            key={card.id}
            style={{
              width: w,
              height: h,
              position: "relative",
              // Locked cards read as out of play for the rest of the round.
              opacity: isMissSlot(i) && missLocked ? 0.55 : 1,
              transition: reduce ? undefined : `opacity ${MOTION.base}`,
            }}
          >
            <GameCard
              card={shown}
              faceUp={(isMatchSlot(i) && matchFaceUp) || (isMissSlot(i) && missFaceUp)}
              matched={isMatchSlot(i) && matched}
              wrong={isMissSlot(i) && wrong}
              fill
              interactive={false}
              radius={cardRadius(w)}
              highlighted={selected(i)}
              {...(refill ? { dealIndex: MATCH_PAIR.indexOf(i as 0 | 4) } : {})}
            />
          </div>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Slide 7 — First to 10. The real score chip, so the target reads as a
 * finish line.
 * ------------------------------------------------------------------ */
const CHIP_SCORES: number[] = [6, 8, 10];

const ChipVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const phase = usePhase(
    CHIP_SCORES.map(() => T.chip.dwell),
    active && visible && !reduce,
  );
  // Reduced motion rests on the last frame: the chip that reached the target.
  const score = reduce ? CHIP_SCORES[CHIP_SCORES.length - 1] : CHIP_SCORES[phase];

  return (
    <div
      style={{
        width: 240 * v,
        display: "flex",
        flexDirection: "column",
        gap: 8 * v,
      }}
    >
      <ChipCell chip={{ kind: "IDLE", name: "YOU", score, seat: 0 }} />
      <ChipCell chip={{ kind: "IDLE", name: "SAM", score: 4, seat: 1 }} />
      <ChipCell chip={{ kind: "IDLE", name: "ADA", score: 3, seat: 2 }} />
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * VisualFit — the visual is the only flexible element: the copy and the
 * buttons take their space first, and whatever height is left is all the
 * picture may ever have. Below VISUAL_MIN_SCALE it is hidden rather than
 * allowed to collide with the copy.
 * ------------------------------------------------------------------ */
const VISUAL_MIN_SCALE = 0.45;
const STEP_GAP = "min(clamp(12px, 4%, 24px), 2.2vh)";

const VisualFit: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(0);

  useEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    let raf = 0;

    const measure = () => {
      raf = 0;
      const bw = b.clientWidth;
      const bh = b.clientHeight;
      const iw = i.offsetWidth;
      const ih = i.offsetHeight;
      if (!iw || !ih) return;
      const next = bw > 0 && bh > 0 ? Math.min(1, bw / iw, bh / ih) : 0;
      setS((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(b);
    ro.observe(i);
    window.addEventListener("resize", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const visible = s >= VISUAL_MIN_SCALE;

  return (
    <div
      ref={box}
      data-testid="mp-htp-visual-box"
      style={{
        flex: "1 1 0",
        alignSelf: "stretch",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        ref={inner}
        data-testid="mp-htp-visual"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${s || 1})`,
          transformOrigin: "center center",
          visibility: visible ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * The eight slides.
 * ------------------------------------------------------------------ */
type Slide = {
  heading: string;
  body: string;
  big?: boolean;
  visual?: (sz: Step, active: boolean) => React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    heading: "Welcome!",
    big: true,
    body:
      "Whoop! Whoop! is a live memory race: flip cards, watch what everyone else flips, and be first to call a match.\n\nAlready confident? Skip anytime and jump straight in.\n\nHit NEXT to continue.",
  },
  {
    heading: "The Table",
    body:
      "Six or nine cards, face down. There is no free look here — you only ever learn a card by watching it flip.",
    visual: (sz, active) => <TableVisual sz={sz} active={active} />,
  },
  {
    heading: "The Die Decides",
    body:
      "Shape, number, or color. Whichever face the die lands on is what a match means this round.\nSame cards, new rule.",
    visual: (sz, active) => <DieVisual sz={sz} active={active} />,
  },
  {
    heading: "Your Turn",
    body:
      "On your turn you flip two cards, one at a time. Everyone sees them — yours and theirs. Remember both.",
    visual: (sz, active) => <TurnVisual sz={sz} active={active} />,
  },
  {
    heading: "WHOOP! WHOOP!",
    body:
      "Spotted a match? Call it any time, even during someone else's turn. Then tap two cards — the second tap locks your claim.",
    visual: (sz, active) => <WhoopVisual sz={sz} active={active} />,
  },
  {
    heading: "Match or Miss",
    body:
      "A match takes the pair, scores you two, and hands you the die so you set the next rule.\n\nA miss leaves those two cards face up for the rest of the round, costs you one card back to the draw pile, and locks that pair for you until the round ends. A miss never costs you a flip.",
    visual: (sz, active) => <MatchVisual sz={sz} active={active} />,
  },
  {
    heading: "First to 10",
    body:
      "Every chip shows a score out of ten. The first player to ten cards wins the game on the spot.",
    visual: (sz, active) => <ChipVisual sz={sz} active={active} />,
  },
  {
    heading: "That's It!",
    big: true,
    body:
      "You're ready. Flip, watch, remember, and call it before anyone else does.\n\nWhoop! Whoop!",
  },
];

export const MP_HOWTO_STEP_COUNT = SLIDES.length;

const SWIPE_PX = 40;

/** Step-card button surface, identical to the Daily stepper's. */
const buttonBase: React.CSSProperties = {
  height: 43.54,
  borderRadius: RADIUS.sm,
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  boxSizing: "border-box",
  fontFamily: FONT_FAMILY,
  fontWeight: 400,
  fontSize: 16,
  letterSpacing: "0.02em",
  background: INK,
  color: RAW.cream,
  cursor: "pointer",
};

/* ------------------------------------------------------------------ *
 * The stepper.
 *
 * `gate` mode is the first-run interstitial: SKIP and the final button
 * both proceed to the action the player asked for. `reference` mode is
 * the header link: close just closes.
 * ------------------------------------------------------------------ */
let lastOpen: { mode: string; at: number } = { mode: "", at: 0 };

const MultiplayerHowToSteps: React.FC<{
  mode: "gate" | "reference";
  /** Proceed to the action the player clicked (gate), or start play. */
  onStart: () => void;
  /** Dismiss without proceeding (reference mode only). */
  onClose: () => void;
}> = ({ mode, onStart, onClose }) => {
  const [step, setStep] = useState(0);
  const [prev, setPrev] = useState<{ index: number; dir: 1 | -1 } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const sz = useStep();

  useEffect(() => {
    markMpHowToSeen();
    if (!(lastOpen.mode === mode && Date.now() - lastOpen.at < 2000)) {
      lastOpen = { mode, at: Date.now() };
      trackEvent("mp_howto_opened", { metadata: { mode } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback(
    (next: number) => {
      if (next === step || next < 0 || next >= SLIDES.length) return;
      const d: 1 | -1 = next > step ? 1 : -1;
      setDir(d);
      setPrev({ index: step, dir: d });
      setStep(next);
    },
    [step],
  );

  useEffect(() => {
    if (!prev) return;
    const t = window.setTimeout(() => setPrev(null), 340);
    return () => window.clearTimeout(t);
  }, [prev]);

  const finish = useCallback(() => {
    markMpHowToSeen();
    trackEvent("mp_howto_finished", { metadata: { mode } });
    onStart();
  }, [onStart, mode]);

  const dismiss = useCallback(() => {
    markMpHowToSeen();
    trackEvent("mp_howto_skipped", { metadata: { mode, slide: step + 1 } });
    if (mode === "gate") onStart();
    else onClose();
  }, [mode, onStart, onClose, step]);

  // Escape + focus return: shared. Arrow-key paging stays local.
  useDismiss(dismiss, { escape: true, returnFocus: true });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(step + 1);
      else if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(e.clientY - start.y)) return;
    go(dx < 0 ? step + 1 : step - 1);
  };

  const headingStyle = (big: boolean): React.CSSProperties => ({
    fontFamily: FONT_FAMILY,
    fontWeight: 400,
    fontStyle: "normal",
    fontSize: big ? sz.headingBig : sz.heading,
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
    color: INK,
    textAlign: "center",
    margin: 0,
  });

  const bodyStyle = (big: boolean): React.CSSProperties => ({
    fontFamily: FONT_FAMILY_UI,
    fontWeight: FONT_WEIGHT_UI,
    fontSize: big ? sz.bodyBig : sz.body,
    lineHeight: 1.2,
    color: INK,
    textAlign: "center",
    margin: 0,
    whiteSpace: "pre-wrap",
  });

  const stepButton: React.CSSProperties = { ...buttonBase, flex: "1 1 0" };

  const renderSlide = (index: number, entering: boolean, d: 1 | -1) => {
    const s = SLIDES[index];
    const first = index === 0;
    const last = index === SLIDES.length - 1;
    return (
      <div
        className={entering ? "ww-step-in" : "ww-step-out"}
        style={
          {
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            background: RAW.khaki,
            borderRadius: RADIUS.sm,
            /* Vertical padding gives height back on very short viewports
               (in-app browser chrome) and clamps to its authored value on a
               normal phone screen and up. */
            padding: "min(24px, 3.5vh) clamp(16px, 9%, 32px) min(32px, 5vh)",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 0,
            "--ww-step-dx": `${d * 32}px`,
          } as React.CSSProperties
        }
      >
        {/* top row: progress dots + skip */}
        <div
          style={{
            width: "100%",
            maxWidth: sz.innerMaxW,
            flex: "0 0 auto",
            marginBottom: STEP_GAP,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 4 }} aria-hidden="true">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 12.17,
                  height: 12.17,
                  borderRadius: "50%",
                  background: i === index ? INK : "transparent",
                  border: i === index ? "none" : `2px solid ${INK}`,
                  boxSizing: "border-box",
                }}
              />
            ))}
          </div>
          <CloseButton
            label="SKIP"
            onClick={dismiss}
            ariaLabel={mode === "gate" ? "Skip how to play and start" : "Close how to play"}
            data-testid="mp-htp-skip"
            hitTestId="mp-htp-skip-hit"
            style={{ zIndex: 3 }}
          />
        </div>

        {s.big ? null : (
          <div
            style={{
              width: "100%",
              maxWidth: sz.innerMaxW,
              flex: "0 0 auto",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <h2 style={headingStyle(false)}>{s.heading}</h2>
          </div>
        )}

        {/* visual takes whatever is left between the heading and the copy */}
        <div
          style={{
            width: "100%",
            maxWidth: sz.innerMaxW,
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: s.visual ? "space-between" : "center",
            gap: s.visual ? 0 : 20,
            paddingBottom: s.visual ? STEP_GAP : 0,
          }}
        >
          {s.big ? <h2 style={headingStyle(true)}>{s.heading}</h2> : null}
          {s.visual ? <VisualFit key={`vis-${index}`}>{s.visual(sz, entering)}</VisualFit> : null}
          <p style={{ ...bodyStyle(!!s.big), flex: "0 0 auto" }}>{s.body}</p>
        </div>

        {/* buttons */}
        <div
          style={{
            width: "100%",
            maxWidth: sz.innerMaxW,
            flex: "0 0 auto",
            marginTop: STEP_GAP,
            display: "flex",
            gap: "clamp(16px, 16.5%, 48px)",
          }}
        >
          {last ? (
            <button
              type="button"
              className="ww-press"
              onClick={finish}
              style={{
                ...buttonBase,
                flex: "1 1 0",
                background: COLORS.red,
                border: `2px solid ${INK}`,
                fontStyle: "italic",
              }}
            >
              Lets Play!
              <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <>
              {!first && (
                <button
                  type="button"
                  className="ww-press"
                  onClick={() => go(index - 1)}
                  style={stepButton}
                >
                  <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                  BACK
                </button>
              )}
              <button
                type="button"
                className="ww-press"
                onClick={() => go(index + 1)}
                style={stepButton}
              >
                NEXT
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to Play"
      data-testid="mp-howto"
      style={{
        position: "fixed",
        inset: 0,
        /* In-app browsers report a layout viewport taller than the visible
           area, so `inset: 0` alone overflows behind their chrome. */
        height: "var(--ww-vh)",
        zIndex: 1000,
        background: COLORS.surface,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        overflow: "hidden",
        /* Same 24px frame as the Daily stepper. */
        gap: 24,
        padding: 24,
        paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
        "--daily-content-max-width": "402px",
        "--daily-content-padding-x": "24px",
      } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <DailyShapeRule />

      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          width: "100%",
          padding: 0,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: sz.cardMaxW,
            height: "100%",
            maxHeight: Math.round(sz.cardMaxW * CARD_RATIO),
            flex: "0 0 auto",
            position: "relative",
          }}
        >
          {prev && renderSlide(prev.index, false, prev.dir)}
          <React.Fragment key={step}>{renderSlide(step, true, dir)}</React.Fragment>
        </div>
      </div>

      <DailyShapeRule />
    </div>,
    portalHost,
  );
};

export default MultiplayerHowToSteps;
