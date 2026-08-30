import React from "react";
import { Helmet } from "react-helmet-async";
import SiteHeader, { SITE_HEADER_OFFSET } from "@/components/SiteHeader";
import { Link } from "react-router-dom";
import { COLORS, SPACE, RADIUS, BORDER, FONT_FAMILY, TEXT, textStyle } from "@/lib/tokens";
import { AppButton } from "@/components/ui/AppButton";

const panelStyle: React.CSSProperties = {
  background: COLORS.surface,
  border: BORDER.heavy,
  borderRadius: RADIUS.sm,
  padding: SPACE[12],
  display: "flex",
  flexDirection: "column",
  gap: SPACE[6],
};

const sectionTitleStyle: React.CSSProperties = {
  ...textStyle("heading", true),
  fontStyle: "italic",
  color: COLORS.ink,
  margin: 0,
};

const bodyStyle: React.CSSProperties = {
  ...textStyle("body", true),
  color: COLORS.inkMuted,
  lineHeight: 1.5,
  margin: 0,
};

const captionStyle: React.CSSProperties = {
  ...textStyle("captionItalic", true),
  color: COLORS.inkMuted,
};

const stepTitleStyle: React.CSSProperties = {
  ...textStyle("subhead", true),
  color: COLORS.ink,
  margin: 0,
};

const chipStyle: React.CSSProperties = {
  ...textStyle("caption", true),
  backgroundColor: COLORS.surface,
  border: BORDER.standard,
  borderRadius: RADIUS.md,
  padding: `${SPACE[3]}px ${SPACE[4]}px`,
  color: COLORS.inkMuted,
  whiteSpace: "nowrap",
};

const DieChip: React.FC<{ label: string; rotate: string }> = ({ label, rotate }) => (
  <div
    style={{
      width: 56,
      height: 56,
      borderRadius: 10,
      border: `4px solid ${COLORS.ink}`,
      background: COLORS.surface,
      color: COLORS.ink,
      fontFamily: FONT_FAMILY,
      fontStyle: "italic",
      fontWeight: 900,
      fontSize: TEXT.caption.mobileSize,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "2px 4px 8px rgba(0,0,0,0.3)",
      transform: `rotate(${rotate})`,
    }}
  >
    {label}
  </div>
);

