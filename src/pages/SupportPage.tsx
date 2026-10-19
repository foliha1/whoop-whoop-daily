import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cardArt } from "@/lib/assetUrls";
import { useUmbrella } from "@/lib/launch";
import { useIsMobile } from "@/hooks/use-mobile";
import { COLORS, RAW, SPACE, RADIUS, SHADOW, TEXT, textStyle } from "@/lib/tokens";
import { useThemeMode } from "@/lib/nightMode";
import DailyFrame from "@/components/DailyFrame";
import HomeControl from "@/components/HomeControl";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import { ScrollReveal } from "@/components/MotionReveal";
import { AppButton } from "@/components/ui/AppButton";
import CardWaterfall from "@/components/CardWaterfall";
import FelixSignature from "@/components/FelixSignature";
import teamPlaceholder from "@/assets/team-placeholder.jpg.asset.json";

const ART = [
  { name: "1-circle-blue", alt: "One blue circle", rotation: "-9deg" },
  { name: "2-square-red", alt: "Two red squares", rotation: "-3deg" },
  { name: "3-tri-yellow", alt: "Three yellow triangles", rotation: "3deg" },
  { name: "4-star-blue", alt: "Four blue stars", rotation: "9deg" },
];

// Stand-in until the real team photo arrives: swap this for the imported photo.
const TEAM_PHOTO: string | null = teamPlaceholder.url;


