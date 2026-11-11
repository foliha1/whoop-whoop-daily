import React from "react";
import { CARD_BACK_URL, DIE_ART, cardArt } from "@/lib/assetUrls";
import { BORDER, COLORS, RADIUS, RAW, SHADOW, SPACE, textStyle } from "@/lib/tokens";
import { useThemeMode } from "@/lib/nightMode";
import { PhysicalRoundOutcomes, PhysicalWinning } from "@/components/PhysicalRulesEnding";
import { Chapter, ChapterDivider, GAME_COLORS, PullQuote, Steps, Subsection, rulesType } from "@/components/rulesLayout";

// This printed-game rulebook intentionally shows the physical deck, not seasonal art.
const RED_CIRCLE_3 = { id: "3-circle-red", label: "Red Circle 3" };
const BAG_CARDS = [
  { ...RED_CIRCLE_3, rotation: -8 },
  { id: "1-square-blue", label: "Blue Square 1", rotation: 0 },
  { id: "4-star-yellow", label: "Orange Star 4", rotation: 8 },
];
const MATCHES = [
  { rule: "SHAPE", description: "Two cards with the same shape.", example: { id: "1-circle-blue", label: "Blue Circle 1" } },
  { rule: "NUMBER", description: "Two cards with the same number.", example: { id: "3-star-yellow", label: "Orange Star 3" } },
  { rule: "COLOR", description: "Two cards with the same color.", example: { id: "1-square-red", label: "Red Square 1" } },
] as const;

function CardFace({ id, label, style }: { id: string; label: string; style?: React.CSSProperties }) {
  return <img src={cardArt(id)} alt={label} loading="lazy" width={107} height={150} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "107 / 150", objectFit: "contain", ...style }} />;
}

function DieFace({ rule }: { rule: keyof typeof DIE_ART }) {
  return <img src={DIE_ART[rule]} alt={`Match Die: ${rule}`} loading="lazy" width={64} height={64} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "1", objectFit: "contain", boxSizing: "border-box", padding: SPACE[2], background: RAW.cream, border: `2px solid ${RAW.warmBlack}`, borderRadius: RADIUS.md }} />;
}

