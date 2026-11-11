import React from "react";
import { Helmet } from "react-helmet-async";
import { ArrowDown, Dices } from "lucide-react";
import DailyFrame from "@/components/DailyFrame";
import HomeControl from "@/components/HomeControl";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import PhysicalFullRules from "@/components/PhysicalFullRules";
import { PhysicalRulesClosing } from "@/components/PhysicalRulesEnding";
import { ChapterDivider, GAME_COLORS, READ_W } from "@/components/rulesLayout";
import { ScrollReveal } from "@/components/MotionReveal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUmbrella } from "@/lib/launch";
import { useSkin } from "@/lib/skin";
import { trackEvent } from "@/lib/analytics";
import { BORDER, COLORS, RADIUS, SPACE, TEXT, textStyle } from "@/lib/tokens";

// Add a direct video file URL here to replace the poster with a video player.
export const RULES_VIDEO_URL: string | null = null;

const CHIPS = ["2 to 6 players", "Ages 7+", "15 to 20 minutes"];
const JUMP_LINKS = [
  { href: "#quick-start", label: "Quick Start" },
  { href: "#full-rules", label: "Full Rules" },
  { href: "#sticky", label: "Sticky Situations" },
];

const QUICK_STEPS: React.ReactNode[] = [
  <><strong>Deal 9 cards face down</strong> in a 3 by 3 grid. The rest is the draw pile.</>,
  <><strong>Roll the die.</strong> It says what counts as a match this round: same shape, same number, or same color.</>,
  <><strong>Take turns flipping two cards.</strong> Show each one, then turn it back down.</>,
  <><strong>Spot a match? Shout WHOOP! WHOOP!</strong> Touch the two cards and flip them.</>,
  <><strong>Right? Keep the pair</strong> and roll the next rule. <strong>Wrong?</strong> Put one of your cards back.</>,
  <><strong>First to 12 cards wins.</strong></>,
];

const RulesPage: React.FC = () => {
  useSkin();
  const umbrella = useUmbrella();
  React.useEffect(() => {
    trackEvent("rules_view");
    const u = new URL(window.location.href);
    if (u.searchParams.has("qr")) {
      trackEvent("rules_qr_scan");
      u.searchParams.delete("qr");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    }
  }, []);
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
  const HEADLINE = Math.round((mobile ? TEXT.resultHero.mobileSize : TEXT.resultHero.size) * 1.2);
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
            maxWidth: 804,
            paddingTop: SPACE[6],
            paddingBottom: SPACE[12],
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          <ScrollReveal index={0}>
            <header style={{ display: "flex", flexDirection: "column", gap: SPACE[12], textAlign: "center", width: "100%", maxWidth: READ_W, margin: "0 auto", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE[6] }}>
                <p style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>{"\n"}</p>
                <h1 style={{ ...textStyle("resultHero", mobile), fontSize: HEADLINE, lineHeight: 1.05, color: COLORS.ink, margin: 0, letterSpacing: 0 }}>
                  How to Play<br />
                  <span style={{ whiteSpace: "nowrap" }}>
                    <span>WH</span><span style={{ color: COLORS.orange }}>OO</span><span style={{ color: COLORS.blue }}>P</span><span style={{ color: COLORS.red }}>!</span>{" "}
                    <span>WH</span><span style={{ color: COLORS.orange }}>OO</span><span style={{ color: COLORS.blue }}>P</span><span style={{ color: COLORS.red }}>!</span>
                  </span>
                </h1>
                <p style={body}>The memory game where the rules keep changing.</p>
                <ul aria-label="Game details" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: SPACE[3] }}>
                  {CHIPS.map((chip) => (
                    <li key={chip} style={{ ...textStyle("caption", mobile), color: COLORS.ink, margin: 0, border: BORDER.standard, borderRadius: 999, padding: `${SPACE[2]}px ${SPACE[5]}px`, whiteSpace: "nowrap" }}>{chip}</li>
                  ))}
                </ul>
              </div>

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

              <nav aria-label="On this page" style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: `${SPACE[1]}px ${SPACE[8]}px` }}>
                {JUMP_LINKS.map((link) => (
                  <a key={link.href} href={link.href} className="hover:opacity-80" style={{ ...textStyle("chip", mobile), color: COLORS.blueText, textDecoration: "underline", textUnderlineOffset: SPACE[2], textDecorationThickness: 2, minHeight: 44, display: "inline-flex", alignItems: "center", gap: SPACE[2] }}>
                    {link.label}<ArrowDown size={16} strokeWidth={2.5} aria-hidden="true" />
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
                maxWidth: 680,
                margin: `${SPACE[20]}px auto 0`,
                minWidth: 0,
                borderRadius: RADIUS.md,
                background: COLORS.ink,
                color: COLORS.surface,
                padding: mobile ? `${SPACE[16]}px ${SPACE[10]}px` : `${SPACE[20] + SPACE[8]}px ${SPACE[20]}px`,
                display: "flex",
                flexDirection: "column",
                gap: SPACE[16],
              }}
            >
              <header style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE[3], textAlign: "center" }}>
                <h2 id="quick-start-title" style={{ ...textStyle("resultHero", mobile), fontSize: mobile ? TEXT.resultHero.mobileSize : TEXT.resultHero.size, lineHeight: 1.05, color: "inherit", margin: 0, letterSpacing: 0 }}>Quick Start</h2>
                <p style={{ ...textStyle("subhead", mobile), fontStyle: "italic", color: "inherit", opacity: 0.8, margin: 0, letterSpacing: 0 }}>Play in 60 seconds</p>
              </header>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 0 }}>
                {QUICK_STEPS.map((step, i) => (
                  <li key={i} style={{ display: "grid", gridTemplateColumns: `${mobile ? 44 : 64}px minmax(0, 1fr)`, columnGap: SPACE[6], alignItems: "center", padding: `${SPACE[6]}px 0`, borderTop: i === 0 ? 0 : "1.5px solid color-mix(in srgb, var(--ww-surface) 25%, transparent)" }}>
                    <span aria-hidden="true" style={{ ...textStyle("resultHero", mobile), fontSize: mobile ? 44 : 60, lineHeight: 1, textAlign: "center", color: GAME_COLORS[i % 3], paddingTop: 0 }}>{i + 1}</span>
                    <p style={{ ...body, color: "inherit" }}>{step}</p>
                  </li>
                ))}
              </ol>
              <p style={{ ...textStyle("title", mobile), fontStyle: "italic", textAlign: "center", color: "inherit", margin: 0, letterSpacing: 0, borderTop: `2px solid ${COLORS.orange}`, paddingTop: SPACE[12] }}>That&apos;s it. The rest of this page is for when someone at the table starts arguing.</p>
            </section>
          </ScrollReveal>

          <ChapterDivider mobile={mobile} />
          <PhysicalFullRules mobile={mobile} />
          <PhysicalRulesClosing mobile={mobile} />
          <DailyLegalFooter />
        </article>
      </DailyFrame>
    </>
  );
};

export default RulesPage;