const SupportPage: React.FC = () => {
  const umbrella = useUmbrella();
  const mobile = useIsMobile();
  const [cascade, setCascade] = React.useState(false);
  const { theme } = useThemeMode();
  // The card art sits on an off-white page in the light colour way, so it needs
  // the shared playing-card lift to separate from the background. Night mode
  // already puts off-white art on near-black, where a shadow reads as mud.
  const cardShadow = theme === "light" ? SHADOW.card : undefined;
  // The team photo is a print lying on the table: paper all the way round, with
  // the deeper bottom margin a Polaroid leaves for a caption, a hair of a turn
  // so it reads placed by hand, and a soft shadow pooled right under the print
  // so it sits down on the page instead of floating above it. Night keeps the
  // same shadow, just heavier, because black barely registers on near-black.
  const photoFrame: React.CSSProperties = {
    width: "100%",
    backgroundColor: theme === "light" ? RAW.offWhite : RAW.creamHover,
    padding: `${mobile ? SPACE[6] : SPACE[10]}px ${mobile ? SPACE[6] : SPACE[10]}px ${mobile ? SPACE[16] : SPACE[20]}px`,
    borderRadius: RADIUS.sm,
    transform: "rotate(-1deg)",
    boxShadow: theme === "light"
      ? "0 1px 1px rgba(0,0,0,0.07), 0 2px 3px rgba(0,0,0,0.06), 0 14px 24px -12px rgba(0,0,0,0.28)"
      : "0 1px 1px rgba(0,0,0,0.3), 0 14px 24px -12px rgba(0,0,0,0.6)",
  };
  // The story opens one notch above the system's largest heading role.
  const HEADLINE = Math.round((mobile ? TEXT.resultHero.mobileSize : TEXT.resultHero.size) * 1.2);
  const title = "About WHOOP! WHOOP! — A game by Felix Oliha";
  const description = "The story behind WHOOP! WHOOP!: Felix Oliha, a graphic designer exploring world building through games, under Oleeha & Co.";
  const url = "https://whoop-whoop.com/about";
  const body: React.CSSProperties = { ...textStyle("body", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const stack: React.CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE[8] };

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
      {umbrella ? <HomeControl /> : null}
      <DailyFrame wide scroll align="top" topControl={umbrella} railGap={SPACE[20]}>
        <article id="about" style={{ ...stack, gap: SPACE[20], width: "100%", maxWidth: 600, paddingTop: SPACE[6], paddingBottom: SPACE[12] }}>
          <ScrollReveal index={0}>
            <header style={{ ...stack, gap: SPACE[12], textAlign: "center" }}>
              <h1 style={{ ...textStyle("resultHero", mobile), fontSize: HEADLINE, lineHeight: 1.08, color: COLORS.ink, margin: 0, letterSpacing: 0 }}>
                A peek{" "}
                <span aria-hidden="true" style={{ fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}>👀</span>
                <br />

                behind the cards.
              </h1>

            </header>
          </ScrollReveal>

          <ScrollReveal index={1}>
            <section aria-label="My story" style={stack}>
              <p style={body}>Hi, I’m Felix. A graphic designer, and now, somewhat accidentally, an indie game builder.</p>
              <p style={body}>My work has lived in brand identities, layouts, and visual systems. But I wanted to see what happened beyond the logo. Less designing how something looks. More building a world people can step into.</p>
              <p style={body}>WHOOP! WHOOP! is my way of following that curiosity. Colors, numbers, shapes — familiar design ingredients, turned into something you can play with.</p>
              <p style={body}>It turns out a few simple cards can make people surprisingly competitive. Myself included.</p>
            </section>
          </ScrollReveal>

          <ScrollReveal index={2}>
                <button type="button" onClick={() => setCascade(true)} aria-label="WHOOP! WHOOP! card designs" data-testid="card-waterfall-trigger" style={{ margin: 0, padding: `${SPACE[12]}px ${SPACE[6]}px`, width: "100%", background: "transparent", border: 0, cursor: "pointer", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: SPACE[6], alignItems: "center" }}>
                  {ART.map((card) => (
                    <img key={card.name} src={cardArt(card.name)} alt="" loading="lazy" decoding="async" style={{ display: "block", width: "100%", aspectRatio: "5 / 7", objectFit: "contain", borderRadius: RADIUS.md, boxShadow: cardShadow, transform: `rotate(${card.rotation})` }} />
                  ))}
                </button>
                {cascade && <CardWaterfall onClose={() => setCascade(false)} />}
          </ScrollReveal>

          <ScrollReveal index={3}>
            <section style={stack} aria-labelledby="real-table-title">
              <h2 id="real-table-title" style={{ ...textStyle("hero", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 }}>Made for a real table, too.</h2>
              <p style={body}>You can play here in your browser, but the idea reaches beyond the screen: real cards, rolling dice, and a table full of people shouting over each other.</p>
              <p style={body}>A physical edition is part of that world. More on that when it’s ready. For now, I’m glad you’re here, playing along.</p>
            </section>
          </ScrollReveal>

          <ScrollReveal index={4}>
            <section style={stack} aria-labelledby="team-title">
              <h2 id="team-title" style={{ ...textStyle("hero", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 }}>The people behind Oleeha &amp; Co.</h2>
              <p style={body}>Oleeha &amp; Co. is the small creative practice of a few lovely people.</p>
              <figure aria-label="The Oleeha & Co. team" style={{ margin: 0 }}>
                <div style={photoFrame}>
                  {TEAM_PHOTO ? (
                    <img src={TEAM_PHOTO} alt="The Oleeha & Co. team" loading="lazy" decoding="async" style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }} />
                  ) : (
                    <div aria-hidden="true" style={{ width: "100%", aspectRatio: "4 / 3", backgroundColor: COLORS.panelMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>Team photo, soon.</span>
                    </div>
                  )}
                </div>
                <figcaption style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0, marginTop: SPACE[3] }}>Felix, Alyssa &amp; Makenzie — Oleeha &amp; Co.</figcaption>
              </figure>
            </section>
          </ScrollReveal>

          <ScrollReveal index={5}>
            <footer style={{ ...stack, gap: SPACE[12], paddingTop: SPACE[8], alignItems: "center", textAlign: "center" }}>
              <div style={{ ...stack, gap: SPACE[3], alignItems: "center" }}>
                <p style={{ ...textStyle("hero", mobile), color: COLORS.ink, fontStyle: "italic", margin: 0, letterSpacing: 0 }}>
                  Here&rsquo;s to more joy
                  <br />
                  and less everything else,
                </p>
                <FelixSignature style={{ height: mobile ? 76 : 104, marginTop: SPACE[2], color: COLORS.ink }} />
                <p style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>Felix · Designer &amp; game builder, Oleeha &amp; Co</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: SPACE[5], flexWrap: "wrap" }}>
                <Link to={umbrella ? "/daily" : "/"} style={{ textDecoration: "none", display: "inline-flex" }}>
                  <AppButton roleStyle="primary" size="md">Play Whoop! Whoop! <ArrowUpRight size={18} aria-hidden="true" /></AppButton>
                </Link>
              </div>
            </footer>
          </ScrollReveal>
          <DailyLegalFooter />
        </article>
      </DailyFrame>
    </>
  );
};

export default SupportPage;
