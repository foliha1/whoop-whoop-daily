import React from "react";
import { Link } from "react-router-dom";
import { Check, Minus, Plus, TriangleAlert, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { BORDER, COLORS, RADIUS, RAW, SPACE, buttonStyle, textStyle } from "@/lib/tokens";
import { Chapter, ChapterDivider, PullQuote, ShapeMark, Steps, Subsection, rulesType } from "@/components/rulesLayout";

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

const TIPS = [
  ["What you saw still counts.", "A red circle in the corner is still a red circle when the rule switches to color. Don't start over. Re-sort what you know."],
  ["Flip two in a row on purpose.", "Two cards seen back to back are easy to compare."],
  ["The Roller knows the least.", "They flip first, with the least info. Winning the die is good. It's not a free pass."],
  ["Don't guess early.", "A wrong call shows everyone two cards and costs you one."],
] as const;

function Icon({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return <span aria-hidden="true" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 999, background: bg, color: fg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{children}</span>;
}

export function PhysicalRoundOutcomes({ mobile }: { mobile: boolean }) {
  const { body, subhead, minor, list, read } = rulesType(mobile);
  const card: React.CSSProperties = { boxSizing: "border-box", borderRadius: RADIUS.md, padding: mobile ? SPACE[12] : SPACE[16], display: "flex", flexDirection: "column", gap: SPACE[8], minWidth: 0, height: "100%" };
  return (
    <>
      <section aria-labelledby="outcomes-title" style={{ width: "100%", display: "flex", flexDirection: "column", gap: SPACE[8], minWidth: 0 }}>
        <h3 id="outcomes-title" style={{ ...subhead, textAlign: "center", width: "100%", maxWidth: 600, alignSelf: "center" }}>Right or Wrong</h3>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: SPACE[8], alignItems: "stretch" }}>
          <section aria-labelledby="right-title" style={{ ...card, background: `color-mix(in srgb, ${RAW.blue} 14%, transparent)`, border: `2px solid ${RAW.blue}` }}>
            <h4 id="right-title" style={{ ...minor, ...textStyle("title", mobile), color: COLORS.blueText, display: "flex", alignItems: "center", gap: SPACE[4] }}><Icon bg={RAW.blue} fg={COLORS.onBlue}><Check size={22} strokeWidth={3} /></Icon>You're right</h4>
            <ul style={list}>
              <li>Take both cards. They're yours.</li>
              <li>Fill the two empty spots from the draw pile, face down.</li>
              <li>The round ends. <strong>You roll next.</strong></li>
            </ul>
          </section>
          <section aria-labelledby="wrong-title" style={{ ...card, background: `color-mix(in srgb, ${RAW.red} 12%, transparent)`, border: `2px solid ${RAW.red}` }}>
            <h4 id="wrong-title" style={{ ...minor, ...textStyle("title", mobile), color: COLORS.redText, display: "flex", alignItems: "center", gap: SPACE[4] }}><Icon bg={RAW.red} fg={COLORS.onRed}><X size={22} strokeWidth={3} /></Icon>You're wrong</h4>
            <ul style={list}>
              <li><strong>Put one card back.</strong> Take one from your pile and put it in the draw pile. No cards yet? Nothing to give back.</li>
              <li><strong>Leave both cards face up.</strong> Everyone can see them for the rest of the round.</li>
              <li><strong>Those two cards are off limits to you</strong> this round. Anyone else can still claim them.</li>
              <li><strong>You've used one of your two calls.</strong> Everyone gets two wrong calls a round. Miss twice and you can't call again until the next round. You still take your flips.</li>
            </ul>
          </section>
        </div>
        <div style={read}>
          <p style={body}>The round keeps going.</p>
          <PullQuote mobile={mobile} color={COLORS.red}>A wrong call helps everyone else. Call late, not early.</PullQuote>
        </div>
      </section>
      <Subsection id="round-end-title" title="When the Round Ends" mobile={mobile}>
        <p style={body}>A round ends one of two ways:</p>
        <Steps mobile={mobile} dividers items={[
          <><strong>Someone makes a right call.</strong> They roll the next rule.</>,
          <><strong>Everyone has taken their turn and nobody got it.</strong> The die passes to the left.</>,
        ]} />
        <p style={body}>Then flip any face-up cards back down, forget who's locked out, and roll a new rule.</p>
        <p style={body}>The cards didn't move. But what matters about them just changed. That's the whole game.</p>
      </Subsection>
    </>
  );
}

