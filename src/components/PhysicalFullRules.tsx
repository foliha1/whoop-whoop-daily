import React from "react";
import { CARD_BACK_URL, DIE_ART, cardArt } from "@/lib/assetUrls";
import { BORDER, COLORS, RADIUS, SPACE, textStyle } from "@/lib/tokens";

// This printed-game rulebook intentionally shows the physical deck, not seasonal art.
const RED_CIRCLE_3 = { id: "3-circle-red", label: "Red Circle 3" };
const BAG_CARDS = [RED_CIRCLE_3, { id: "1-square-blue", label: "Blue Square 1" }, { id: "4-star-yellow", label: "Orange Star 4" }];
const MATCHES = [
  { rule: "SHAPE", description: "Two cards with the same shape.", example: { id: "1-circle-blue", label: "Blue Circle 1" } },
  { rule: "NUMBER", description: "Two cards with the same number.", example: { id: "3-star-yellow", label: "Orange Star 3" } },
  { rule: "COLOR", description: "Two cards with the same color.", example: { id: "1-square-red", label: "Red Square 1" } },
] as const;

function CardFace({ id, label }: { id: string; label: string }) {
  return <img src={cardArt(id)} alt={label} loading="lazy" width={100} height={100} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "1", objectFit: "contain" }} />;
}

function DieFace({ rule }: { rule: keyof typeof DIE_ART }) {
  return <img src={DIE_ART[rule]} alt={`Match Die: ${rule}`} loading="lazy" width={64} height={64} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "1", objectFit: "contain" }} />;
}

