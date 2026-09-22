import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DailyShapeRule from "@/components/DailyShapeRule";
import GameCard from "@/components/GameCard";
import CloseButton from "@/components/CloseButton";
import { useDismiss } from "@/hooks/useDismiss";
import { MatchGhostCard, useMatchGhostStage } from "@/components/matchGhostParts";
import { ALL_CARDS, type Card } from "@/cardData";
import {
  CARD_FLIP_MS,
  DAILY_MATCH_SETTLE_MS,
  DEAL_MOVE_MS,
  DEAL_STAGGER_MS,
  PRESS_ANIM_MS,
  SELECT_ANIM_MS,
  WRONG_ANIM_MS,
} from "@/lib/animationTiming";
import { trackDaily } from "@/lib/dailyEvents";

import {
  buttonStyle,
  COLORS,
  FONT_FAMILY,
  FONT_FAMILY_UI,
  FONT_WEIGHT_UI,
  RADIUS,
  RAW,
} from "@/lib/tokens";


/** localStorage flag: the first-run gate fires exactly once per browser. */
const SEEN_KEY = "ww_daily_howto_seen";

export function hasSeenHowTo(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked: never trap the player behind the gate
  }
}

export function markHowToSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

const CARD_BACK = "/cards/card-back.svg";

/* ------------------------------------------------------------------ *
 * Animation timings. Every loop duration lives here so the sequences
 * are tunable in one place. Transform and opacity only, everywhere.
 * ------------------------------------------------------------------ */
const T = {
  /** Slide 2 — nine cards flipping face up and back down (30% slower). */
  deck: {
    faceDown: 650,
    flip: 390,
    /** Per-card stagger: reads as a deal rather than a strobe. */
    stagger: 52,
    faceUp: 1300,
    hold: 650,
  },
  /** Slide 3 — leader lines drawing out with their labels. */
  study: {
    /** One frame at the start of the loop so the in-transition has a from-state. */
    prime: 30,
    /** Anchor dot at the card end: leads the stroke in, trails it out. */
    dot: 120,
    in: 500,
    stagger: 100,
    hold: 2000,
    out: 500,
    rest: 500,
  },

  /** Slide 4 — hard cut between the three die examples, plus a landing punch. */
  die: {
    dwell: 2000,
    /** Scale punch on the tile only: reads as the die landing. */
    punch: 180,
  },
  /** Slide 5 — pick, change your mind, pick again, flip. Holds only; the
   *  selection, flip and fade durations come from animationTiming. */
  pair: {
    /** Settled board before the first tap, matching slide 6's lead. */
    lead: 400,
    /** Full push-in and release; split into two steps so the transform runs on
     *  a stable element and the select wash is never cut short. */

    press: 180,
    selectHold: 300,
    deselectHold: 1000,
    reselectHold: 300,
    /** The second card sits selected before the pair flips, as in play. */
    secondHold: 300,
    faceUpHold: 300,
    fade: 300,
  },


  /** Slide 6 — a match then a miss. Holds only; the ghost, deal and wrong
   *  windows are the board's own constants. Every beat is separated by a hold
   *  so the loop reads as a demonstration rather than a scramble. */
  match: {
    /** Settled board before anything is touched. */
    lead: 400,
    firstHold: 350,
    secondHold: 250,
    /** All face down again after the refill, before the miss. */
    restHold: 600,
    missFirstHold: 350,
    missSecondHold: 250,
    wrongHold: 700,
  },

  /** Slide 7 — PEEK press, reveal, hide. */
  peek: {
    lead: 100,
    faceUpHold: 1000,
    rest: 600,
  },
} as const;



/** Slide 2 stagger spans eight gaps after the first card. */
const DECK_FLIP_WINDOW = T.deck.flip + T.deck.stagger * 8;
/** Slide 3 in/out window: dot lead/trail plus the stroke, last row two staggers late. */
const STUDY_IN_WINDOW = T.study.dot + T.study.in + T.study.stagger * 2;
const STUDY_OUT_WINDOW = T.study.out + T.study.dot + T.study.stagger * 2;


/** `prefers-reduced-motion: reduce` — every loop stops, one static frame. */
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

/**
 * Steps through `steps` (durations in ms) forever while `running` is true, and
 * resets to phase 0 the moment it goes false. One timer per visual, and only
 * the visual on the visible slide is ever running.
 */
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