const SupportPage: React.FC = () => {
  // React Router does not scroll to #hash targets on navigation.
  React.useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "auto", block: "start" }));
  }, []);

  const url = "https://whoop-whoop.lovable.app/about";
  const title = "How to Play WHOOP! WHOOP! — Rules, About & Pre-Order";
  const description =
    "Learn how to play WHOOP! WHOOP!, the memory card game where the die changes what a match means every round. Read the rules and pre-order the physical game.";

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <SiteHeader />
      <div
        style={{
          minHeight: "var(--ww-vh)",
          background: COLORS.surface,
          color: COLORS.ink,
          fontFamily: FONT_FAMILY,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            margin: "0 auto",
            padding: `calc(${SPACE[12]}px + ${SITE_HEADER_OFFSET}) ${SPACE[6]}px calc(${SPACE[16]}px + env(safe-area-inset-bottom))`,
            display: "flex",
            flexDirection: "column",
            gap: SPACE[8],
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <header style={{ ...panelStyle, alignItems: "center", textAlign: "center" }}>
            <img
              src="/WhoopWhoop_Dark_Logo.svg"
              alt="WHOOP! WHOOP!"
              style={{ height: 48, display: "block", maxWidth: "100%" }}
            />
            <h1 style={{ ...textStyle("subhead", true), fontStyle: "italic", color: COLORS.ink, margin: 0 }}>
              A memory game where the rules keep changing.
            </h1>
            <Link to="/" style={{ textDecoration: "none", width: "100%" }}>
              <AppButton variant="primary" tone="red" size="md" fullWidth>
                Play now
              </AppButton>
            </Link>
          </header>

          {/* How to Play */}
          <section id="how-to-play" style={{ ...panelStyle, scrollMarginTop: SPACE[6] }} aria-labelledby="how-to-play-title">
            <h2 id="how-to-play-title" style={sectionTitleStyle}>
              How to Play
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
              <h3 style={stepTitleStyle}>What is WHOOP! WHOOP!?</h3>
              <p style={bodyStyle}>
                A fast memory game where the rule keeps changing. Cards sit face-down; you flip them one at a
                time, remember what's where, and race to call matching pairs — but a die decides what counts as
                a match, and it changes every round.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
              <h3 style={stepTitleStyle}>Roll · Flip · Remember</h3>
              <p style={bodyStyle}>
                Each round starts with a roll — the die shows SHAPE, NUMBER, or COLOR. Then each player flips
                one card face-up for everyone to see. Watch every flip, yours and your opponents' — it's all
                information.
              </p>
              <div style={{ display: "flex", gap: SPACE[6], alignItems: "center" }}>
                <DieChip label="SHAPE" rotate="-4deg" />
                <DieChip label="COLOR" rotate="6deg" />
              </div>
              <div style={captionStyle}>The die picks what to match this round.</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
              <h3 style={stepTitleStyle}>WHOOP! WHOOP!</h3>
              <p style={bodyStyle}>
                Spot a matching pair? Shout WHOOP! WHOOP! and tap the two cards — anytime. Right: they're
                yours, and you roll next. Wrong: one card goes from your pile back to the bottom of the draw
                pile. Land the most pairs to win.
              </p>
              <div style={{ display: "flex", gap: SPACE[5], alignItems: "center" }}>
                <img
                  src="/cards/2-circle-blue.svg"
                  alt="Blue circle card, number 2"
                  loading="lazy"
                  style={{
                    width: 72,
                    height: 101,
                    borderRadius: RADIUS.md,
                    boxShadow: `0 0 0 3px ${COLORS.success}, 0 0 16px rgba(89,205,144,0.5)`,
                  }}
                />
                <img
                  src="/cards/4-circle-red.svg"
                  alt="Red circle card, number 4"
                  loading="lazy"
                  style={{
                    width: 72,
                    height: 101,
                    borderRadius: RADIUS.md,
                    boxShadow: `0 0 0 3px ${COLORS.success}, 0 0 16px rgba(89,205,144,0.5)`,
                  }}
                />
              </div>
              <div style={captionStyle}>Both circles — that's a SHAPE match!</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
              <h3 style={stepTitleStyle}>Ending the game</h3>
              <p style={bodyStyle}>
                Once the draw pile is empty, the game ends when two consecutive full rotations pass with no
                correct claim. Any cards still on the table are stranded and score for nobody. Most cards wins.
              </p>
            </div>
          </section>

          {/* About */}
          <section id="about" style={{ ...panelStyle, scrollMarginTop: SPACE[6] }} aria-labelledby="about-title">
            <h2 id="about-title" style={sectionTitleStyle}>
              About
            </h2>
            <div style={{ ...textStyle("body", true), fontStyle: "italic", color: COLORS.inkMuted }}>
              Luck, memory, and just enough competition to ruin a family dinner.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE[3] }}>
              <span style={chipStyle}>2–6 players</span>
              <span style={chipStyle}>Ages 7+</span>
              <span style={chipStyle}>15–20 min</span>
            </div>
            <p style={bodyStyle}>
              Flip a card, remember what's on it, and race to call the pairs. A die decides what a match even
              means — same shape, same number, same color — and it changes its mind every round. Your brain has
              to keep up.
            </p>
            <p style={bodyStyle}>
              This is a playable preview of the real thing — a physical card game meant for a table full of
              people. WHOOP! WHOOP! comes alive with 3, 4, 5, or 6 players all shouting over each other.
              That's where it's meant to be played.
            </p>
            <div
              style={{
                width: "100%",
                borderTop: `1px solid ${COLORS.panelMuted}`,
                opacity: 0.4,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: SPACE[3] }}>
              {[COLORS.red, COLORS.blue, COLORS.orange].map((c) => (
                <div
                  key={c}
                  style={{
                    width: 16,
                    height: 16,
                    backgroundColor: c,
                    border: BORDER.standard,
                    borderRadius: RADIUS.sm,
                  }}
                />
              ))}
              <span style={{ ...captionStyle, marginLeft: SPACE[2] }}>An Oleeha &amp; Co game.</span>
            </div>
            <div style={{ ...textStyle("caption", true), color: COLORS.inkMuted }}>
              WHOOP! WHOOP! · v6.0 Dice Edition
            </div>
          </section>

          {/* Pre-Order */}
          <section id="pre-order" style={{ ...panelStyle, alignItems: "center", textAlign: "center", scrollMarginTop: SPACE[6] }} aria-labelledby="pre-order-title">
            <h2 id="pre-order-title" style={sectionTitleStyle}>
              Get the physical game
            </h2>
            <p style={{ ...bodyStyle, maxWidth: 280 }}>
              48 cards, 2 match dice, and enough competition to ruin your family dinner.
            </p>
            <AppButton variant="primary" tone="red" size="md">
              Pre-Order Now
            </AppButton>
            <div style={{ ...textStyle("caption", true), color: COLORS.inkMuted }}>
              Coming soon — Oleeha &amp; Co
            </div>
          </section>

          <footer style={{ textAlign: "center" }}>
            <Link to="/" style={{ ...captionStyle, color: COLORS.ink }}>
              ← Back to the game
            </Link>
          </footer>
        </div>
      </div>
    </>
  );
};

export default SupportPage;