export function PhysicalWinning({ mobile }: { mobile: boolean }) {
  const { hero, body, subhead, read } = rulesType(mobile);
  return (
    <>
      <section aria-labelledby="win-title" style={{ ...read, alignItems: "center", textAlign: "center", gap: SPACE[8] }}>
        <h3 id="win-title" style={{ ...textStyle("label", mobile), color: COLORS.inkMuted, margin: 0 }}>How to Win</h3>
        <p style={{ ...textStyle("resultHero", mobile), fontSize: Math.round(hero * 1.12), lineHeight: 1.02, color: COLORS.ink, margin: 0, letterSpacing: 0 }}>First to 12 cards wins.</p>
        <p style={{ ...body, maxWidth: 440 }}>The game ends right then.</p>
        <p style={{ ...body, maxWidth: 440, color: COLORS.inkMuted }}>Every card in your pile counts as one. That's six right calls. Keep your pile where everyone can see it, so everyone knows who's close.</p>
      </section>
      <section aria-labelledby="harder-title" style={{ ...read, marginTop: SPACE[12], padding: mobile ? SPACE[10] : SPACE[12], borderRadius: RADIUS.md, border: `3px solid ${RAW.red}`, background: `repeating-linear-gradient(-45deg, color-mix(in srgb, ${RAW.red} 10%, transparent) 0 14px, color-mix(in srgb, ${RAW.red} 4%, transparent) 14px 28px)` }}>
        <h3 id="harder-title" style={{ ...subhead, color: COLORS.redText, display: "flex", alignItems: "center", justifyContent: "center", gap: SPACE[4], textTransform: "uppercase" }}><TriangleAlert size={mobile ? 28 : 34} strokeWidth={2.5} aria-hidden="true" />Make It Harder<TriangleAlert size={mobile ? 28 : 34} strokeWidth={2.5} aria-hidden="true" /></h3>
        <p style={body}>Deal <strong>12 cards in a 4 by 3 grid</strong> instead of 9. Nothing else changes.</p>
        <p style={body}>More spots to remember. More matches hiding. Great for tables that have played a lot.</p>
        <p style={body}>It also evens things out. Playing kids against grown-ups, or casual players against the family shark? Go 4 by 3. When nobody can remember everything, luck gets a louder voice.</p>
      </section>
    </>
  );
}

export function PhysicalRulesClosing({ mobile }: { mobile: boolean }) {
  const { body, subhead, minor, read } = rulesType(mobile);
  return (
    <>
      <ChapterDivider mobile={mobile} />
      <Chapter id="sticky" number={4} title="Sticky Situations" mobile={mobile}>
        <Accordion type="multiple" style={{ ...read, display: "block", borderTop: BORDER.standard }}>
          {STICKY.map(([question, answer], index) => (
            <AccordionItem key={question} value={`sticky-${index}`} style={{ borderBottom: BORDER.standard }}>
              <AccordionTrigger className="group text-left gap-4 hover:no-underline [&>svg]:hidden" style={{ ...minor, minHeight: 44, paddingTop: SPACE[8], paddingBottom: SPACE[8] }}>
                {question}
                <span aria-hidden="true" style={{ flexShrink: 0, display: "inline-flex", color: COLORS.ink }}>
                  <Plus size={22} className="group-data-[state=open]:hidden" />
                  <Minus size={22} className="hidden group-data-[state=open]:block" />
                </span>
              </AccordionTrigger>
              <AccordionContent style={{ paddingBottom: SPACE[8] }}><p style={body}>{answer}</p></AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Chapter>

      <ChapterDivider mobile={mobile} />

      <section aria-labelledby="tips-title" style={{ width: "100%", display: "flex", flexDirection: "column", gap: SPACE[16], minWidth: 0 }}>
        <h2 id="tips-title" style={{ ...textStyle("hero", mobile), textAlign: "center", color: COLORS.ink, margin: 0, letterSpacing: 0, width: "100%", maxWidth: 600, alignSelf: "center" }}>Tips from the Table</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: mobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: mobile ? SPACE[12] : `${SPACE[16]}px ${SPACE[20]}px` }}>
          {TIPS.map(([lead, rest], i) => (
            <li key={lead} style={{ display: "flex", flexDirection: "column", gap: SPACE[4], minWidth: 0 }}>
              <ShapeMark index={i} />
              <p style={{ ...subhead, ...textStyle("subhead", mobile) }}><strong style={{ fontWeight: "inherit" }}>{lead}</strong></p>
              <p style={body}>{rest}</p>
            </li>
          ))}
        </ul>
      </section>

      <ChapterDivider mobile={mobile} />

      <section aria-labelledby="online-title" style={{ ...read, alignItems: "center", textAlign: "center", gap: SPACE[10], paddingBottom: SPACE[16] }}>
        <h2 id="online-title" style={{ ...textStyle("hero", mobile), fontStyle: "italic", color: COLORS.ink, margin: 0, letterSpacing: 0 }}>Keep Playing Online</h2>
        <p style={body}>No deck handy? Play WHOOP! WHOOP! on any phone.</p>
        <ul style={{ ...body, listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: SPACE[4] }}>
          <li><strong>Daily:</strong> one puzzle a day, the same for everyone.</li>
          <li><strong>Solo:</strong> the full game against FELIX, our bot.</li>
          <li><strong>Together:</strong> the full game with friends, each on their own phone.</li>
        </ul>
        <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: SPACE[4], justifyContent: "center", width: mobile ? "100%" : "auto" }}>
          <Button asChild style={buttonStyle("primary", "lg", { mobile })}><Link to="/">Play Now</Link></Button>
          <Button asChild variant="secondary" style={buttonStyle("secondary", "lg", { mobile })}><Link to="/about">Read Our Story</Link></Button>
        </div>
      </section>
    </>
  );
}