/**
 * Decodes a set of images once and reports when they are all ready. Slide 2
 * flips at 500ms after the card mounts; on the first-run gate the face SVGs are
 * still in flight then, so the flip showed a blank mid-rotation.
 */
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
 * Authored Figma geometry. The card is authored against a 390-wide
 * screen but laid out responsively: widths, padding and gaps are fluid,
 * type stays at its authored size, and only the middle visual shrinks.
 * ------------------------------------------------------------------ */
/** Authored phone geometry; the card holds this ratio as its maximum. */
const CARD_BASE_W = 354;
const CARD_BASE_H = 569;
const CARD_RATIO = CARD_BASE_H / CARD_BASE_W;

/** Responsive size steps: phone (authored), tablet, desktop. */
type Step = {
  cardMaxW: number;
  innerMaxW: number;
  headingBig: number;
  heading: number;
  bodyBig: number;
  body: number;
  headingRowH: number;
  /** Multiplier applied to authored visual dimensions (not to type). */
  vis: number;
};

const STEPS: { min: number; step: Step }[] = [
  {
    min: 1280,
    step: { cardMaxW: 520, innerMaxW: 426, headingBig: 64, heading: 48, bodyBig: 18, body: 16, headingRowH: 112, vis: 520 / CARD_BASE_W },
  },
  {
    min: 768,
    step: { cardMaxW: 440, innerMaxW: 360, headingBig: 56, heading: 42, bodyBig: 17, body: 15, headingRowH: 98, vis: 440 / CARD_BASE_W },
  },
  {
    min: 0,
    step: { cardMaxW: CARD_BASE_W, innerMaxW: 290, headingBig: 48, heading: 36, bodyBig: 16, body: 14, headingRowH: 84, vis: 1 },
  },
];


const stepFor = (w: number): Step => STEPS.find((s) => w >= s.min)!.step;

/** Track the viewport width step (phone / tablet / desktop). */
const useStep = (): Step => {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 390 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return stepFor(w);
};

/** Panel ink follows the theme, so the slides read in night mode too. */
const INK = COLORS.ink;
/** The card art is a literal brand artifact: its ink stays literal. */
const ART_INK = RAW.warmBlack;

