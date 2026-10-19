import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cardArt } from "@/lib/assetUrls";
import { useUmbrella } from "@/lib/launch";
import { useIsMobile } from "@/hooks/use-mobile";
import { COLORS, SPACE, RADIUS, textStyle } from "@/lib/tokens";
import DailyFrame from "@/components/DailyFrame";
import HomeControl from "@/components/HomeControl";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import MotionReveal from "@/components/MotionReveal";
import { AppButton } from "@/components/ui/AppButton";
import { LEGAL_CONTACT } from "@/components/LegalPage";

const ART = [
  { name: "2-circle-blue", alt: "Two blue circles", rotation: "-9deg" },
  { name: "3-triangle-orange", alt: "Three orange triangles", rotation: "3deg" },
  { name: "4-circle-red", alt: "Four red circles", rotation: "10deg" },
];

const SupportPage: React.FC = () => {
  const umbrella = useUmbrella();
  const mobile = useIsMobile();
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
          <MotionReveal index={0}>
            <header style={{ ...stack, gap: SPACE[12] }}>
              <p style={{ ...textStyle("subhead", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 }}>WHOOP! WHOOP!</p>
              <h1 style={{ ...textStyle("resultHero", mobile), fontSize: mobile ? textStyle("hero").fontSize : textStyle("resultHero", true).fontSize, lineHeight: 1.1, color: COLORS.ink, margin: 0, letterSpacing: 0 }}>
                Designing games<br />
                <em style={{ color: COLORS.red }}>by accident.</em>
              </h1>
              <p style={{ ...body, color: COLORS.inkMuted }}>A little about the person behind the cards.</p>
            </header>
          </MotionReveal>

          <MotionReveal index={1}>
            <section aria-label="My story" style={stack}>
              <p style={body}>Hi, I’m Felix. A graphic designer, and now, somewhat accidentally, an indie game builder.</p>
              <p style={body}>My work has lived in brand identities, layouts, and visual systems. But I wanted to see what happened beyond the logo. Less designing how something looks. More building a world people can step into.</p>
              <p style={body}>WHOOP! WHOOP! is my way of following that curiosity. Colors, numbers, shapes — familiar design ingredients, turned into something you can play with.</p>
              <p style={body}>It turns out a few simple cards can make people surprisingly competitive. Myself included.</p>
            </section>
          </MotionReveal>

          <MotionReveal index={2}>
            <figure aria-label="WHOOP! WHOOP! card designs" style={{ margin: 0, padding: `${SPACE[12]}px ${SPACE[6]}px`, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: SPACE[6], alignItems: "center" }}>
              {ART.map((card) => (
                <img key={card.name} src={cardArt(card.name)} alt={card.alt} loading="lazy" decoding="async" style={{ display: "block", width: "100%", aspectRatio: "5 / 7", objectFit: "contain", borderRadius: RADIUS.md, transform: `rotate(${card.rotation})` }} />
              ))}
            </figure>
          </MotionReveal>

          <MotionReveal index={3}>
            <section style={stack} aria-labelledby="real-table-title">
              <h2 id="real-table-title" style={{ ...textStyle("hero", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 }}>Made for a real table, too.</h2>
              <p style={body}>You can play here in your browser, but the idea reaches beyond the screen: real cards, rolling dice, and a table full of people shouting over each other.</p>
              <p style={body}>A physical edition is part of that world. More on that when it’s ready. For now, I’m glad you’re here, playing along.</p>
            </section>
          </MotionReveal>

          <MotionReveal index={4}>
            <footer style={{ ...stack, gap: SPACE[12], paddingTop: SPACE[8], borderTop: `1px solid ${COLORS.panelMuted}` }}>
              <div style={{ ...stack, gap: SPACE[3] }}>
                <p style={{ ...textStyle("hero", mobile), color: COLORS.ink, fontStyle: "italic", margin: 0, letterSpacing: 0 }}>Felix Oliha</p>
                <p style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>Designer &amp; game builder · Oleeha &amp; Co</p>
              </div>
              <a href={`mailto:${LEGAL_CONTACT}`} style={{ ...body, color: COLORS.blue, alignSelf: "flex-start", overflowWrap: "anywhere", textUnderlineOffset: 4 }}>Say hello <ArrowUpRight size={16} aria-hidden="true" style={{ verticalAlign: "middle" }} /></a>
              <Link to={umbrella ? "/daily" : "/"} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
                <AppButton roleStyle="primary" size="md">Play Now <ArrowUpRight size={18} aria-hidden="true" /></AppButton>
              </Link>
            </footer>
          </MotionReveal>
          <DailyLegalFooter />
        </article>
      </DailyFrame>
    </>
  );
};

export default SupportPage;
