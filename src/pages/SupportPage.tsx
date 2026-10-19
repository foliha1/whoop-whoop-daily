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
  { name: "1-circle-blue", alt: "One blue circle", rotation: "-9deg" },
  { name: "2-square-red", alt: "Two red squares", rotation: "-3deg" },
  { name: "3-tri-yellow", alt: "Three yellow triangles", rotation: "3deg" },
  { name: "4-star-blue", alt: "Four blue stars", rotation: "9deg" },
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
              <h1 style={{ ...textStyle("resultHero", mobile), fontSize: mobile ? textStyle("hero").fontSize : textStyle("resultHero", true).fontSize, lineHeight: 1.1, color: COLORS.ink, margin: 0, letterSpacing: 0 }}>
                Whoop! Whoop! Is a<br />
                <em style={{ color: COLORS.red }}>happy accident.</em>
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
            <figure aria-label="WHOOP! WHOOP! card designs" style={{ margin: 0, padding: `${SPACE[12]}px ${SPACE[6]}px`, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: SPACE[6], alignItems: "center" }}>
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
            <section style={stack} aria-labelledby="team-title">
              <h2 id="team-title" style={{ ...textStyle("hero", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 }}>The people behind Oleeha &amp; Co.</h2>
              <figure aria-label="The Oleeha & Co. team" style={{ margin: 0 }}>
                {/* Drop the team photo here: set TEAM_PHOTO to the imported image path. */}
                {TEAM_PHOTO ? (
                  <img src={TEAM_PHOTO} alt="The Oleeha & Co. team" loading="lazy" decoding="async" style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: RADIUS.md, transform: "rotate(-1deg)" }} />
                ) : (
                  <div aria-hidden="true" style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: RADIUS.md, transform: "rotate(-1deg)", backgroundColor: COLORS.panelMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted }}>Team photo, soon.</span>
                  </div>
                )}
                <figcaption style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0, marginTop: SPACE[3] }}>Felix, Alyssa &amp; Makenzie — Oleeha &amp; Co.</figcaption>
              </figure>
              <ul style={{ ...stack, gap: SPACE[4], listStyle: "none", margin: 0, padding: 0 }}>
                {["Felix Oliha", "Alyssa Oliha", "Makenzie Bramblett"].map((name) => (
                  <li key={name} style={body}>{name}</li>
                ))}
              </ul>
            </section>
          </MotionReveal>

          <MotionReveal index={5}>
            <footer style={{ ...stack, gap: SPACE[12], paddingTop: SPACE[8] }}>
              <div style={{ ...stack, gap: SPACE[3] }}>
                <p style={{ ...textStyle("hero", mobile), color: COLORS.ink, fontStyle: "italic", margin: 0, letterSpacing: 0 }}>Here&rsquo;s to more joy and less everything else,</p>
                <p style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>Felix · Designer &amp; game builder, Oleeha &amp; Co</p>
              </div>
              <a href={`mailto:${LEGAL_CONTACT}`} style={{ ...body, color: COLORS.blue, display: "inline-flex", alignItems: "center", gap: SPACE[3], alignSelf: "flex-start", textUnderlineOffset: 4 }}>Say hello <ArrowUpRight size={16} aria-hidden="true" /></a>
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
