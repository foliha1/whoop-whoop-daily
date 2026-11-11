import React from "react";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { BORDER, COLORS, RADIUS, SPACE, buttonStyle, textStyle } from "@/lib/tokens";

const STICKY = [
  ["Two people call at the same time for different pairs?", "Check them in the order you heard them. Both can score."],
  ["Two people call at the same time for the same pair?", "First voice wins. Truly can't tell? It goes to the player whose turn it is, or just was."],
  ["Can't tell which cards someone means?", "Anyone can ask them to touch the cards. If they won't, the call doesn't count. No penalty."],
  ["Touched one card and having second thoughts?", "Nothing locks until the second touch. You can back out. You just can't flip anything."],
  ["Made a wrong call with no cards in your pile?", "You don't give anything back. The face-up cards, the lockout, and the used call are your whole penalty."],
  ["Used both your calls this round?", "You can't call again until the round ends. You still flip and keep your place. Your calls come back with the new rule."],
  ["Someone flipped too fast?", 'Anyone can say "slow down" and ask to see it again.'],
  ["Forgot what a card was?", "Tough. Remembering is the game."],
  ["No match on the table this round?", "That's fine. Everyone takes a turn, the die passes, and a new rule shows up."],
  ["Not enough cards left to refill the grid?", "Fill what you can. The grid gets smaller."],
  ["Draw pile ran out before anyone hit 12?", "Keep playing on the smaller grid. Wrong calls put cards back, so it almost never runs dry."],
  ["Only one face-down card left on your turn?", "Flip it and pass."],
  ["You're locked out of every card?", "Your turn passes."],
] as const;