const heading = (big: boolean, sz: Step): React.CSSProperties => ({
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

const body = (big: boolean, sz: Step): React.CSSProperties => ({
  fontFamily: FONT_FAMILY_UI,
  fontWeight: FONT_WEIGHT_UI,
  fontSize: big ? sz.bodyBig : sz.body,
  lineHeight: 1.2,
  color: INK,
  textAlign: "center",
  margin: 0,
});

/** The card art is drawn square: every SVG paints a full-bleed cream
 *  rectangle, and the only `rx` in the file belongs to the inner colour panel.
 *  So the rounded edge is always a DOM clip, and the design keeps it
 *  proportional to card width rather than a fixed px value. */
const CARD_RADIUS_RATIO = 0.0607;
/** Corner radius for a card rendered at `w` px wide, at any visual scale. */
const cardRadius = (w: number) => w * CARD_RADIUS_RATIO;

const img = (src: string, alt: string, w: number, h: number, style?: React.CSSProperties) => (
  <img
    src={src}
    alt={alt}
    style={{
      width: w,
      height: h,
      display: "block",
      objectFit: "contain",
      borderRadius: cardRadius(w),
      ...style,
    }}
  />
);

/* ------------------------------------------------------------------ *
 * Slide 2 — nine cards flipping face up, staggered like a deal, then
 * flipping back down. Loop: down → flip up → up → flip down → hold.
 * ------------------------------------------------------------------ */
const DECK_FACES = [
  ["/cards/2-circle-red.svg", "Two red circles"],
  ["/cards/4-star-yellow.svg", "Four orange stars"],
  ["/cards/1-square-blue.svg", "One blue square"],
  ["/cards/3-tri-yellow.svg", "Three orange triangles"],
  ["/cards/2-star-blue.svg", "Two blue stars"],
  ["/cards/4-square-red.svg", "Four red squares"],
  ["/cards/1-circle-yellow.svg", "One orange circle"],
  ["/cards/3-square-blue.svg", "Three blue squares"],
  ["/cards/2-tri-red.svg", "Two red triangles"],
] as const;

const DECK_STEPS = [
  T.deck.faceDown,
  DECK_FLIP_WINDOW,
  T.deck.faceUp,
  DECK_FLIP_WINDOW,
  T.deck.hold,
] as const;

const DECK_FACE_SRCS = [CARD_BACK, ...DECK_FACES.map(([src]) => src)];

const DeckVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  // Hold the loop until every face has decoded: on the first-run gate the SVGs
  // are still in flight when the first flip would fire, which showed a blank.
  const imagesReady = useImagesReady(DECK_FACE_SRCS);
  const phase = usePhase(DECK_STEPS, active && visible && !reduce && imagesReady);
  // Face up across the flip-up window and the face-up hold.
  const up = reduce || phase === 1 || phase === 2;

  const w = 47.25 * v;
  const h = 66.15 * v;


  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${w}px)`,
        gridAutoRows: `${h}px`,
        gap: 8 * v,
      }}
      aria-hidden="true"
    >
      {DECK_FACES.map(([src], i) => (
        <div key={src} style={{ width: w, height: h, perspective: 600 }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
              // promote to its own layer up front so the first rotation does
              // not trigger a compositing flash
              willChange: "transform",
              transform: up ? "rotateY(180deg)" : "rotateY(0deg)",
              transition: reduce ? undefined : `transform ${T.deck.flip}ms ease`,
              transitionDelay: reduce ? undefined : `${i * T.deck.stagger}ms`,
            }}
          >

            <img
              src={CARD_BACK}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                backfaceVisibility: "hidden",
                borderRadius: cardRadius(w),
              }}
            />
            <img
              src={src}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                backfaceVisibility: "hidden",
                borderRadius: cardRadius(w),
                transform: "rotateY(180deg)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Slide 3 — one card face; the leader lines draw out from the card and
 * their labels fade in on the same clock, then reverse.
 * ------------------------------------------------------------------ */
const STUDY_STEPS = [
  T.study.prime,
  STUDY_IN_WINDOW,
  T.study.hold,
  STUDY_OUT_WINDOW,
  T.study.rest,
] as const;

/** Authored slide-3 geometry (scale 1): container, card, lines, labels. */
const STUDY_BOX = { w: 215, h: 186 };
const STUDY_CARD = { x: 0, y: 0.68, w: 132, h: 184.8 };
const STUDY_ROWS = [
  { label: "Number", lineX: 34, lineY: 28.18, lineW: 121, labelY: 22.68 },
  { label: "Shape", lineX: 85, lineY: 61.68, lineW: 70, labelY: 56.68 },
  { label: "Color", lineX: 110, lineY: 95.68, lineW: 45, labelY: 90.68 },
] as const;
const STUDY_LABEL_X = 162;
/** Anchor dot diameter at scale 1; scaled by `sz.vis` like the rest. */
const STUDY_DOT = 4;


const StudyVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const pageVisible = usePageVisible();
  const phase = usePhase(STUDY_STEPS, active && pageVisible && !reduce);
  const shown = reduce || phase === 1 || phase === 2;

  return (
    <div style={{ position: "relative", width: STUDY_BOX.w * v, height: STUDY_BOX.h * v }}>
      {img("/cards/3-star-blue.svg", "A card showing three blue stars", STUDY_CARD.w * v, STUDY_CARD.h * v, {
        position: "absolute",
        left: STUDY_CARD.x * v,
        top: STUDY_CARD.y * v,
      })}
      {STUDY_ROWS.map((row, i) => {
        const delay = reduce ? 0 : i * T.study.stagger;
        const dur = shown ? T.study.in : T.study.out;
        const ease = shown ? "cubic-bezier(0.16, 1, 0.3, 1)" : "ease-in";
        // In: dot first, stroke behind it. Out: stroke retracts, then the dot.
        const dotDelay = reduce ? 0 : shown ? delay : delay + T.study.out;
        const lineDelay = reduce ? 0 : shown ? delay + T.study.dot : delay;
        return (
          <React.Fragment key={row.label}>
            <span
              style={{
                position: "absolute",
                left: (row.lineX - STUDY_DOT / 2) * v,
                top: (row.lineY - STUDY_DOT / 2) * v,
                width: STUDY_DOT * v,
                height: STUDY_DOT * v,
                borderRadius: "50%",
                background: COLORS.orange,
                display: "block",
                // above the card artwork, same as the stroke
                zIndex: 1,
                opacity: shown ? 1 : 0,
                transform: shown ? "scale(1)" : "scale(0.4)",
                transition: reduce
                  ? undefined
                  : `opacity ${T.study.dot}ms ${ease} ${dotDelay}ms, transform ${T.study.dot}ms ${ease} ${dotDelay}ms`,
              }}
            />
            <span
              style={{
                position: "absolute",
                left: row.lineX * v,
                top: row.lineY * v,
                width: row.lineW * v,
                height: 1,
                background: COLORS.orange,
                display: "block",
                // above the card artwork
                zIndex: 1,
                transformOrigin: "left center",
                transform: shown ? "scaleX(1)" : "scaleX(0)",
                transition: reduce ? undefined : `transform ${dur}ms ${ease} ${lineDelay}ms`,
              }}
            />
            <span

              style={{
                position: "absolute",
                left: STUDY_LABEL_X * v,
                top: row.labelY * v,
                zIndex: 1,
                fontFamily: FONT_FAMILY_UI,
                fontWeight: FONT_WEIGHT_UI,
                fontSize: sz.body,
                lineHeight: 1.2,
                color: INK,
                whiteSpace: "nowrap",
                opacity: shown ? 1 : 0,
                transition: reduce ? undefined : `opacity ${dur}ms ${ease} ${delay}ms`,
              }}
            >
              {row.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
};



/* ------------------------------------------------------------------ *
 * Slide 4 — the die-decides tile + overlapping pair, cycling through
 * three examples. Each change cross dissolves: the tile label first,
 * the card pair a beat behind it, mirroring die-lands-then-you-look.
 * ------------------------------------------------------------------ */
type DieExample = { label: string; a: [string, string]; b: [string, string] };

const DIE_EXAMPLES: DieExample[] = [
  {
    label: "Match the COLOR",
    a: ["/cards/2-circle-yellow.svg", "Two orange circles"],
    b: ["/cards/4-star-yellow.svg", "Four orange stars"],
  },
  {
    label: "Match the SHAPE",
    a: ["/cards/3-circle-red.svg", "Three red circles"],
    b: ["/cards/1-circle-blue.svg", "One blue circle"],
  },
  {
    label: "Match the NUMBER",
    a: ["/cards/3-square-yellow.svg", "Three orange squares"],
    b: ["/cards/3-tri-red.svg", "Three red triangles"],
  },
];

const CYCLE_MS = T.die.dwell;

const DieVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const pageVisible = usePageVisible();
  const [i, setI] = useState(0);
  /** Bumped on manual interaction so the auto-cycle timer restarts. */
  const [cycleKey, setCycleKey] = useState(0);
  const advance = useCallback(() => setI((n) => (n + 1) % DIE_EXAMPLES.length), []);
  const running = active && pageVisible && !reduce;

  // Reset to the first example whenever the slide leaves the screen.
  useEffect(() => {
    if (!active) setI(0);
  }, [active]);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(advance, CYCLE_MS);
    return () => window.clearInterval(t);
  }, [advance, cycleKey, running]);

  const ex = DIE_EXAMPLES[i];
  const CW = 74.83 * v;
  const CH = 104.72 * v;
  const OX = 46.17 * v;
  const OY = 37.76 * v;
  const dot = 9 * v;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * v }}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          advance();
          setCycleKey((k) => k + 1);
        }}
        style={{ display: "flex", alignItems: "center", gap: 34 * v, cursor: "pointer" }}
      >
        <div
          style={{
            width: 121 * v,
            height: 121 * v,
            flex: "0 0 auto",
            background: RAW.cream,
            border: `2px solid ${ART_INK}`,
            borderRadius: 9.68 * v,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8 * v,
            boxSizing: "border-box",
          }}
        >
          <span
            key={ex.label}
            style={{
              display: "block",
              fontFamily: FONT_FAMILY,
              fontWeight: 400,
              fontSize: 28 * v,
              lineHeight: 0.9,
              color: INK,
              textAlign: "center",
              // Hard cut, with a small landing punch on the tile only.
              animation: reduce
                ? undefined
                : `ww-die-punch ${T.die.punch}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            }}
          >
            {ex.label}
          </span>
        </div>

        {/* card pair: pure cut, no fade and no delay */}
        <div style={{ position: "relative", width: CW + OX, height: CH + OY }}>
          {img(ex.a[0], ex.a[1], CW, CH, { position: "absolute", left: 0, top: 0 })}
          {img(ex.b[0], ex.b[1], CW, CH, { position: "absolute", left: OX, top: OY })}
        </div>

      </div>


      {/* example indicators — small circles, deliberately unlike the square
          slide dots at the top of the card */}
      <div style={{ display: "flex", gap: 8 * v }}>
        {DIE_EXAMPLES.map((e, n) => (
          <button
            key={e.label}
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
 * Slides 5-7 reuse the real board pieces: GameCard (selection wash + ring,
 * flip, wrong shake, deal-in) and the extracted match-ghost parts. Nothing
 * here re-implements a treatment or re-guesses a duration.
 * ------------------------------------------------------------------ */
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

/* ---- Slide 5 — pick, change your mind, pick again, then the pair flips ---- */
const PAIR_IDS = ["star-3-blue", "star-1-blue"] as const;
const PAIR_CARDS = PAIR_IDS.map(cardById);
const PAIR_SRCS = [CARD_BACK, ...PAIR_CARDS.map((c) => c.svgPath)];

/** Each tap is two steps — push in, then release — so the press runs on a
 *  stable element with a transform transition. Keyframes were remounting the
 *  card, which replayed the select wash and skipped the flip. */
const PAIR_PUSH = Math.round(T.pair.press / 2);
/** The release step also carries the select wash, so it never gets cut. */
const PAIR_RELEASE = Math.max(PAIR_PUSH, SELECT_ANIM_MS);

const PAIR_STEPS = [
  T.pair.lead,
  PAIR_PUSH, // 1  push in, first card
  PAIR_RELEASE + T.pair.selectHold, // 2  released and selected
  PAIR_PUSH, // 3  push in again
  PAIR_RELEASE + T.pair.deselectHold, // 4  released, deselected
  PAIR_PUSH, // 5  push in a third time
  PAIR_RELEASE + T.pair.reselectHold, // 6  released, selected again
  PAIR_PUSH, // 7  push in, second card
  PAIR_RELEASE + T.pair.secondHold, // 8  both selected, held as in play
  CARD_FLIP_MS, // 9  the pair flips
  T.pair.faceUpHold,
  T.pair.fade,
  /** Held invisible while the pair flips back down, so the loop fades in
   *  already face down rather than flipping in view. */
  CARD_FLIP_MS,
  T.pair.fade,
] as const;


const PairVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const ready = useImagesReady(PAIR_SRCS);
  const phase = usePhase(PAIR_STEPS, active && visible && !reduce && ready);

  // The left card is selected from its release step, dropped on the second tap,
  // and taken again on the third; the right card is selected on its release.
  const selLeft =
    reduce || phase === 1 || phase === 2 || (phase >= 5 && phase <= 11);
  const selRight = phase >= 7 && phase <= 11;
  const faceUp = !reduce && phase >= 9 && phase <= 11;
  /** Push-in steps: left card taps at 1, 3, 5; right card at 7. */
  const pushLeft = phase === 1 || phase === 3 || phase === 5;
  const pushRight = phase === 7;

  const w = 107.19 * v;
  const h = 150.06 * v;

  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        gap: 19.8 * v,
        opacity: phase === 11 || phase === 12 ? 0 : 1,
        transition: reduce ? undefined : `opacity ${T.pair.fade}ms linear`,
      }}
    >
      {PAIR_CARDS.map((card, i) => (
        <div
          key={card.id}
          style={{
            width: w,
            height: h,
            transform: `scale(${(i === 0 ? pushLeft : pushRight) ? 0.94 : 1})`,
            transition: reduce
              ? undefined
              : `transform ${PAIR_PUSH}ms cubic-bezier(0.2, 0, 0.2, 1)`,
          }}
        >
          {slotCard(w, h, {
            card,
            faceUp,
            highlighted: i === 0 ? selLeft : selRight,
          })}
        </div>
      ))}

    </div>
  );
};


