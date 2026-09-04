import React, { useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import DailyShapeRule from "@/components/DailyShapeRule";
import DailyLogoLockup from "@/components/DailyLogoLockup";
import DailyEmailCapture from "@/components/DailyEmailCapture";
import { BORDER, COLORS, FONT_FAMILY, RADIUS } from "@/lib/tokens";

const GEIST = '"Geist", "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: FONT_FAMILY,
  lineHeight: 1.15,
  color: COLORS.ink,
};

const subheadStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: FONT_FAMILY,
  lineHeight: 1.2,
  color: COLORS.ink,
};

const bodyStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: GEIST,
  fontWeight: 500,
  lineHeight: 1.45,
  color: COLORS.ink,
};

const fineStyle: React.CSSProperties = {
  ...bodyStyle,
  color: COLORS.inkMuted,
};

const section: React.CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

/**
 * Reveals every `[data-reveal]` element inside `root` once, as it scrolls into
 * view. Fire-once: elements are unobserved after revealing and never re-hidden.
 * Purely visual — nothing here blocks pointer events.
 */
const useScrollReveal = (root: React.RefObject<HTMLElement>) => {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const targets = Array.from(node.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (targets.length === 0) return;

    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("ww-reveal-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("ww-reveal-in");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [root]);
};

/** Staggered child delay, 60ms apart. */
const stagger = (i: number) => ({ "--reveal-delay": `${i * 60}ms` }) as React.CSSProperties;

const playButtonStyle: React.CSSProperties = {
  height: 80,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  background: COLORS.red,
  border: BORDER.heavy,
  borderRadius: RADIUS.sm,
  color: COLORS.surface,
  textDecoration: "none",
  fontFamily: FONT_FAMILY,
  fontStyle: "italic",
  lineHeight: 1.15,
};

const PlayCta: React.FC = () => (
  <Link to="/today" className="ww-press ww-landing-play" style={playButtonStyle}>
    <span style={{ display: "block", paddingBottom: 6 }}>Play Today's Daily</span>
  </Link>
);

const HowItWorksItem: React.FC<{ title: string; line: string; index: number }> = ({
  title,
  line,
  index,
}) => (
  <div className="ww-landing-hiw-item" data-reveal style={stagger(index)}>
    <h3 style={subheadStyle}>{title}</h3>
    <p style={bodyStyle}>{line}</p>
  </div>
);

const DIE_RULES: { src: string; label: string }[] = [
  { src: "/dice/match-shape.svg", label: "SHAPE" },
  { src: "/dice/match-number.svg", label: "NUMBER" },
  { src: "/dice/match-color.svg", label: "COLOR" },
];

const DieRuleTile: React.FC<{ src: string; label: string; index: number }> = ({
  src,
  label,
  index,
}) => (
  <div className="ww-landing-dice-tile" data-reveal style={stagger(index)}>
    {/* The die SVG carries its own "Match the SHAPE/NUMBER/COLOR" lockup, so the
        visible label lives in the art; keep it announced once for screen readers. */}
    <img src={src} alt={label} />
  </div>
);

const SecondaryWay: React.FC<{
  label: string;
  line: string;
  to: string;
  background: string;
  color: string;
  className: string;
}> = ({ label, line, to, background, color, className }) => (
  <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: 8 }}>
    <Link
      to={to}
      className={`ww-press ${className}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 48,
        border: BORDER.heavy,
        borderRadius: RADIUS.sm,
        background,
        color,
        textDecoration: "none",
        fontFamily: FONT_FAMILY,
        fontSize: 20,
        lineHeight: 1.15,
      }}
    >
      {label}
    </Link>
    <p className="ww-landing-fine" style={fineStyle}>{line}</p>
  </div>
);


const BOARD_CARDS: string[] = [
  "/cards/card-back.svg",
  "/cards/2-star-red.svg",
  "/cards/card-back.svg",
  "/cards/card-back.svg",
  "/cards/card-back.svg",
  "/cards/3-circle-blue.svg",
  "/cards/1-square-yellow.svg",
  "/cards/card-back.svg",
  "/cards/card-back.svg",
];

/** Decorative 3x3 board, desktop only, hidden from assistive tech. */
const DecorativeBoard: React.FC = () => (
  <div className="ww-landing-board" aria-hidden="true" role="presentation">
    {BOARD_CARDS.map((src, i) => (
      <img key={i} src={src} alt="" draggable={false} />
    ))}
  </div>
);

/**
 * Landing page at `/`. Single scrolling page that reuses the daily screen's
 * visual language: cream field, pattern strips top and tail, Friend headings,
 * Geist body copy.
 */
const LandingPage: React.FC = () => {
  const shellRef = useRef<HTMLDivElement>(null);
  useScrollReveal(shellRef);

  return (
  <>
    <Helmet>
      <title>WHOOP! WHOOP! — Daily Memory Game</title>
      <meta
        name="description"
        content="Play the free WHOOP! WHOOP! daily memory game. Nine cards, ten seconds, three rounds, two misses a round. A new memory challenge every day—no signup needed."
      />
      <meta
        property="og:title"
        content="WHOOP! WHOOP! — Daily Memory Game"
      />
      <meta
        property="og:description"
        content="Play the free WHOOP! WHOOP! daily memory game. Nine cards, ten seconds, three rounds, two misses a round. A new memory challenge every day—no signup needed."
      />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://whoop-whoop.lovable.app/" />
      <meta property="og:image" content="https://whoop-whoop.lovable.app/og-daily.png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta
        property="og:image:alt"
        content="WHOOP! WHOOP! — Nine cards. Ten seconds. Then the rules change."
      />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://whoop-whoop.lovable.app/og-daily.png" />
    </Helmet>


    <div
      ref={shellRef}
      className="ww-landing-shell"
      style={
        {
          minHeight: "var(--ww-vh)",
          background: COLORS.surface,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
          boxSizing: "border-box",
        } as React.CSSProperties
      }
    >
      <DailyShapeRule />

      <main className="ww-landing-main">
        {/* 1. Hero */}
        <section className="ww-landing-hero">
          <div className="ww-landing-hero-copy">
          <DailyLogoLockup />
          <h1 style={headingStyle}>Nine cards. Ten seconds.<br />Then the rules change.</h1>
          <p style={bodyStyle}>
            A memory game that moves the target on you. New puzzle every day.
          </p>
          <PlayCta />

          <p className="ww-landing-fine" style={fineStyle}>
            Free. No signup. About 30 seconds.
          </p>
          </div>

          <DecorativeBoard />
        </section>

        <div className="ww-landing-below">
        {/* 2. How it works */}
        <section style={{ ...section, gap: 0 }}>
          <HowItWorksItem
            index={0}
            title="See them."
            line="All nine cards face up for ten seconds."
          />
          <HowItWorksItem index={1} title="Lose them." line="The board flips down." />
          <HowItWorksItem
            index={2}
            title="Find them."
            line="The die decides what a match means. Three rounds, and it changes every time."
          />
        </section>

        {/* 3. One die. Three rules. */}
        <section style={{ ...section, gap: 16 }}>
          <h2 style={subheadStyle} data-reveal>One die. Three rules.</h2>
          <div className="ww-landing-dice-row">
            {DIE_RULES.map((r, i) => (
              <DieRuleTile key={r.label} src={r.src} label={r.label} index={i} />
            ))}
          </div>
          <p style={bodyStyle} data-reveal>
            Whichever face lands is what counts. Until the next round.
          </p>
        </section>

        {/* 4. The hook — full-bleed dark band */}
        <section className="ww-landing-band">
          <div className="ww-landing-band-inner" data-reveal>
            <h2 style={{ ...headingStyle, color: COLORS.surface }}>
              The cards never move. What matters about them does.
            </h2>
            <p style={{ ...bodyStyle, color: COLORS.surface }}>
              You spent ten seconds learning shapes. The die says color. Good luck.
            </p>
          </div>
        </section>

        {/* 4. Two more ways to play */}
        <section style={{ ...section, gap: 16 }} data-reveal>
          <h2 style={subheadStyle}>Two more ways to play</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <SecondaryWay
              label="Solo"
              to="/classic?mode=solo"
              className="ww-landing-way-solo"
              background={COLORS.blue}
              color={COLORS.surface}
              line="Play the full game against WHOOP. It remembers. Mostly."
            />
            <SecondaryWay
              label="Multiplayer"
              to="/classic?mode=multiplayer"
              className="ww-landing-way-multi"
              background={COLORS.orange}
              color={COLORS.ink}
              line="Get four friends around one board. This is the real thing."
            />

          </div>
        </section>

        {/* 5. Email capture */}
        <section style={section} data-reveal>
          <DailyEmailCapture source="landing" />
        </section>

        {/* 6. Foot CTA */}
        <section style={{ ...section, gap: 12 }} data-reveal>
          <PlayCta />
        </section>

        {/* 7. Footer */}
        <footer style={{ ...section, gap: 4 }}>
          <p style={subheadStyle}>A game from Oleeha &amp; Co.</p>
          <p className="ww-landing-fine" style={fineStyle}>
            Coming to a table near you.
          </p>
        </footer>
        </div>
      </main>

      <DailyShapeRule />
    </div>
  </>
  );
};

export default LandingPage;