function styles(mobile: boolean) {
  const body: React.CSSProperties = { ...textStyle("body", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const heading: React.CSSProperties = { ...textStyle("title", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const subhead: React.CSSProperties = { ...textStyle("subhead", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const flow: React.CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE[6], minWidth: 0 };
  const panel: React.CSSProperties = { ...flow, boxSizing: "border-box", width: "100%", border: BORDER.heavy, borderRadius: RADIUS.md, background: COLORS.surface, padding: mobile ? SPACE[6] : SPACE[8], gap: SPACE[8] };
  const list: React.CSSProperties = { ...body, paddingLeft: SPACE[6], display: "flex", flexDirection: "column", gap: SPACE[4], listStyleType: "disc" };
  return { body, heading, subhead, flow, panel, list };
}

export function PhysicalRoundOutcomes({ mobile }: { mobile: boolean }) {
  const { body, heading, subhead, flow, panel, list } = styles(mobile);
  return (
    <>
      <section aria-labelledby="outcomes-title" style={{ ...flow, gap: SPACE[8] }}>
        <h2 id="outcomes-title" style={heading}>Right or Wrong</h2>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: SPACE[6], alignItems: "start" }}>
          <section aria-labelledby="right-title" style={panel}>
            <h3 id="right-title" style={subhead}>You're right</h3>
            <ul style={list}>
              <li>Take both cards. They're yours.</li>
              <li>Fill the two empty spots from the draw pile, face down.</li>
              <li>The round ends. <strong>You roll next.</strong></li>
            </ul>
          </section>
          <section aria-labelledby="wrong-title" style={panel}>
            <h3 id="wrong-title" style={subhead}>You're wrong</h3>
            <ul style={list}>
              <li><strong>Put one card back.</strong> Take one from your pile and put it in the draw pile. No cards yet? Nothing to give back.</li>
              <li><strong>Leave both cards face up.</strong> Everyone can see them for the rest of the round.</li>
              <li><strong>Those two cards are off limits to you</strong> this round. Anyone else can still claim them.</li>
              <li><strong>You've used one of your two calls.</strong> Everyone gets two wrong calls a round. Miss twice and you can't call again until the next round. You still take your flips.</li>
            </ul>
          </section>
        </div>
        <p style={body}>The round keeps going.</p>
        <p style={body}>A wrong call helps everyone else. Call late, not early.</p>
      </section>
      <section aria-labelledby="round-end-title" style={panel}>
        <h2 id="round-end-title" style={heading}>When the Round Ends</h2>
        <p style={body}>A round ends one of two ways:</p>
        <ol style={{ ...list, listStyleType: "decimal" }}>
          <li><strong>Someone makes a right call.</strong> They roll the next rule.</li>
          <li><strong>Everyone has taken their turn and nobody got it.</strong> The die passes to the left.</li>
        </ol>
        <p style={body}>Then flip any face-up cards back down, forget who's locked out, and roll a new rule.</p>
        <p style={body}>The cards didn't move. But what matters about them just changed. That's the whole game.</p>
      </section>
      <section aria-labelledby="win-title" style={panel}>
        <h2 id="win-title" style={heading}>How to Win</h2>
        <p style={body}><strong>First to 12 cards wins.</strong> The game ends right then.</p>
        <p style={body}>Every card in your pile counts as one. That's six right calls. Keep your pile where everyone can see it, so everyone knows who's close.</p>
      </section>
      <section aria-labelledby="harder-title" style={panel}>
        <h2 id="harder-title" style={heading}>Make It Harder</h2>
        <p style={body}>Deal <strong>12 cards in a 4 by 3 grid</strong> instead of 9. Nothing else changes.</p>
        <p style={body}>More spots to remember. More matches hiding. Great for tables that have played a lot.</p>
        <p style={body}>It also evens things out. Playing kids against grown-ups, or casual players against the family shark? Go 4 by 3. When nobody can remember everything, luck gets a louder voice.</p>
      </section>
    </>
  );
}

export function PhysicalRulesClosing({ mobile }: { mobile: boolean }) {
  const { body, heading, flow, panel, list } = styles(mobile);
  return (
    <>
      <section id="sticky" aria-labelledby="sticky-title" style={{ ...flow, gap: SPACE[8], scrollMarginTop: SPACE[12] }}>
        <h2 id="sticky-title" style={heading}>Sticky Situations</h2>
        <Accordion type="multiple" style={{ ...panel, display: "block" }}>
          {STICKY.map(([question, answer], index) => (
            <AccordionItem key={question} value={`sticky-${index}`} style={{ borderBottom: index === STICKY.length - 1 ? 0 : BORDER.standard }}>
              <AccordionTrigger className="text-left gap-4" style={{ ...body, minHeight: 44, paddingTop: SPACE[5], paddingBottom: SPACE[5] }}>{question}</AccordionTrigger>
              <AccordionContent style={body}><p style={body}>{answer}</p></AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
      <section aria-labelledby="tips-title" style={panel}>
        <h2 id="tips-title" style={heading}>Tips from the Table</h2>
        <ul style={list}>
          <li><strong>What you saw still counts.</strong> A red circle in the corner is still a red circle when the rule switches to color. Don't start over. Re-sort what you know.</li>
          <li><strong>Flip two in a row on purpose.</strong> Two cards seen back to back are easy to compare.</li>
          <li><strong>The Roller knows the least.</strong> They flip first, with the least info. Winning the die is good. It's not a free pass.</li>
          <li><strong>Don't guess early.</strong> A wrong call shows everyone two cards and costs you one.</li>
        </ul>
      </section>
      <section aria-labelledby="online-title" style={{ ...flow, gap: SPACE[8] }}>
        <h2 id="online-title" style={heading}>Keep Playing Online</h2>
        <p style={body}>No deck handy? Play WHOOP! WHOOP! on any phone.</p>
        <ul style={list}>
          <li><strong>Daily:</strong> one puzzle a day, the same for everyone.</li>
          <li><strong>Solo:</strong> the full game against FELIX, our bot.</li>
          <li><strong>Together:</strong> the full game with friends, each on their own phone.</li>
        </ul>
        <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: SPACE[4] }}>
          <Button asChild style={buttonStyle("primary", "lg", { mobile })}><Link to="/">Play Now</Link></Button>
          <Button asChild variant="secondary" style={buttonStyle("secondary", "lg", { mobile })}><Link to="/about">Read Our Story</Link></Button>
        </div>
      </section>
    </>
  );
}