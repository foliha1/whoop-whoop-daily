import React from "react";
import { CARD_BACK_URL, DIE_ART, cardArt } from "@/lib/assetUrls";
import { BORDER, COLORS, RADIUS, RAW, SHADOW, SPACE, textStyle } from "@/lib/tokens";
import { useThemeMode } from "@/lib/nightMode";
import { PhysicalRoundOutcomes, PhysicalWinning } from "@/components/PhysicalRulesEnding";
import { Chapter, ChapterDivider, PullQuote, Steps, Subsection, rulesType } from "@/components/rulesLayout";

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
  return <img src={cardArt(id)} alt={label} loading="lazy" width={100} height={100} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "1", objectFit: "contain", ...style }} />;
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
            <CardFace key={card.id} {...card} style={{ borderRadius: RADIUS.md, boxShadow: lift, transform: `rotate(${rotation}deg)${rotation === 0 ? ` translateY(-${SPACE[4]}px)` : ""}` }} />
          ))}
        </div>
        <Subsection id="bag-title" title="What's in the Bag" mobile={mobile}>
          <ul style={list}>
            <li><strong>48 cards.</strong> Every card has a shape, a number, and a color. No two are the same.</li>
            <li><strong>1 Match Die.</strong> It has three rules on it, each one twice: SHAPE, NUMBER, COLOR.</li>
            <li><strong>2 QR cards.</strong> They brought you here. Keep them in the bag for next time. Two cards means two people can read along.</li>
          </ul>
          <h4 style={{ ...minor, marginTop: SPACE[6] }}>The cards</h4>
          <ul style={{ ...list, listStyle: "none", paddingLeft: 0, gap: SPACE[3] }}>
            <li><strong>Shapes:</strong> circle, square, triangle, star</li>
            <li><strong>Numbers:</strong> 1, 2, 3, 4</li>
            <li><strong>Colors:</strong> red, blue, orange</li>
          </ul>
          <div aria-label="The three Match Die faces" style={{ display: "grid", gridTemplateColumns: "repeat(3, 48px)", gap: SPACE[6] }}>
            {MATCHES.map(({ rule }) => <DieFace key={rule} rule={rule} />)}
          </div>
        </Subsection>

        <Subsection id="setup-title" title="Set Up" mobile={mobile}>
          <Steps mobile={mobile} items={[
            <><strong>Shuffle</strong> all 48 cards.</>,
            <><strong>Deal 9 cards face down</strong> in a 3 by 3 grid in the middle of the table.</>,
            <><strong>Put the rest face down</strong> next to the grid. This is the draw pile.</>,
            <><strong>Put the die</strong> where everyone can reach it.</>,
            <><strong>The youngest player rolls first.</strong></>,
          ]} />
          <p style={body}>The spots in the grid don't have numbers. You just point. Your finger knows the way.</p>
        </Subsection>
        <div role="img" aria-label="Nine face-down cards in a 3 by 3 grid, with a draw pile and Match Die beside them" style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 1fr)", gap: SPACE[8], width: "100%", maxWidth: 440, alignSelf: "center", alignItems: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: SPACE[3] }}>
            {Array.from({ length: 9 }, (_, i) => <img key={i} src={CARD_BACK_URL} alt="" loading="lazy" width={80} height={80} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "1" }} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE[8] }}>
            <div style={{ position: "relative", aspectRatio: "1", marginRight: SPACE[2] }}>
              {[2, 1, 0].map(layer => <img key={layer} src={CARD_BACK_URL} alt="" loading="lazy" width={80} height={80} style={{ position: "absolute", width: "100%", height: "100%", transform: `translate(${layer * SPACE[1]}px, ${layer * SPACE[1]}px)` }} />)}
            </div>
            <DieFace rule="SHAPE" />
          </div>
        </div>
      </Chapter>

      <ChapterDivider mobile={mobile} />

      <Chapter id="round" number={2} title="How a Round Works" mobile={mobile}>
        <p style={{ ...minor, width: "100%", maxWidth: 600, alignSelf: "center", fontStyle: "italic", color: COLORS.inkMuted }}>Every Round: Roll, Flip, WHOOP! WHOOP!</p>
        <Subsection id="roll-title" title="Roll" mobile={mobile}>
          <p style={body}>The Roller rolls the die. Whatever lands face up is the rule for the whole round. Say it out loud.</p>
        </Subsection>
        <div aria-label="Matching rules and example pairs" style={{ width: "100%", maxWidth: 720, alignSelf: "center", display: "flex", flexDirection: "column", marginTop: -SPACE[12] }}>
          {MATCHES.map(({ rule, description, example }, i) => (
            <div key={rule} style={{ display: "grid", gridTemplateColumns: mobile ? "64px minmax(0, 1fr)" : "88px minmax(0, 1fr) 216px", columnGap: mobile ? SPACE[6] : SPACE[10], rowGap: SPACE[6], padding: `${mobile ? SPACE[10] : SPACE[12]}px 0`, borderTop: i === 0 ? 0 : BORDER.standard, alignItems: "center" }}>
              <DieFace rule={rule} />
              <div style={{ display: "flex", flexDirection: "column", gap: SPACE[2], minWidth: 0 }}>
                <p style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 }}>{rule}:</p>
                <p style={body}>{description}</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: SPACE[4], width: "100%", maxWidth: 216, ...(mobile ? { gridColumn: "1 / -1", justifySelf: "center" } : {}) }}>
                <CardFace {...RED_CIRCLE_3} /><CardFace {...example} />
              </div>
            </div>
          ))}
        </div>
        <Subsection id="flip-title" title="Flip" mobile={mobile}>
          <p style={body}>The Roller goes first. Then play moves to the left.</p>
          <p style={body}>On your turn, <strong>flip two cards, one at a time.</strong> For each one:</p>
          <Steps mobile={mobile} items={["Pick a face-down card.", "Turn it face up so everyone can see.", "Count to three.", "Turn it back face down."]} />
          <p style={body}>Then do it again. Two flips and your turn is done. You can't flip the same card twice in one turn.</p>
          <PullQuote mobile={mobile} color={COLORS.orange}>Someone flipping too fast? Say <strong style={{ fontWeight: "inherit" }}>"slow down"</strong> and they have to show it again.</PullQuote>
        </Subsection>
        <Subsection id="call-title" title="WHOOP! WHOOP!" mobile={mobile}>
          <p style={body}>You can call at any moment. On your turn, on someone else's turn, mid-flip. There is no wrong time.</p>
          <Steps mobile={mobile} items={[
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
