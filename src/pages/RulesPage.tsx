import React from "react";
import { Helmet } from "react-helmet-async";
import { Dices } from "lucide-react";
import DailyFrame from "@/components/DailyFrame";
import HomeControl from "@/components/HomeControl";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import PhysicalFullRules from "@/components/PhysicalFullRules";
import { PhysicalRulesClosing } from "@/components/PhysicalRulesEnding";
import { ScrollReveal } from "@/components/MotionReveal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUmbrella } from "@/lib/launch";
import { useSkin } from "@/lib/skin";
import { BORDER, COLORS, RADIUS, SPACE, textStyle } from "@/lib/tokens";

// Add a direct video file URL here to replace the poster with a video player.
export const RULES_VIDEO_URL: string | null = null;

const CHIPS = ["2 to 6 players", "Ages 7+", "15 to 20 minutes"];
const JUMP_LINKS = [
  { href: "#quick-start", label: "Quick Start" },
  { href: "#full-rules", label: "Full Rules" },
  { href: "#sticky", label: "Sticky Situations" },
];

const RulesPage: React.FC = () => {
  useSkin();
  const umbrella = useUmbrella();
  const mobile = useIsMobile();
  const title = "How to Play WHOOP! WHOOP! | Rules";
  const description = "Set up and play the physical WHOOP! WHOOP! card game in 60 seconds. For 2 to 6 players, ages 7 and up.";
  const url = "https://whoop-whoop.com/rules";
  const body: React.CSSProperties = {
    ...textStyle("body", mobile),
    color: COLORS.ink,
    margin: 0,
    letterSpacing: 0,
  };
  const anchorTarget: React.CSSProperties = { scrollMarginTop: SPACE[12] };

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
      </Helmet>
      {umbrella ? <HomeControl /> : null}
      <DailyFrame wide scroll align="top" topControl={umbrella} railGap={SPACE[20]}>
        <article
          id="rules"
          style={{
            width: "100%",
            maxWidth: 600,
            paddingTop: SPACE[6],
            paddingBottom: SPACE[12],
            display: "flex",
            flexDirection: "column",
            gap: SPACE[20],
          }}
        >
          <ScrollReveal index={0}>
            <header style={{ display: "flex", flexDirection: "column", gap: SPACE[8], textAlign: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: SPACE[4] }}>
                <p style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>At the Table</p>
                <h1 style={{ ...textStyle("resultHero", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 }}>
                  How to Play WHOOP! WHOOP!
                </h1>
                <p style={body}>The memory game where the rules keep changing.</p>
              </div>

              <ul aria-label="Game details" style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: SPACE[2], listStyle: "none", margin: 0, padding: 0 }}>
                {CHIPS.map((chip) => (
                  <li key={chip} style={{ ...textStyle("pill", mobile), color: COLORS.ink, background: COLORS.panel, border: BORDER.standard, borderRadius: RADIUS.lg, padding: `${SPACE[2]}px ${SPACE[4]}px` }}>
                    {chip}
                  </li>
                ))}
              </ul>

              <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", borderRadius: RADIUS.md, border: BORDER.heavy, background: COLORS.surface }}>
                {RULES_VIDEO_URL ? (
                  <video
                    aria-label="How to play WHOOP! WHOOP!"
                    controls
                    playsInline
                    preload="metadata"
                    src={RULES_VIDEO_URL}
                    style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE[4], color: COLORS.ink }}>
                    <Dices size={mobile ? 40 : 48} strokeWidth={1.5} aria-hidden="true" />
                    <span style={{ ...textStyle("subhead", mobile), margin: 0 }}>Video coming soon</span>
                  </div>
                )}
              </div>

              <nav aria-label="On this page" style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: `${SPACE[3]}px ${SPACE[6]}px` }}>
                {JUMP_LINKS.map((link) => (
                  <a key={link.href} href={link.href} style={{ ...textStyle("chip", mobile), color: COLORS.ink, textUnderlineOffset: SPACE[1] }}>
                    {link.label}
                  </a>
                ))}
              </nav>
            </header>
          </ScrollReveal>

          <ScrollReveal index={1}>
            <section
              id="quick-start"
              aria-labelledby="quick-start-title"
              style={{
                ...anchorTarget,
                boxSizing: "border-box",
                width: "100%",
                minWidth: 0,
                border: BORDER.heavy,
                borderRadius: RADIUS.md,
                background: COLORS.surface,
                padding: mobile ? SPACE[6] : SPACE[8],
                display: "flex",
                flexDirection: "column",
                gap: SPACE[8],
              }}
            >
              <h2 id="quick-start-title" style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>Play in 60 seconds</h2>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: SPACE[6] }}>
                <li style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: SPACE[4] }}>
                  <span aria-hidden="true" style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>1.</span>
                  <p style={body}><strong>Deal 9 cards face down</strong> in a 3 by 3 grid. The rest is the draw pile.</p>
                </li>
                <li style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: SPACE[4] }}>
                  <span aria-hidden="true" style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>2.</span>
                  <p style={body}><strong>Roll the die.</strong> It says what counts as a match this round: same shape, same number, or same color.</p>
                </li>
                <li style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: SPACE[4] }}>
                  <span aria-hidden="true" style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>3.</span>
                  <p style={body}><strong>Take turns flipping two cards.</strong> Show each one, then turn it back down.</p>
                </li>
                <li style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: SPACE[4] }}>
                  <span aria-hidden="true" style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>4.</span>
                  <p style={body}><strong>Spot a match? Shout WHOOP! WHOOP!</strong> Touch the two cards and flip them.</p>
                </li>
                <li style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: SPACE[4] }}>
                  <span aria-hidden="true" style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>5.</span>
                  <p style={body}><strong>Right? Keep the pair</strong> and roll the next rule. <strong>Wrong?</strong> Put one of your cards back.</p>
                </li>
                <li style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: SPACE[4] }}>
                  <span aria-hidden="true" style={{ ...textStyle("subhead", mobile), color: COLORS.ink }}>6.</span>
                  <p style={body}><strong>First to 12 cards wins.</strong></p>
                </li>
              </ol>
              <p style={body}>That&apos;s it. The rest of this page is for when someone at the table starts arguing.</p>
            </section>
          </ScrollReveal>

          <PhysicalFullRules mobile={mobile} />
          <PhysicalRulesClosing mobile={mobile} />
          <DailyLegalFooter />
        </article>
      </DailyFrame>
    </>
  );
};

export default RulesPage;