/* ---- Slide 6 — match, ghost, refill, then a miss ------------------------- */
const MATCH_GRID_IDS = [
  "circle-2-yellow",
  "square-1-blue",
  "star-4-red",
  "tri-3-blue",
  "star-4-yellow",
  "circle-1-red",
  "square-3-blue",
  "tri-2-blue",
  "star-2-red",
] as const;
/** Slots 0 and 4 are the matching pair (both orange); 2 and 7 are the miss. */
const MATCH_PAIR = [0, 4] as const;
const MISS_PAIR = [2, 7] as const;
/** The two cards dealt into the emptied slots, exactly as the board refills. */
const MATCH_REFILL_IDS = ["square-4-blue", "circle-3-red"] as const;

const MATCH_GRID_CARDS = MATCH_GRID_IDS.map(cardById);
const MATCH_REFILL_CARDS = MATCH_REFILL_IDS.map(cardById);
const MATCH_SRCS = [
  CARD_BACK,
  ...MATCH_PAIR.map((i) => MATCH_GRID_CARDS[i].svgPath),
];

const MATCH_STEPS = [
  T.match.lead,
  SELECT_ANIM_MS + T.match.firstHold,
  SELECT_ANIM_MS + T.match.secondHold,
  DAILY_MATCH_SETTLE_MS,
  DEAL_MOVE_MS + DEAL_STAGGER_MS,
  T.match.restHold,
  SELECT_ANIM_MS + T.match.missFirstHold,
  SELECT_ANIM_MS + T.match.missSecondHold,
  WRONG_ANIM_MS,
  T.match.wrongHold,
] as const;

