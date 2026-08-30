// ============================================================================
// GridSizeOption — the single grid-size picker panel used by both the
// multiplayer lobby and the solo setup screen. Carries `ww-grid-option` and
// `data-selected` so it picks up the shared select/deselect transitions.
// ============================================================================

import React from "react";
import { BORDER, RADIUS, SHADOW, SPACE } from "@/lib/tokens";

export type GridSizeKey = "3x2" | "3x3";

export const GRID_OPTIONS: Array<{
  key: GridSizeKey;
  label: string;
  cols: number;
  rows: number;
}> = [
  { key: "3x2", label: "6 cards", cols: 3, rows: 2 },
  { key: "3x3", label: "9 cards", cols: 3, rows: 3 },
];

const MINI_W = 47.25;
const MINI_H = 66.15;
const MINI_GAP = SPACE[2];

const renderGridMini = (cols: number, rows: number, scale: number) => {
  const w = MINI_W * scale;
  const gap = Math.max(2, MINI_GAP * scale);
  return (
  <div
    aria-hidden="true"
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, minmax(0, ${w}px))`,
      gap,
      justifyContent: "center",
      width: "100%",
      maxWidth: cols * w + (cols - 1) * gap,
    }}
  >
    {Array.from({ length: cols * rows }).map((_, i) => (
      <img
        key={i}
        src="/cards/card-back.svg"
        alt=""
        draggable={false}
        style={{
          width: "100%",
          aspectRatio: `${MINI_W} / ${MINI_H}`,
          display: "block",
          borderRadius: RADIUS.sm / 2,
          filter: `drop-shadow(${SHADOW.cardMini})`,
        }}
      />
    ))}
  </div>
  );
};

interface GridSizeOptionProps {
  option: { key: GridSizeKey; label: string; cols: number; rows: number };
  selected: boolean;
  interactive?: boolean;
  /** Shrinks the card minis and the panel padding on short viewports. */
  scale?: number;
  onSelect: (key: GridSizeKey) => void;
}

const GridSizeOption: React.FC<GridSizeOptionProps> = ({
  option,
  selected,
  interactive = true,
  scale = 1,
  onSelect,
}) => (
  <button
    type="button"
    data-selected={selected}
    onClick={() => {
      if (!interactive) return;
      onSelect(option.key);
    }}
    aria-pressed={selected}
    aria-label={`${option.label} grid`}
    disabled={!interactive}
    className="ww-grid-option"
    style={{
      flex: "1 1 0",
      minWidth: 0,
      border: BORDER.heavy,
      borderRadius: RADIUS.sm,
      boxSizing: "border-box",
      padding: Math.max(SPACE[2], SPACE[6] * scale),
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: Math.max(SPACE[2], SPACE[4] * scale),
      cursor: interactive ? "pointer" : "default",
    }}
  >
    {renderGridMini(option.cols, option.rows, scale)}
  </button>
);

export default GridSizeOption;
