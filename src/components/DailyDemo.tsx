import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import CloseButton from "@/components/CloseButton";
import DemoSpotlight from "@/components/DemoSpotlight";
import GameCard from "@/components/GameCard";
import { MatchGhostCard, useMatchGhostStage } from "@/components/matchGhostParts";
import { ALL_CARDS, type Card } from "@/cardData";
import DailyMissTracker from "@/components/DailyMissTracker";
import DailyRoundIntro, { DAILY_FADE_IN_MS, DAILY_ROLL_HERO_MS } from "@/components/DailyRoundIntro";
import { getDailyNumber } from "@/lib/daily";
import { DAILY_ROUNDS, MISSES_PER_ROUND, PEEK_MS, STUDY_MS } from "@/lib/dailyEngine";
import { markHowToSeen } from "@/lib/dailyHowTo";
import { trackDaily } from "@/lib/dailyEvents";
import { useDismiss } from "@/hooks/useDismiss";
import { DAILY_MATCH_HOLD_MS, DAILY_MATCH_REVEAL_MS, DAILY_MATCH_SETTLE_MS, DEAL_MOVE_MS, DEAL_STAGGER_MS, DEMO_BEAT_MS, DEMO_COPY_SETTLE_MS, GREAT_MATCH_DELAY_MS, WRONG_ANIM_MS, UI_ENTER_MS } from "@/lib/animationTiming";
import { COLORS, BORDER, SPACE, FONT_SIZE, MOTION, RADIUS, buttonStyle, textStyle, panelStyle } from "@/lib/tokens";
import { playDeal, playFlip, playDiceRoll, playCorrect, playWrong, playSelect, playDeselect, playWhoopCall, playPeek, playTick, startTheme, leaveThemeZone, prewarmTheme, HOW_TO_PLAY_THEME_FILE } from "@/lib/sounds";

export interface DailyDemoProps {
  mode: "gate" | "reference";
  mobile?: boolean;
  onStart: () => void;
  onClose: () => void;
}

// Fixed teaching board, never an actual puzzle or persisted attempt.
const IDS = ["1-circle-red", "2-star-blue", "3-square-yellow", "4-tri-blue", "2-circle-yellow", "1-square-red", "3-tri-yellow", "4-star-red", "1-tri-red"];
export const DAILY_DEMO_CARDS: Card[] = IDS.map((id) => {
  const [number, shape, color] = id.split("-");
  const card = ALL_CARDS.find((item) => item.number === Number(number) && item.shape === shape && item.color === color);
  if (!card) throw new Error(`Missing tutorial card ${id}`);
  return card;
});

export const DAILY_DEMO_STEPS = [
  { title: "9 Cards on Deck", body: "Nine cards, face down. One board to remember. Let's take a look.", region: "board" },
  { title: "Study, Study, Study", body: `${STUDY_MS / 1000} seconds to remember each card's shape, number, and color. The die hasn't rolled yet.`, region: "board" },
  { title: "The Die Decides", body: `Match the shape, number, or color on the die. ${DAILY_ROUNDS} rounds. Same board, a new roll each round.`, region: "readout" },
  { title: "Find Your Match", body: "Tap a card to pick it. Tap it again to change your mind. Your second selection locks the pair. These two stars match the SHAPE rule.", region: "board" },
  { title: "Match or Miss", body: `A match removes the pair. A miss keeps the cards and fills a dot. ${MISSES_PER_ROUND} misses ends that round, not the whole game. Here, a circle and a square don't match.`, region: "misses" },
  { title: "One PEEK", body: `One PEEK per game reveals the remaining cards for ${PEEK_MS / 1000} seconds. Use it before selecting a card. It shows in your results.`, region: "peek" },
  { title: "You're Ready!", body: "Three rounds. Trust your memory. Have fun, and try not to blink.", region: "board" },
] as const;

type Rule = "SHAPE" | "NUMBER" | "COLOR";
type Scene = { face: number[]; selected: number[]; removed: number[]; wrong: number[]; ghost: boolean; seconds: number | null; rule: Rule | null; peekSpent: boolean; peeking: boolean; dealing: boolean; misses: number; roll: number; rolling: boolean; settled: boolean };
const blank = (): Scene => ({ face: [], selected: [], removed: [], wrong: [], ghost: false, seconds: null, rule: null, peekSpent: false, peeking: false, dealing: false, misses: 0, roll: 0, rolling: false, settled: false });
// Same labels as the live board's readout.
const RULE_LABEL: Record<Rule, string> = { SHAPE: "Match the shape", NUMBER: "Match the number", COLOR: "Match the color" };
/** Gap between cards on the live board. */
const BOARD_GAP = 8;
/** The live board's claim-resolution beat between the second tap and the reveal. */
const CLAIM_MS = 450;
const EVERY = DAILY_DEMO_CARDS.map((_, index) => index);
const PAIR = [1, 7];
const MISS = [0, 2];
const REVEAL_HOLD = DAILY_MATCH_REVEAL_MS + DAILY_MATCH_HOLD_MS;
const ROLL_ORDER: Rule[] = ["NUMBER", "COLOR", "SHAPE"];
const ROLL_EVERY_MS = DAILY_ROLL_HERO_MS + DEMO_BEAT_MS * 2;

