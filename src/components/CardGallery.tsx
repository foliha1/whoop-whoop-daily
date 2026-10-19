// About-page Easter egg: a browsable gallery of the full 48-card deck.
// Opened by tapping the card fan; filters only narrow what is shown.
import React, { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ALL_CARDS, COLOR_NAMES, NUMBERS, SHAPES, type ColorName, type Number as CardNumber, type Shape } from "@/cardData";
import { COLORS, RADIUS, SPACE, panelStyle, textStyle } from "@/lib/tokens";

const SHAPE_LABEL: Record<Shape, string> = { circle: "Circle", square: "Square", tri: "Triangle", star: "Star" };
const COLOR_LABEL: Record<ColorName, string> = { red: "Red", blue: "Blue", yellow: "Yellow" };

export function filterCards(shape: Shape | null, number: CardNumber | null, color: ColorName | null) {
  return ALL_CARDS.filter((c) => (!shape || c.shape === shape) && (!number || c.number === number) && (!color || c.color === color));
}

function Chips<T extends string | number>({ label, options, value, onChange, name, mobile }: { label: string; options: T[]; value: T | null; onChange: (v: T | null) => void; name: (v: T) => string; mobile: boolean }) {
  const chip = (active: boolean): React.CSSProperties => ({
    ...textStyle("caption", mobile), font: undefined, fontFamily: "inherit", cursor: "pointer",
    padding: `${SPACE[2]}px ${SPACE[5]}px`, minHeight: 36, borderRadius: 999,
    border: `1.5px solid ${COLORS.ink}`, background: active ? COLORS.ink : "transparent", color: active ? COLORS.surface : COLORS.ink,
  });
  return (
    <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: SPACE[2], alignItems: "center" }}>
      <span style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, minWidth: 56 }}>{label}</span>
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} style={chip(value === null)}>All</button>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(value === o ? null : o)} style={chip(value === o)}>{name(o)}</button>
      ))}
    </div>
  );
}

export default function CardGallery({ mobile, trigger }: { mobile: boolean; trigger: React.ReactNode }) {
  const [shape, setShape] = useState<Shape | null>(null);
  const [number, setNumber] = useState<CardNumber | null>(null);
  const [color, setColor] = useState<ColorName | null>(null);
  const cards = useMemo(() => filterCards(shape, number, color), [shape, number, color]);

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(35, 31, 32, 0.6)", zIndex: 1000 }} />
        <Dialog.Content data-testid="card-gallery" style={{ ...panelStyle("surface", 8), position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: `calc(100% - ${SPACE[8]}px)`, maxWidth: 720, maxHeight: "calc(var(--ww-vh, 100vh) - 32px)", zIndex: 1001, display: "flex", flexDirection: "column", gap: SPACE[6] }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE[4] }}>
            <Dialog.Title style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>The whole deck</Dialog.Title>
            <Dialog.Close aria-label="Close the card gallery" style={{ width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: 0, color: COLORS.ink, cursor: "pointer" }}>
              <X size={22} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>
            You found it. All 48 cards — showing {cards.length}.
          </Dialog.Description>
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE[3] }}>
            <Chips<Shape> label="Shape" options={SHAPES} value={shape} onChange={setShape} name={(s) => SHAPE_LABEL[s]} mobile={mobile} />
            <Chips<CardNumber> label="Number" options={NUMBERS} value={number} onChange={setNumber} name={(n) => String(n)} mobile={mobile} />
            <Chips<ColorName> label="Color" options={COLOR_NAMES} value={color} onChange={setColor} name={(c) => COLOR_LABEL[c]} mobile={mobile} />
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: SPACE[2], overflowY: "auto", display: "grid", gridTemplateColumns: `repeat(${mobile ? 4 : 6}, minmax(0, 1fr))`, gap: SPACE[4] }}>
            {cards.map((c) => (
              <li key={c.id}>
                <img src={c.svgPath} alt={`${c.number} ${COLOR_LABEL[c.color].toLowerCase()} ${SHAPE_LABEL[c.shape].toLowerCase()}${c.number > 1 ? "s" : ""}`} loading="lazy" decoding="async" style={{ display: "block", width: "100%", aspectRatio: "5 / 7", objectFit: "contain", borderRadius: RADIUS.sm ?? RADIUS.md }} />
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