export default function PhysicalFullRules({ mobile }: { mobile: boolean }) {
  const body: React.CSSProperties = { ...textStyle("body", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const heading: React.CSSProperties = { ...textStyle("title", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const subhead: React.CSSProperties = { ...textStyle("subhead", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const flow: React.CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE[6], minWidth: 0 };
  const panel: React.CSSProperties = { ...flow, boxSizing: "border-box", width: "100%", border: BORDER.heavy, borderRadius: RADIUS.md, background: COLORS.surface, padding: mobile ? SPACE[6] : SPACE[8], gap: SPACE[8] };
  const list: React.CSSProperties = { ...body, margin: 0, paddingLeft: SPACE[6], display: "flex", flexDirection: "column", gap: SPACE[4] };

  return (
    <section id="full-rules" aria-label="Full Rules" style={{ ...flow, gap: SPACE[20], scrollMarginTop: SPACE[12] }}>
      <section aria-labelledby="bag-title" style={panel}>
        <h2 id="bag-title" style={heading}>What's in the Bag</h2>
        <ul style={list}>
          <li><strong>48 cards.</strong> Every card has a shape, a number, and a color. No two are the same.</li>
          <li><strong>1 Match Die.</strong> It has three rules on it, each one twice: SHAPE, NUMBER, COLOR.</li>
          <li><strong>2 QR cards.</strong> They brought you here. Keep them in the bag for next time. Two cards means two people can read along.</li>
        </ul>
        <h3 style={subhead}>The cards</h3>
        <ul style={list}>
          <li><strong>Shapes:</strong> circle, square, triangle, star</li>
          <li><strong>Numbers:</strong> 1, 2, 3, 4</li>
          <li><strong>Colors:</strong> red, blue, orange</li>
        </ul>
        <div aria-label="Three example cards" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: SPACE[3], width: "100%", maxWidth: 360, alignSelf: "center" }}>
          {BAG_CARDS.map(card => <CardFace key={card.id} {...card} />)}
        </div>
        <div aria-label="The three Match Die faces" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: SPACE[6], width: "100%", maxWidth: 240, alignSelf: "center" }}>
          {MATCHES.map(({ rule }) => <DieFace key={rule} rule={rule} />)}
        </div>
      </section>

      <section aria-labelledby="setup-title" style={panel}>
        <h2 id="setup-title" style={heading}>Set Up</h2>
        <ol style={list}>
          <li><strong>Shuffle</strong> all 48 cards.</li>
          <li><strong>Deal 9 cards face down</strong> in a 3 by 3 grid in the middle of the table.</li>
          <li><strong>Put the rest face down</strong> next to the grid. This is the draw pile.</li>
          <li><strong>Put the die</strong> where everyone can reach it.</li>
          <li><strong>The youngest player rolls first.</strong></li>
        </ol>
        <p style={body}>The spots in the grid don't have numbers. You just point. Your finger knows the way.</p>
        <div role="img" aria-label="Nine face-down cards in a 3 by 3 grid, with a draw pile and Match Die beside them" style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 1fr)", gap: SPACE[6], width: "100%", maxWidth: 360, alignSelf: "center", alignItems: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: SPACE[2] }}>
            {Array.from({ length: 9 }, (_, i) => <img key={i} src={CARD_BACK_URL} alt="" loading="lazy" width={80} height={80} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "1" }} />)}
          </div>
          <div style={{ ...flow, gap: SPACE[8] }}>
            <div style={{ position: "relative", aspectRatio: "1", marginRight: SPACE[2] }}>
              {[2, 1, 0].map(layer => <img key={layer} src={CARD_BACK_URL} alt="" loading="lazy" width={80} height={80} style={{ position: "absolute", width: "100%", height: "100%", transform: `translate(${layer * SPACE[1]}px, ${layer * SPACE[1]}px)` }} />)}
            </div>
            <DieFace rule="SHAPE" />
          </div>
        </div>
      </section>

      <section aria-labelledby="round-title" style={{ ...flow, gap: SPACE[8] }}>
        <h2 id="round-title" style={heading}>Every Round: Roll, Flip, WHOOP! WHOOP!</h2>
        <section aria-labelledby="roll-title" style={flow}>
          <h3 id="roll-title" style={subhead}>Roll</h3>
          <p style={body}>The Roller rolls the die. Whatever lands face up is the rule for the whole round. Say it out loud.</p>
        </section>
        <div aria-label="Matching rules and example pairs" style={panel}>
          {MATCHES.map(({ rule, description, example }) => (
            <div key={rule} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", columnGap: SPACE[4], rowGap: SPACE[3], paddingTop: SPACE[6], borderTop: BORDER.standard, alignItems: "center" }}>
              <div style={{ maxWidth: 64 }}><DieFace rule={rule} /></div>
              <p style={body}><strong>{rule}:</strong> {description}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: SPACE[3], gridColumn: "1 / -1", width: "100%", maxWidth: 220, justifySelf: "center" }}>
                <CardFace {...RED_CIRCLE_3} /><CardFace {...example} />
              </div>
            </div>
          ))}
        </div>
        <section aria-labelledby="flip-title" style={flow}>
          <h3 id="flip-title" style={subhead}>Flip</h3>
          <p style={body}>The Roller goes first. Then play moves to the left.</p>
          <p style={body}>On your turn, <strong>flip two cards, one at a time.</strong> For each one:</p>
          <ol style={list}>
            <li>Pick a face-down card.</li>
            <li>Turn it face up so everyone can see.</li>
            <li>Count to three.</li>
            <li>Turn it back face down.</li>
          </ol>
          <p style={body}>Then do it again. Two flips and your turn is done. You can't flip the same card twice in one turn.</p>
          <p style={body}>Someone flipping too fast? Say <strong>"slow down"</strong> and they have to show it again.</p>
        </section>
        <section aria-labelledby="call-title" style={flow}>
          <h3 id="call-title" style={subhead}>WHOOP! WHOOP!</h3>
          <p style={body}>You can call at any moment. On your turn, on someone else's turn, mid-flip. There is no wrong time.</p>
          <ol style={list}>
            <li><strong>Shout "WHOOP! WHOOP!"</strong> Everyone freezes.</li>
            <li><strong>Touch two cards, one at a time.</strong> When your finger lands on the second card, you're locked in. No switching.</li>
            <li><strong>Flip both cards</strong> to check.</li>
          </ol>
          <p style={body}>Calling never costs you a flip. If you had flips left, you still have them.</p>
        </section>
      </section>
    </section>
  );
}