/** The pair copies the ghost plays, laid over the slots they left. */
const MatchGhostPair: React.FC<{
  w: number;
  h: number;
  gap: number;
}> = ({ w, h, gap }) => {
  const { stage, faceUp } = useMatchGhostStage();
  return (
    <>
      {MATCH_PAIR.map((slot) => (
        <MatchGhostCard
          key={slot}
          card={MATCH_GRID_CARDS[slot]}
          stage={stage}
          faceUp={faceUp}
          k={w / 104.333}
          radius={cardRadius(w)}
          style={{
            position: "absolute",
            left: (slot % 3) * (w + gap),
            top: Math.floor(slot / 3) * (h + gap),
            width: w,
            height: h,
          }}
        />
      ))}
    </>
  );
};

const MatchVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const ready = useImagesReady(MATCH_SRCS);
  const phase = usePhase(MATCH_STEPS, active && visible && !reduce && ready);

  const w = 47.25 * v;
  const h = 66.15 * v;
  const gap = 8 * v;

  const selected = (i: number): boolean => {
    if (reduce) return false;
    if (phase === 1) return i === MATCH_PAIR[0];
    if (phase === 2) return MATCH_PAIR.includes(i as 0 | 4);
    if (phase === 6) return i === MISS_PAIR[0];
    if (phase === 7) return MISS_PAIR.includes(i as 2 | 7);
    return false;
  };
  const solvedHidden = !reduce && phase === 3;
  const refilled = !reduce && phase >= 4;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(3, ${w}px)`,
        gridAutoRows: `${h}px`,
        gap,
      }}
    >
      {MATCH_GRID_CARDS.map((card, i) => {
        const isSolvedSlot = MATCH_PAIR.includes(i as 0 | 4);
        if (isSolvedSlot && solvedHidden) {
          // The board removes a solved card the instant it resolves; the ghost
          // layer above plays the reward over the empty slot.
          return <div key={card.id} style={{ width: w, height: h }} />;
        }
        const shown =
          isSolvedSlot && refilled
            ? MATCH_REFILL_CARDS[MATCH_PAIR.indexOf(i as 0 | 4)]
            : card;
        return slotCard(
          w,
          h,
          {
            card: shown,
            faceUp: false,
            highlighted: selected(i),
            wrong: !reduce && phase === 8 && MISS_PAIR.includes(i as 2 | 7),
            // Mounting with a dealIndex replays the board's deal-in.
            ...(isSolvedSlot && refilled
              ? { dealIndex: MATCH_PAIR.indexOf(i as 0 | 4) }
              : {}),
          },
          card.id,
        );
      })}

      {solvedHidden && <MatchGhostPair w={w} h={h} gap={gap} />}
    </div>
  );
};

/* ---- Slide 7 — PEEK presses, the board reveals, then hides --------------- */
const PEEK_IDS = [
  "circle-2-red",
  "star-4-yellow",
  "square-1-blue",
  "tri-3-yellow",
  "star-2-blue",
  "square-4-red",
] as const;
const PEEK_CARDS = PEEK_IDS.map(cardById);
const PEEK_SRCS = [CARD_BACK, ...PEEK_CARDS.map((c) => c.svgPath)];

const PEEK_STEPS = [
  T.peek.lead,
  PRESS_ANIM_MS,
  CARD_FLIP_MS,
  T.peek.faceUpHold,
  CARD_FLIP_MS,
  T.peek.rest,
] as const;

const PeekVisual: React.FC<{ sz: Step; active: boolean }> = ({ sz, active }) => {
  const v = sz.vis;
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const ready = useImagesReady(PEEK_SRCS);
  const phase = usePhase(PEEK_STEPS, active && visible && !reduce && ready);

  const pressed = !reduce && phase === 1;
  // Reduced motion rests on the representative frame: the peek showing.
  const faceUp = reduce || phase === 2 || phase === 3;
  const w = 47.25 * v;
  const h = 66.15 * v;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * v }}>
      <div
        aria-hidden="true"
        className={pressed ? "ww-press-on" : undefined}
        style={{
          width: 158 * v,
          height: 27 * v,
          background: COLORS.blue,
          border: `2px solid ${INK}`,
          borderRadius: RADIUS.sm,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT_FAMILY,
          fontWeight: 400,
          fontSize: 16 * v,
          letterSpacing: "0.02em",
          color: RAW.cream,
          transition: reduce ? undefined : `transform ${PRESS_ANIM_MS}ms ease, filter ${PRESS_ANIM_MS}ms ease`,
        }}
      >
        PEEK
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
        {PEEK_CARDS.map((card) => slotCard(w, h, { card, faceUp }, card.id))}
      </div>
    </div>
  );
};



/* ------------------------------------------------------------------ *
 * The visual is the only flexible element: the body copy and buttons
 * take their space first, and whatever height is left over is all the
 * visual may ever have. The scaled content is taken out of flow
 * (absolutely positioned) so it can never inflate its own box, the box
 * clips, and the scale is computed on the frame after layout settles.
 * Below VISUAL_MIN_SCALE the picture is illegible, so it is hidden
 * rather than allowed to collide with the copy.
 * ------------------------------------------------------------------ */
const VISUAL_MIN_SCALE = 0.45;

/** Spacing applied below the dots row and above the buttons row (formerly the
 *  root flex gap; kept identical, just relocated). */
const STEP_GAP = "min(clamp(12px, 4%, 24px), 2.2vh)";

const VisualFit: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  /** 0 means "not measured yet"; the visual stays hidden for that frame. */
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

    /* Measure after the browser has laid out, never during render. */
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
      data-testid="htp-visual-box"
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
        data-testid="htp-visual"
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
    body: "Whoop! Whoop! Daily is a quick, fun, and surprisingly challenging memory game. Let's run through the rules so you know exactly how to play.\n\nAlready confident? Feel free to skip anytime and dive right in.\n\nHit NEXT to continue.",
  },
  {
    heading: "9 Cards on Deck",
    body:
      "The board starts with nine cards, face down. Then they all flip to reveal the face of each card.",
    visual: (sz, active) => <DeckVisual sz={sz} active={active} />,
  },
  {
    heading: "Study, Study, Study",
    body:
      "While the cards are face up, you get 10 seconds to learn the shape, the number, and the color of every card. The die has not rolled yet, so you don't know what really matters.",
    visual: (sz, active) => <StudyVisual sz={sz} active={active} />,
  },
  {
    heading: "The Die Decides",
    body:
      "Shape, number, or color. Whichever face lands is what a match means this round. The die rolls again every round.\nSame cards, new rule.",
    visual: (sz, active) => <DieVisual sz={sz} active={active} />,
  },
  {
    heading: "Find Your Match",
    body:
      "Tap a card to pick it. Tap it again to change your mind. Your second tap locks the match.",
    visual: (sz, active) => <PairVisual sz={sz} active={active} />,
  },
  {
    heading: "Match or Miss",
    body:
      "Find a match and that pair leaves. Two misses ends the round and all cards stay on the board.",
    visual: (sz, active) => <MatchVisual sz={sz} active={active} />,
  },
  {
    heading: "One More Thing",
    body:
      "You have one PEEK per game that shows all remaining cards for five seconds. But know that it shows up in your final results.",
    visual: (sz, active) => <PeekVisual sz={sz} active={active} />,


  },
  {
    heading: "That's It!",
    big: true,
    body:
      "You, my friend, are ready to play\nWhoop! Whoop! Daily. \n\nHave fun and don't worry, your memory will get better.",
  },
];

export const HOWTO_STEP_COUNT = SLIDES.length;

const SWIPE_PX = 40;

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
  color: COLORS.surface,
  cursor: "pointer",
};

/**
 * Eight-slide How to Play sequence.
 *
 * `gate` mode is the first-run interstitial: the close control and the final
 * button both start the run. `reference` mode is the ready-screen chip: close
 * just closes, the final button starts a run.
 */
let lastHowToOpen: { mode: string; at: number } = { mode: "", at: 0 };


const DailyHowToSteps: React.FC<{
  mode: "gate" | "reference";
  mobile?: boolean;
  /** Start the daily run. */
  onStart: () => void;
  /** Dismiss without starting (reference mode only). */
  onClose: () => void;
}> = ({ mode, onStart, onClose }) => {
  const [step, setStep] = useState(0);
  const [prev, setPrev] = useState<{ index: number; dir: 1 | -1 } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const sz = useStep();


  useEffect(() => {
    markHowToSeen();
    // The screen cross-fade keeps a copy of the outgoing tree alive for a beat,
    // which remounts this component; the guard keeps that from double-counting.
    if (!(lastHowToOpen.mode === mode && Date.now() - lastHowToOpen.at < 2000)) {
      lastHowToOpen = { mode, at: Date.now() };
      trackDaily("howto_opened", { props: { mode } });
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
    const t = window.setTimeout(() => setPrev(null), 250);
    return () => window.clearTimeout(t);
  }, [prev]);

  const finish = useCallback(() => {
    markHowToSeen();
    trackDaily("howto_finished");
    onStart();
  }, [onStart]);

  const dismiss = useCallback(() => {
    markHowToSeen();
    trackDaily("howto_skipped", { props: { slide: step + 1 } });
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
            background: COLORS.panel,
            borderRadius: RADIUS.sm,
            /* Vertical padding and gaps give height back on very short
               viewports (in-app browser chrome) so the copy and buttons
               always fit; they clamp to their authored values on a
               normal phone screen and up. */
            padding: "min(24px, 3.5vh) clamp(16px, 9%, 32px) min(32px, 5vh)",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            /* Root gap is 0 on purpose: spacing is applied only between the
               siblings that need it (below the dots row, above the buttons
               row). Nothing sits between the heading row and the middle
               container, so centring the visual inside that container is
               centring it between the heading and the copy. */
            gap: 0,

            "--ww-step-dx": `${d * 8}px`,
          } as React.CSSProperties
        }
      >
        {/* top row: progress dots + close */}
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
            label="Skip"
            onClick={dismiss}
            ariaLabel={mode === "gate" ? "Skip how to play and start" : "Close how to play"}
            data-testid="htp-skip"
            hitTestId="htp-skip-hit"
            style={{ zIndex: 3 }}
          />

        </div>

        {/* heading row: hugs the heading itself (no fixed height, so no dead
            space between the top of the card and the headline). Any slack goes
            to the middle container, which is responsive and absorbs whatever
            height is available. */}
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
            <h2 style={heading(false, sz)}>{s.heading}</h2>
          </div>
        )}


        {/* visual takes the space left between the heading row and the copy */}
        <div
          style={{
            width: "100%",
            maxWidth: sz.innerMaxW,
            flex: "1 1 auto",
            minHeight: 0,
            /* The copy is the priority; clipping is the last resort so the
               paragraph can never be painted over the buttons. */
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: s.visual ? "space-between" : "center",
            gap: s.visual ? 0 : 20,
            /* breathing room between the copy and the buttons row; also
               tightens the flexible visual area so the graphics hug closer */
            paddingBottom: s.visual ? STEP_GAP : 0,
          }}

        >
          {s.big ? <h2 style={heading(true, sz)}>{s.heading}</h2> : null}
          {s.visual ? <VisualFit key={`vis-${index}`}>{s.visual(sz, entering)}</VisualFit> : null}

          <p
            style={{
              ...body(!!s.big, sz),
              flex: "0 0 auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {s.body}
          </p>
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
                  style={{ ...buttonBase, flex: "1 1 0" }}
                >
                  <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                  Back
                </button>
              )}
              <button
                type="button"
                className="ww-press"
                onClick={() => go(index + 1)}
                style={{ ...buttonBase, flex: "1 1 0" }}
              >
                Next
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
      style={{
        position: "fixed",
        inset: 0,
        /* In-app browsers (Instagram, Facebook) report a layout viewport
           taller than the visible area, so `inset: 0` alone overflows
           behind their chrome. `--ww-vh` resolves to dvh where available
           and falls back to vh. */
        height: "var(--ww-vh)",
        zIndex: 1000,

        background: COLORS.surface,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        overflow: "hidden",
        /* Same 24px frame as DailyFrame: the shape rules must measure the
           identical width and height here, or the pattern band snaps to a
           different cell count and appears to shift when this opens. */
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
        ref={hostRef}
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
    </div>
  );
};

export default DailyHowToSteps;