export default function PhysicalFullRules({ mobile }: { mobile: boolean }) {
  const { theme } = useThemeMode();
  const lift = theme === "light" ? SHADOW.card : undefined;
  const { body, minor, list } = rulesType(mobile);

  return (
    <>
      <Chapter id="full-rules" number={1} title="Get Set Up" mobile={mobile}>
        <div aria-label="Three example cards" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: mobile ? SPACE[4] : SPACE[10], width: "100%", maxWidth: 520, alignSelf: "center", padding: `${SPACE[4]}px ${SPACE[4]}px 0`, boxSizing: "border-box" }}>
          {BAG_CARDS.map(({ rotation, ...card }) => (
            <CardFace key={card.id} {...card} style={{ borderRadius: RADIUS.sm, boxShadow: lift, transform: `rotate(${rotation}deg)${rotation === 0 ? ` translateY(-${SPACE[4]}px)` : ""}` }} />
          ))}
        </div>
        <Subsection id="bag-title" title="What's in the Bag" mobile={mobile} style={{ maxWidth: 804 }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: mobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))", gap: SPACE[6] }}>
            {[
              <><strong>48 cards.</strong>{"\u00a0\n"}Every card has a shape, a number, and a color. No two are the same.</>,
              <><strong>1 Match Die.</strong>{"\u00a0\n"}It has three rules on it, each one twice: SHAPE, NUMBER, COLOR.</>,
              <><strong>2 QR cards.</strong>{"\u00a0\n"}They brought you here. Keep them in the bag for next time.</>,
            ].map((item, i) => (
              <li key={i} style={{ boxSizing: "border-box", minWidth: 0, borderTop: `4px solid ${GAME_COLORS[i]}`, background: COLORS.panel, borderRadius: RADIUS.md, padding: SPACE[8] }}><p style={body}>{item}</p></li>
            ))}
          </ul>
        </Subsection>

        <Subsection id="setup-title" title="Set Up" mobile={mobile}>
          <Steps mobile={mobile} dividers items={[
            <><strong>Shuffle</strong> all 48 cards.</>,
            <><strong>Deal 9 cards face down</strong> in a 3 by 3 grid in the middle of the table.</>,
            <><strong>Put the rest face down</strong> next to the grid. This is the draw pile.</>,
            <><strong>Put the die</strong> where everyone can reach it.</>,
            <><strong>The youngest player rolls first.</strong></>,
          ]} />
          <p style={body}>The spots in the grid don't have numbers. You just point. Your finger knows the way.</p>
        </Subsection>
        <div role="img" aria-label="Nine face-down cards in a 3 by 3 grid, with a draw pile and Match Die beside them" style={{ width: "100%", maxWidth: 560, alignSelf: "center", boxSizing: "border-box", padding: mobile ? SPACE[8] : SPACE[12], borderRadius: RADIUS.md * 2, background: RAW.mocha }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 1fr)", gap: mobile ? SPACE[6] : SPACE[10], alignItems: "center" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: mobile ? SPACE[3] : SPACE[4] }}>
              {Array.from({ length: 9 }, (_, i) => <img key={i} src={CARD_BACK_URL} alt="" loading="lazy" width={180} height={252} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "180 / 252", borderRadius: RADIUS.sm, boxShadow: SHADOW.card }} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: mobile ? SPACE[8] : SPACE[12] }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "180 / 252" }}>
                {[3, 2, 1, 0].map(layer => <img key={layer} src={CARD_BACK_URL} alt="" loading="lazy" width={180} height={252} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: RADIUS.sm, boxShadow: SHADOW.card, transform: `translate(${layer * -2}px, ${layer * -2}px)` }} />)}
              </div>
              {/* The Match Die is about half a card wide (twice a standard die). */}
              <div style={{ width: "50%", transform: "rotate(-8deg)", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.45))" }}><DieFace rule="SHAPE" /></div>
            </div>
          </div>
        </div>
      </Chapter>

      <ChapterDivider mobile={mobile} />

      <Chapter id="round" number={2} title="How a Round Works" mobile={mobile}>
        <Subsection id="roll-title" title="Roll" mobile={mobile}>
          <p style={{ ...body, textAlign: "center" }}>The Roller rolls the die. Whatever lands face up is the rule for the whole round. Say it out loud.</p>
        </Subsection>
        <div aria-label="Matching rules and example pairs" style={{ width: "100%", maxWidth: 720, alignSelf: "center", display: "flex", flexDirection: "column", marginTop: -SPACE[8], boxSizing: "border-box", background: COLORS.panel, borderRadius: RADIUS.md, padding: `0 ${mobile ? SPACE[8] : SPACE[12]}px` }}>
          {MATCHES.map(({ rule, description, example }, i) => (
            <div key={rule} style={{ display: "grid", gridTemplateColumns: mobile ? "80px minmax(0, 1fr)" : "112px minmax(0, 1fr) 160px", columnGap: mobile ? SPACE[6] : SPACE[10], rowGap: SPACE[6], padding: `${mobile ? SPACE[10] : SPACE[12]}px 0`, borderTop: i === 0 ? 0 : BORDER.standard, alignItems: "center" }}>
              <DieFace rule={rule} />
              <div style={{ display: "flex", flexDirection: "column", gap: SPACE[2], minWidth: 0 }}>
                <p style={{ ...textStyle("title", mobile), color: [COLORS.redText, COLORS.blueText, COLORS.orangeStat][i], margin: 0, letterSpacing: 0 }}>{rule}:</p>
                <p style={body}>{description}</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: SPACE[4], width: "100%", maxWidth: mobile ? 180 : 160, ...(mobile ? { gridColumn: "1 / -1", justifySelf: "center" } : {}) }}>
                <CardFace {...RED_CIRCLE_3} style={{ borderRadius: RADIUS.sm, boxShadow: SHADOW.card }} /><CardFace {...example} style={{ borderRadius: RADIUS.sm, boxShadow: SHADOW.card }} />
              </div>
            </div>
          ))}
        </div>
        <Subsection id="flip-title" title="Flip" mobile={mobile}>
          <p style={body}>The Roller goes first. Then play moves to the left.</p>
          <p style={body}>On your turn, <strong>flip two cards, one at a time.</strong> For each one:</p>
          <Steps mobile={mobile} dividers items={["Pick a face-down card.", "Turn it face up so everyone can see.", "Count to three.", "Turn it back face down."]} />
          <p style={body}>Then do it again. Two flips and your turn is done. You can't flip the same card twice in one turn.</p>
          <PullQuote mobile={mobile} color={COLORS.orange}>Someone flipping too fast? Say <strong style={{ fontWeight: "inherit" }}>"slow down"</strong> and they have to show it again.</PullQuote>
        </Subsection>
        <Subsection id="call-title" title="WHOOP! WHOOP!" mobile={mobile}>
          <p style={body}>You can call at any moment. On your turn, on someone else's turn, mid-flip. There is no wrong time.</p>
          <Steps mobile={mobile} dividers items={[
            <><strong>Shout "WHOOP! WHOOP!"</strong> Everyone freezes.</>,
            <><strong>Touch two cards, one at a time.</strong> When your finger lands on the second card, you're locked in. No switching.</>,
            <><strong>Flip both cards</strong> to check.</>,
          ]} />
          <p style={body}>Calling never costs you a flip. If you had flips left, you still have them.</p>
        </Subsection>
        <PhysicalRoundOutcomes mobile={mobile} />
      </Chapter>

      <ChapterDivider mobile={mobile} />

      <Chapter id="winning" number={3} title="Winning" mobile={mobile}>
        <PhysicalWinning mobile={mobile} />
      </Chapter>
    </>
  );
}
