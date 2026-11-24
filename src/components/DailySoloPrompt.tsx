import React, { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { BORDER, COLORS, FONT_FAMILY, RADIUS, RAW, SPACE, buttonStyle, textStyle } from "@/lib/tokens";
import felixPortrait from "@/assets/felix-portrait-red.svg.asset.json";

export interface FelixContext {
  streak?: number | null;
  peekUsed?: boolean;
  /** Picks the variation; the puzzle number keeps it stable on revisit. */
  seed?: number;
}

const pick = (lines: string[], seed: number) => lines[Math.abs(Math.floor(seed)) % lines.length];

/** FELIX reacts to the saved Daily outcome without changing any game data. */
export function felixDailyComment(
  roundsSolved: number,
  totalMisses: number,
  { streak = null, peekUsed = false, seed = 0 }: FelixContext = {},
): string {
  const allSolved = roundsSolved >= 3;
  if (peekUsed && !allSolved) {
    return pick([
      "Even with the peek? Don't worry, your secret is safe with me. Rematch in Solo?",
      "A quick peek and still a miss? Hey, it happens. Shake it off in Solo.",
      "I saw that peek! Even a second look couldn't save that round. Come get your revenge.",
    ], seed);
  }
  if (peekUsed && allSolved) {
    return pick([
      "Hey, a win is a win, even if you had to take a little peek. Try Solo with no helpers!",
      "Sneaking a peek to seal the deal? I respect the hustle. Let's see how you do in Solo.",
    ], seed);
  }
  if (streak !== null && streak >= 10 && roundsSolved >= 2) {
    return pick([
      `A ${streak}-day streak? Don't let it go to your head. Solo is a whole different beast.`,
      `${streak} days in a row! You're on fire. Think you can keep that pace against me?`,
    ], seed);
  }
  if (streak !== null && streak >= 3 && roundsSolved >= 2 && seed % 2 === 0) {
    return pick([
      `${streak}-day streak and climbing. Keep the momentum going in Solo!`,
      "Building up quite the streak! Care to test those reflexes against me?",
    ], seed >> 1);
  }
  if (allSolved && totalMisses === 0) {
    return pick([
      "A perfect Daily? Show-off. Now come try that against me.",
      "Zero misses, clean sweep. Impressive. But can you do it with me on the clock?",
      "Flawless memory today! Solo is waiting whenever you want a real challenge.",
    ], seed);
  }
  if (allSolved) {
    return pick([
      "Three rounds solved. I may have met my match. Care to test that theory?",
      "You got there in the end! Ready to see how fast you are in Solo?",
      "A few bumps along the way, but all three solved. Let's see what you've got in Solo.",
    ], seed);
  }
  if (roundsSolved === 2) {
    return pick([
      "Two out of three. Not bad, but I think you have one more in you.",
      "So close to a clean sweep. Come shake off that last round in Solo.",
      "Two down, one got away. Quick warm-up before you play me?",
    ], seed);
  }
  if (roundsSolved === 1) {
    return pick([
      "One round solved. I have a feeling you are just warming up.",
      "Just getting your bearings today. Come play a round of Solo to get in the groove.",
    ], seed);
  }
  return pick([
    "That Daily was a tricky one. Come play me in Solo and get your revenge.",
    "Rough board today! Happens to the best of us. Solo is ready when you want payback.",
  ], seed);
}

const DailySoloPrompt: React.FC<{
  roundsSolved: number;
  totalMisses: number;
  streak?: number | null;
  peekUsed?: boolean;
  seed?: number;
  mobile: boolean;
  onDone?: () => void;
  doneDisabled?: boolean;
}> = ({ roundsSolved, totalMisses, streak = null, peekUsed = false, seed = 0, mobile, onDone, doneDisabled = false }) => {
  const quoteRef = useRef<HTMLDivElement>(null);
  const floor = mobile ? 72 : 84;
  const ceiling = mobile ? 108 : 132;
  const [portraitSize, setPortraitSize] = useState(floor);

  // The portrait grows with the quote: it is measured against the quoted
  // comment and kept square, so the face fills the area beside the words.
  // The ceiling bounds it, so a narrow phone column can never push the quote
  // into an ever taller, ever narrower loop.
  useLayoutEffect(() => {
    const node = quoteRef.current;
    if (!node) return;
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      setPortraitSize(Math.round(Math.min(Math.max(height, floor), ceiling)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [floor, ceiling]);

  return (
    <section
      aria-label="FELIX's Solo challenge"
      data-testid="results-solo-prompt"
      style={{
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        gap: SPACE[4],
        padding: SPACE[5],
        border: BORDER.heavy,
        borderRadius: RADIUS.sm,
        // Light blue stays light in both themes, so copy uses fixed warm black.
        background: RAW.felixTint,
        color: RAW.warmBlack,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: SPACE[3] }}>
        <div
          data-testid="results-felix-avatar"
          style={{ width: portraitSize, height: portraitSize, flex: "0 0 auto" }}
        >
          <img
            src={felixPortrait.url}
            alt="FELIX"
            className="h-full w-full rounded-full object-cover"
          />
        </div>
        <div
          ref={quoteRef}
          data-testid="results-felix-quote"
          style={{ display: "flex", flexDirection: "column", gap: SPACE[2], minWidth: 0 }}
        >
          <p style={{ ...textStyle("label", mobile), fontFamily: FONT_FAMILY, color: RAW.warmBlack, margin: 0 }}>
            FELIX says:
          </p>
          <p style={{ ...textStyle("body", mobile), color: RAW.warmBlack, margin: 0 }}>
            “{felixDailyComment(roundsSolved, totalMisses, { streak, peekUsed, seed })}”
          </p>
        </div>
      </div>
      <div
        data-testid="results-exit-actions"
        style={{
          display: "grid",
          gridTemplateColumns: onDone
            ? "minmax(0, 2fr) minmax(0, 1fr)"
            : "minmax(0, 1fr)",
          gap: SPACE[3],
        }}
      >
        <Link
          to="/classic?mode=solo"
          className="ww-press"
          data-testid="results-solo"
          style={{
            ...buttonStyle("secondary", "lg", { mobile, fullWidth: true }),
            minWidth: 0,
            gap: SPACE[2],
            paddingInline: SPACE[3],
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Same sweep the Solo PLAY button uses: a thin and a wide glint. */}
          <span className="ww-shine-thin" aria-hidden="true" style={{ pointerEvents: "none", background: "#F8F2E9", transformOrigin: "0 0" }} />
          <span className="ww-shine-wide" aria-hidden="true" style={{ pointerEvents: "none", background: "#F8F2E9", transformOrigin: "0 0" }} />
          <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="11" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="M6 27c2-5 6-7 10-7s8 2 10 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          Play Solo
        </Link>
        {onDone && (
          <button
            type="button"
            className="ww-press"
            onClick={onDone}
            disabled={doneDisabled}
            data-testid="results-done"
            style={{
              ...buttonStyle("ink", "lg", { mobile, fullWidth: true, disabled: doneDisabled }),
              minWidth: 0,
              gap: SPACE[2],
              paddingInline: SPACE[3],
              // Done remains brand black in both themes; disabled uses the shared inactive surface.
              ...(doneDisabled ? {} : { background: RAW.warmBlack, color: RAW.cream }),
            }}
          >
            <Home size={20} aria-hidden="true" />
            Done
          </button>
        )}
      </div>
    </section>
  );
};

export default DailySoloPrompt;
