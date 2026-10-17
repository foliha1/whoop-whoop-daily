import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import CloseButton from "@/components/CloseButton";
import DemoSpotlight from "@/components/DemoSpotlight";
import GameCard from "@/components/GameCard";
import { MatchGhostCard, useMatchGhostStage } from "@/components/matchGhostParts";
import { ALL_CARDS, type Card } from "@/cardData";
import { DIE_ART } from "@/lib/assetUrls";
import { getDailyNumber } from "@/lib/daily";
import { DAILY_ROUNDS, MISSES_PER_ROUND, PEEK_MS, STUDY_MS } from "@/lib/dailyEngine";
import { markHowToSeen } from "@/lib/dailyHowTo";
import { trackDaily } from "@/lib/dailyEvents";
import { useDismiss } from "@/hooks/useDismiss";
import { CARD_FLIP_MS, DAILY_MATCH_HOLD_MS, DAILY_MATCH_GREAT_MS, DEAL_MOVE_MS, DEAL_STAGGER_MS, DEMO_BEAT_MS, WRONG_ANIM_MS, UI_ENTER_MS } from "@/lib/animationTiming";
import { COLORS, BORDER, SPACE, FONT_SIZE, MOTION, buttonStyle, textStyle, panelStyle } from "@/lib/tokens";
import { playDeal, playFlip, playDiceRoll, playDieLand, playCorrect, playWrong, startTheme, leaveThemeZone, prewarmTheme, HOW_TO_PLAY_THEME_FILE } from "@/lib/sounds";

export interface DailyDemoProps {
  mode: "gate" | "reference";
  mobile?: boolean;
  onStart: () => void;
  onClose: () => void;
}

// Fixed teaching board, never an actual puzzle or persisted attempt.
const IDS = ["1-circle-red", "2-star-blue", "3-square-yellow", "4-tri-blue", "2-circle-yellow", "1-square-red", "3-tri-yellow", "4-star-red", "1-tri-red"];
export const DAILY_DEMO_CARDS: Card[] = IDS.map((id) => {
  const card = ALL_CARDS.find((item) => item.id === id);
  if (!card) throw new Error(`Missing tutorial card ${id}`);
  return card;
});

export const DAILY_DEMO_STEPS = [
  { title: "9 Cards on Deck", body: "Nine cards, face down. One board to remember. Let's take a look.", region: "board" },
  { title: "Study, Study, Study", body: `${STUDY_MS / 1000} seconds to remember each card's shape, number, and color. The die hasn't rolled yet.`, region: "board" },
  { title: "The Die Decides", body: `Match the shape, number, or color on the die. ${DAILY_ROUNDS} rounds. Same board, a new roll each round.`, region: "die" },
  { title: "Find Your Match", body: "Tap a card to pick it. Tap it again to change your mind. Your second selection locks the pair. These two stars match the SHAPE rule.", region: "board" },
  { title: "Match or Miss", body: `A match removes the pair. A miss keeps the cards. ${MISSES_PER_ROUND} misses ends that round, not the whole game. Here, a circle and a square don't match.`, region: "board" },
  { title: "One PEEK", body: `One PEEK per game reveals the remaining cards for ${PEEK_MS / 1000} seconds. Use it before selecting a card. It shows in your results.`, region: "peek" },
  { title: "You're Ready!", body: "Three rounds. Trust your memory. Have fun, and try not to blink.", region: "board" },
] as const;

type Scene = { face: number[]; selected: number[]; removed: number[]; wrong: number[]; ghost: boolean; seconds: number | null; rule: "SHAPE" | "NUMBER" | "COLOR" | null; peekSpent: boolean };
const blank = (): Scene => ({ face: [], selected: [], removed: [], wrong: [], ghost: false, seconds: null, rule: null, peekSpent: false });
const EVERY = DAILY_DEMO_CARDS.map((_, index) => index);
const PAIR = [1, 7];
const MISS = [0, 2];
const REVEAL_HOLD = CARD_FLIP_MS + DAILY_MATCH_HOLD_MS;

function Reward({ card }: { card: Card }) {
  const { stage, faceUp } = useMatchGhostStage(undefined, true);
  return <MatchGhostCard card={card} stage={stage} faceUp={faceUp} k={0.8} style={{ position: "absolute", inset: 0 }} />;
}

let lastOpen = { mode: "", at: 0 };

