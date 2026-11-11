import React from "react";
import { BORDER, COLORS, RAW, SPACE, TEXT, textStyle } from "@/lib/tokens";

/** Game colours cycled by every numeral and marker on the rulebook. */
export const GAME_COLORS = [RAW.red, RAW.blue, RAW.orange] as const;
/** Narrow reading measure for body copy; visuals may use the full column. */
export const READ_W = 600;

export function rulesType(mobile: boolean) {
  const hero = mobile ? TEXT.resultHero.mobileSize : TEXT.resultHero.size;
  const body: React.CSSProperties = { ...textStyle("body", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const subhead: React.CSSProperties = { ...textStyle("title", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const minor: React.CSSProperties = { ...textStyle("subhead", mobile), color: COLORS.ink, margin: 0, letterSpacing: 0 };
  const read: React.CSSProperties = { width: "100%", maxWidth: READ_W, alignSelf: "center", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: SPACE[6], minWidth: 0 };
  const list: React.CSSProperties = { ...body, margin: 0, paddingLeft: SPACE[6], display: "flex", flexDirection: "column", gap: SPACE[4], listStyleType: "disc" };
  return { hero, body, subhead, minor, read, list };
}

/** Hairline with three game shapes, used between chapters, as on the Daily and About frame. */
export function ChapterDivider({ mobile }: { mobile: boolean }) {
  return (
    <div aria-hidden="true" style={{ width: "100%", padding: `${mobile ? SPACE[20] + SPACE[8] : SPACE[20] * 2}px 0` }}>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE[6], width: "100%", maxWidth: READ_W, margin: "0 auto" }}>
        <span style={{ flex: 1, height: 0, borderTop: `1.5px solid ${COLORS.ink}`, opacity: 0.25 }} />
        <span style={{ display: "flex", gap: SPACE[3] }}>{[0, 1, 2, 3].map((i) => <ShapeMark key={i} index={i} />)}</span>
        <span style={{ flex: 1, height: 0, borderTop: `1.5px solid ${COLORS.ink}`, opacity: 0.25 }} />
      </div>
    </div>
  );
}

export function Chapter({ id, number, title, mobile, children }: { id: string; number: number; title: string; mobile: boolean; children: React.ReactNode }) {
  const { hero } = rulesType(mobile);
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} style={{ width: "100%", display: "flex", flexDirection: "column", gap: mobile ? SPACE[16] : SPACE[20], scrollMarginTop: SPACE[12], minWidth: 0 }}>
      <header style={{ width: "100%", maxWidth: READ_W, alignSelf: "center", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: SPACE[3] }}>
        <span aria-hidden="true" style={{ ...textStyle("title", mobile), fontStyle: "italic", color: GAME_COLORS[(number - 1) % 3] }}>{String(number).padStart(2, "0")}</span>
        <h2 id={titleId} style={{ ...textStyle("resultHero", mobile), fontSize: hero, lineHeight: 1.05, color: COLORS.ink, margin: 0, letterSpacing: 0, overflowWrap: "break-word" }}>{title}</h2>
      </header>
      {children}
    </section>
  );
}

/** Numbered steps with large Friend numerals sitting in the margin. */
export function Steps({ items, mobile, start = 0, dividers = false }: { items: React.ReactNode[]; mobile: boolean; start?: number; dividers?: boolean }) {
  const { body } = rulesType(mobile);
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: dividers ? 0 : SPACE[6] }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "grid", gridTemplateColumns: `${mobile ? 40 : 56}px minmax(0, 1fr)`, columnGap: SPACE[4], alignItems: "center", ...(dividers ? { padding: `${SPACE[5]}px 0`, borderTop: i === 0 ? 0 : BORDER.standard } : {}) }}>
          <span aria-hidden="true" style={{ ...textStyle("hero", mobile), lineHeight: 1, color: GAME_COLORS[(i + start) % 3] }}>{i + 1}</span>
          <p style={body}>{item}</p>
        </li>
      ))}
    </ol>
  );
}

export function PullQuote({ children, color, mobile }: { children: React.ReactNode; color: string; mobile: boolean }) {
  return (
    <p style={{ ...textStyle("title", mobile), fontStyle: "italic", color: COLORS.ink, margin: `${SPACE[4]}px 0`, letterSpacing: 0, borderLeft: `4px solid ${color}`, paddingLeft: mobile ? SPACE[5] : SPACE[6] }}>
      {children}
    </p>
  );
}

export function Subsection({ id, title, mobile, children, style }: { id: string; title: string; mobile: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  const { read, subhead } = rulesType(mobile);
  return (
    <section aria-labelledby={id} style={{ ...read, ...style }}>
      <h3 id={id} style={{ ...subhead, textAlign: "center" }}>{title}</h3>
      {children}
    </section>
  );
}

export function ShapeMark({ index }: { index: number }) {
  const color = GAME_COLORS[index % 3];
  const shapes = [
    <circle key="c" cx="8" cy="8" r="7" fill={color} />,
    <rect key="s" x="1" y="1" width="14" height="14" fill={color} />,
    <polygon key="t" points="8,1 15,15 1,15" fill={color} />,
    <polygon key="r" points="8,0.5 10.2,5.6 15.6,6 11.5,9.6 12.8,15 8,12.1 3.2,15 4.5,9.6 0.4,6 5.8,5.6" fill={color} />,
  ];
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" style={{ display: "block", flexShrink: 0 }}>{shapes[index % 4]}</svg>;
}