// Starts face down and flips itself, exactly like the live board's ghost layer.
function Reward({ card, k }: { card: Card; k: number }) {
  const { stage, faceUp } = useMatchGhostStage(undefined, false);
  return <MatchGhostCard card={card} stage={stage} faceUp={faceUp} k={k} style={{ position: "absolute", inset: 0 }} />;
}

let lastOpen = { mode: "", at: 0 };

function Spot({ on, style, children }: { on: boolean; style?: React.CSSProperties; children: React.ReactNode }) {
  return <DemoSpotlight active={on} style={style}>{children}</DemoSpotlight>;
}

export default function DailyDemo({ mode, onStart, onClose }: DailyDemoProps) {
  const [step, setStep] = useState(0);
  const [scene, setScene] = useState<Scene>(blank);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const root = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(240);
  const finished = useRef(false);
  const current = DAILY_DEMO_STEPS[step];
  const changeStep = (next: number) => setStep(Math.max(0, Math.min(DAILY_DEMO_STEPS.length - 1, next)));
  const dismiss = () => {
    if (finished.current) return;
    finished.current = true;
    trackDaily("howto_skipped", { props: { slide: step + 1 } });
    if (mode === "gate") onStart(); else onClose();
  };
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    markHowToSeen();
    trackDaily("howto_finished");
    onStart();
  };
  useDismiss(dismiss, { escape: true, returnFocus: true });

  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      setBoardWidth(Math.max(0, Math.min(300, rect.width, (rect.height - SPACE[4] * 2) / 1.4 + SPACE[4] * 2)));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    markHowToSeen();
    if (lastOpen.mode !== mode || Date.now() - lastOpen.at >= 2000) {
      lastOpen = { mode, at: Date.now() };
      trackDaily("howto_opened", { props: { mode } });
    }
    prewarmTheme(HOW_TO_PLAY_THEME_FILE);
    startTheme(HOW_TO_PLAY_THEME_FILE);
    root.current?.querySelector<HTMLButtonElement>("[data-demo-next]")?.focus();
    return () => leaveThemeZone();
  }, []);

  // Each step owns one finite script. Navigation cancels all pending beats;
  // no intervals, no changing countdown dependencies, no game-engine actions.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let last = 0;
    const at = (ms: number, update: Partial<Scene>, sound?: () => void) => {
      last = Math.max(last, ms);
      timers.push(setTimeout(() => {
        setScene((previous) => ({ ...previous, ...update }));
        sound?.();
      }, ms));
    };
    const base = blank();
    if (step >= 2) base.rule = "SHAPE";
    if (step >= 4) base.removed = PAIR;
    if (step === 6) base.removed = [];
    if (reduced) {
      setScene({ ...base, settled: true, face: step === 1 ? EVERY : step === 3 ? PAIR : step === 4 ? MISS : step === 5 ? EVERY.filter((i) => !PAIR.includes(i)) : [], seconds: step === 1 ? 10 : step === 5 ? 5 : null, peekSpent: step === 5, peeking: step === 5, misses: step === 4 ? 1 : 0 });
      return;
    }
    if (step === 0) {
      setScene({ ...base, dealing: true });
      timers.push(setTimeout(() => playDeal(DAILY_DEMO_CARDS.length, { startMs: DEAL_MOVE_MS }), 0));
      at(DEAL_MOVE_MS + DEAL_STAGGER_MS * DAILY_DEMO_CARDS.length, { dealing: false });
    } else setScene(step === 2 ? { ...base, rule: null } : base);
    if (step === 1) {
      at(DEMO_BEAT_MS, { face: EVERY, seconds: STUDY_MS / 1000 }, playFlip);
      for (let second = 1; second <= STUDY_MS / 1000; second++) {
        const left = STUDY_MS / 1000 - second;
        at(DEMO_BEAT_MS + second * 1000, { seconds: left }, left > 0 && left <= 3 ? playTick : undefined);
      }
      at(DEMO_BEAT_MS + STUDY_MS, { face: [], seconds: null }, playFlip);
    }
    if (step === 2) {
      // The live round intro: full-screen die, a new roll each round.
      ROLL_ORDER.forEach((rule, i) => {
        const start = DEMO_BEAT_MS + i * ROLL_EVERY_MS;
        at(start, { rolling: true, roll: i + 1, rule }, undefined);
        timers.push(setTimeout(playDiceRoll, start + DAILY_FADE_IN_MS));
        at(start + DAILY_ROLL_HERO_MS, { rolling: false });
      });
    }
    if (step === 3) {
      at(DEMO_BEAT_MS, { selected: [1] }, playSelect);
      at(DEMO_BEAT_MS * 2, { selected: [] }, playDeselect);
      at(DEMO_BEAT_MS * 3, { selected: [1] }, playSelect);
      // Second tap: outline clears at once, the claim resolves, then the ghost
      // pair flips up, holds and lifts away — the live sequence and cues.
      const claim = DEMO_BEAT_MS * 4;
      at(claim, { selected: [] }, playWhoopCall);
      at(claim + CLAIM_MS, { ghost: true });
      timers.push(setTimeout(playCorrect, claim + CLAIM_MS + REVEAL_HOLD + GREAT_MATCH_DELAY_MS));
      at(claim + CLAIM_MS + DAILY_MATCH_SETTLE_MS, { ghost: false, removed: PAIR });
    }
    if (step === 4) {
      at(DEMO_BEAT_MS, { selected: [0] }, playSelect);
      const claim = DEMO_BEAT_MS * 2;
      at(claim, { selected: [] }, playWhoopCall);
      at(claim + CLAIM_MS, { face: MISS }, playFlip);
      at(claim + CLAIM_MS + REVEAL_HOLD, { wrong: MISS, misses: 1 }, playWrong);
      at(claim + CLAIM_MS + REVEAL_HOLD + WRONG_ANIM_MS, { wrong: [], face: [] }, playFlip);
    }
    if (step === 5) {
      at(DEMO_BEAT_MS, { face: EVERY.filter((i) => !PAIR.includes(i)), seconds: PEEK_MS / 1000, peekSpent: true, peeking: true }, playPeek);
      for (let second = 1; second <= PEEK_MS / 1000; second++) at(DEMO_BEAT_MS + second * 1000, { seconds: PEEK_MS / 1000 - second });
      at(DEMO_BEAT_MS + PEEK_MS, { face: [], seconds: null, peeking: false }, playFlip);
    }
    // Focus dimming only arrives once the step's animation has fully played.
    at(last + (last > 0 ? DEMO_COPY_SETTLE_MS : 0), { settled: true });
    return () => timers.forEach(clearTimeout);
  }, [step, reduced]);

  // Before the step's animation finishes, nothing is dimmed: it reads like a live game.
  const lit = (region: string) => !scene.settled || current.region === region;
  const readout = step === 0 ? (scene.dealing ? "Dealing…" : "\u00A0")
    : step === 1 ? (scene.seconds !== null ? `Memorize: ${scene.seconds}` : "Cards down")
    : scene.peeking ? "Peeking…"
    : scene.rule ? RULE_LABEL[scene.rule] : "Rolling…";

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") { event.preventDefault(); changeStep(step + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); changeStep(step - 1); }
    if (event.key !== "Tab") return;
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <div ref={root} role="dialog" aria-modal="true" aria-label="How to Play Whoop! Whoop! Daily" data-testid="daily-demo" onKeyDown={onKeyDown}
    style={{ position: "fixed", inset: 0, height: "var(--ww-vh)", zIndex: 1000, background: COLORS.panel, color: COLORS.ink, padding: SPACE[6], paddingBottom: `calc(${SPACE[6]}px + env(safe-area-inset-bottom))`, boxSizing: "border-box", overflowY: "auto", display: "flex", justifyContent: "center" }}>
    <div style={{ width: "100%", maxWidth: 420, minHeight: 0, display: "flex", flexDirection: "column", gap: SPACE[4] }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: "none", gap: SPACE[8] }}>
        <div aria-label={`Step ${step + 1} of ${DAILY_DEMO_STEPS.length}`} style={{ display: "flex", gap: SPACE[4] }}>
          {DAILY_DEMO_STEPS.map((_, i) => <span key={i} aria-hidden="true" style={{ width: SPACE[3] * 1.5, height: SPACE[3] * 1.5, borderRadius: "50%", border: BORDER.standard, background: i <= step ? COLORS.ink : "transparent" }} />)}
        </div>
        <CloseButton label="Skip" ariaLabel={mode === "gate" ? "Skip how to play and continue" : "Close how to play"} onClick={dismiss} />
      </div>
      {/* The live board's header: round caption, readout, miss dots, Peek. */}
      <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE[3], width: boardWidth, maxWidth: "100%", alignSelf: "center" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={{ ...textStyle("caption", true), color: COLORS.inkMuted }}>Round {step === 2 && scene.roll ? scene.roll : 1} of {DAILY_ROUNDS} · {EVERY.length - scene.removed.length} cards</div>
          <Spot on={lit("readout") || lit("board") && step === 1}>
            <div data-testid="daily-demo-readout" style={{ ...textStyle("title", true), color: COLORS.ink, fontVariantNumeric: "tabular-nums", minHeight: "1.2em" }}>{readout}</div>
          </Spot>
          <Spot on={lit("misses")} style={{ marginTop: SPACE[2], display: "inline-block" }}>
            <DailyMissTracker used={scene.misses} />
          </Spot>
        </div>
        <Spot on={lit("peek")} style={{ flex: "0 0 auto" }}>
          <button type="button" tabIndex={-1} aria-hidden="true" disabled style={{ ...buttonStyle("secondary", "sm", { mobile: true, disabled: scene.peekSpent }), whiteSpace: "nowrap", pointerEvents: "none" }}>{scene.peekSpent ? "Peek Used" : "Peek (5s)"}</button>
        </Spot>
      </div>
      <DemoSpotlight active={lit("board") || lit("misses")} instant={reduced} style={{ flex: "1 1 auto", minHeight: 190, position: "relative" }}>
        <div ref={board} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div data-testid="daily-demo-board" aria-hidden="true" style={{ width: boardWidth, maxWidth: "100%", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: BOARD_GAP }}>
          {DAILY_DEMO_CARDS.map((card, i) => <div key={card.id} style={{ aspectRatio: "5 / 7", position: "relative" }}>
            {scene.removed.includes(i) ? <div style={{ height: "100%", borderRadius: RADIUS.sm, border: `2px dashed ${COLORS.inkMuted}`, opacity: 0.25 }} /> : <>
            <div style={{ height: "100%", visibility: scene.ghost && PAIR.includes(i) ? "hidden" : "visible" }}>
              <GameCard card={card} faceUp={scene.face.includes(i)} highlighted={scene.selected.includes(i)} wrong={!reduced && scene.wrong.includes(i)} interactive={false} fill dealKey={!reduced && step === 0 ? step : undefined} dealIndex={step === 0 ? i : undefined} />
            </div>
            {scene.ghost && PAIR.includes(i) && <Reward card={card} k={(boardWidth - BOARD_GAP * 2) / 3 / 104.333} />}
            </>}
          </div>)}
        </div>
        </div>
      </DemoSpotlight>
      {!reduced && <DailyRoundIntro active={scene.rolling} roundIndex={scene.roll || 1} attribute={scene.rule ?? "SHAPE"} faceIndex={0} tumbleSeed={scene.roll} />}
      <div key={step} className={reduced ? undefined : "ww-ui-enter"} role="status" aria-live="polite" aria-atomic="true" style={{ ...panelStyle("surface", 10), flex: "0 0 164px", minHeight: 164, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", animationDuration: `${UI_ENTER_MS}ms` }}>
        <h2 style={{ ...textStyle("subhead", true), fontSize: FONT_SIZE.xl, letterSpacing: 0, margin: `0 0 ${SPACE[2]}px` }}>{current.title}</h2>
        <p style={{ ...textStyle("body", true), margin: 0 }}>{current.body}</p>
      </div>
      <div style={{ display: "flex", gap: SPACE[4], flex: "none", paddingBottom: SPACE[2] }}>
        {step > 0 && <Button className="ww-press" onClick={() => changeStep(step - 1)} style={{ ...buttonStyle("neutral", "md", { mobile: true }), flex: 1 }}><ChevronLeft aria-hidden="true" />Back</Button>}
        <Button data-demo-next className="ww-press" onClick={step === DAILY_DEMO_STEPS.length - 1 ? finish : () => changeStep(step + 1)} style={{ ...buttonStyle("primary", "md", { mobile: true }), flex: step === DAILY_DEMO_STEPS.length - 1 ? 2 : 1 }}>
          {step === DAILY_DEMO_STEPS.length - 1 ? `Start Daily #${getDailyNumber()}` : "Next"}<ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  </div>;
}