export default function DailyDemo({ mode, onStart, onClose }: DailyDemoProps) {
  const [step, setStep] = useState(0);
  const [scene, setScene] = useState<Scene>(blank);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const root = useRef<HTMLDivElement>(null);
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
    const at = (ms: number, update: Partial<Scene>, sound?: () => void) => {
      timers.push(setTimeout(() => {
        setScene((previous) => ({ ...previous, ...update }));
        sound?.();
      }, ms));
    };
    const base = blank();
    if (step >= 2) base.rule = "SHAPE";
    if (step >= 4) base.removed = PAIR;
    if (step === 6) base.removed = [];
    setScene(base);
    if (reduced) {
      setScene({ ...base, face: step === 1 ? EVERY : step === 3 ? PAIR : step === 4 ? MISS : step === 5 ? EVERY.filter((i) => !PAIR.includes(i)) : [], seconds: step === 1 ? 10 : step === 5 ? 5 : null, peekSpent: step === 5 });
      return;
    }
    if (step === 0) at(0, {}, playDeal);
    if (step === 1) {
      at(DEMO_BEAT_MS, { face: EVERY, seconds: STUDY_MS / 1000 }, playFlip);
      for (let second = 1; second <= STUDY_MS / 1000; second++) at(DEMO_BEAT_MS + second * 1000, { seconds: STUDY_MS / 1000 - second });
      at(DEMO_BEAT_MS + STUDY_MS, { face: [], seconds: null }, playFlip);
    }
    if (step === 2) {
      setScene({ ...base, rule: null });
      at(DEMO_BEAT_MS, {}, playDiceRoll);
      at(DEMO_BEAT_MS + CARD_FLIP_MS, { rule: "SHAPE" }, playDieLand);
      at(DEMO_BEAT_MS * 4, { rule: "NUMBER" }, playDieLand);
      at(DEMO_BEAT_MS * 7, { rule: "COLOR" }, playDieLand);
    }
    if (step === 3) {
      at(DEMO_BEAT_MS, { selected: [1] });
      at(DEMO_BEAT_MS * 2, { selected: [] });
      at(DEMO_BEAT_MS * 3, { selected: [1] });
      at(DEMO_BEAT_MS * 4, { selected: [], face: PAIR }, playFlip);
      at(DEMO_BEAT_MS * 4 + REVEAL_HOLD, { ghost: true }, playCorrect);
      at(DEMO_BEAT_MS * 4 + REVEAL_HOLD + DAILY_MATCH_GREAT_MS, { ghost: false, face: [], removed: PAIR });
    }
    if (step === 4) {
      at(DEMO_BEAT_MS, { selected: [0] });
      at(DEMO_BEAT_MS * 2, { selected: [], face: MISS }, playFlip);
      at(DEMO_BEAT_MS * 2 + REVEAL_HOLD, { wrong: MISS }, playWrong);
      at(DEMO_BEAT_MS * 2 + REVEAL_HOLD + WRONG_ANIM_MS, { wrong: [], face: [] }, playFlip);
    }
    if (step === 5) {
      at(DEMO_BEAT_MS, { face: EVERY.filter((i) => !PAIR.includes(i)), seconds: PEEK_MS / 1000, peekSpent: true }, playFlip);
      for (let second = 1; second <= PEEK_MS / 1000; second++) at(DEMO_BEAT_MS + second * 1000, { seconds: PEEK_MS / 1000 - second });
      at(DEMO_BEAT_MS + PEEK_MS, { face: [], seconds: null }, playFlip);
    }
    return () => timers.forEach(clearTimeout);
  }, [step, reduced]);

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
      <div style={{ ...textStyle("caption"), display: "flex", justifyContent: "space-between", flex: "none" }}><span>Whoop! Whoop! Daily</span><span>{DAILY_ROUNDS} rounds</span></div>
      <DemoSpotlight active={current.region === "board"} instant={reduced} style={{ flex: "1 1 auto", minHeight: 210, display: "grid", placeItems: "center" }}>
        <div data-testid="daily-demo-board" aria-hidden="true" style={{ width: "100%", maxWidth: 300, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: SPACE[4] }}>
          {DAILY_DEMO_CARDS.map((card, i) => <div key={card.id} style={{ aspectRatio: "180 / 252", position: "relative", opacity: scene.removed.includes(i) ? 0 : 1, transition: reduced ? undefined : `opacity ${MOTION.base}` }}>
            <div style={{ height: "100%", visibility: scene.ghost && PAIR.includes(i) ? "hidden" : "visible" }}>
              <GameCard card={card} faceUp={scene.face.includes(i)} highlighted={scene.selected.includes(i)} wrong={!reduced && scene.wrong.includes(i)} interactive={false} fill dealKey={!reduced && step === 0 ? step : undefined} dealIndex={step === 0 ? i : undefined} />
            </div>
            {scene.ghost && PAIR.includes(i) && <Reward card={card} />}
          </div>)}
        </div>
      </DemoSpotlight>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE[4], flex: "none", height: 64 }}>
        <DemoSpotlight active={current.region === "die" || step === 1} instant={reduced} style={{ ...panelStyle("surface", 3), display: "flex", alignItems: "center", justifyContent: "center", gap: SPACE[4] }}>
          {scene.rule ? <img src={DIE_ART[scene.rule]} alt={`Match ${scene.rule.toLowerCase()}`} style={{ height: "100%", maxWidth: "100%" }} /> : <span style={textStyle("control", true)}>{step === 1 && scene.seconds !== null ? `${scene.seconds}s` : "Waiting for roll…"}</span>}
        </DemoSpotlight>
        <DemoSpotlight active={current.region === "peek"} instant={reduced} style={{ display: "flex" }}>
          <Button tabIndex={-1} disabled style={{ ...buttonStyle("secondary", "md", { fullWidth: true, disabled: scene.peekSpent }), pointerEvents: "none" }}><Eye size={18} aria-hidden="true" />{step === 5 && scene.seconds !== null ? `${scene.seconds}s` : scene.peekSpent ? "PEEK used" : "PEEK"}</Button>
        </DemoSpotlight>
      </div>
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