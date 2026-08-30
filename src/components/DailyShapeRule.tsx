import React, { useEffect, useRef, useState } from "react";
import { getLocalDateString } from "@/lib/daily";
import { MOTION } from "@/lib/tokens";

/** Natural tile geometry — 15 shapes on a 24px pitch, 19px tall. */
const TILE_W = 360;
const TILE_H = 19;
const PITCH = 24;
const SHAPES_PER_TILE = TILE_W / PITCH; // 15

/**
 * One tile for both themes. Every shape colour is a frozen brand literal
 * (RAW.blue / RAW.red / RAW.orange / RAW.khaki) so no shape can ever dissolve
 * into the ground: khaki reads on cream and on warm black alike.
 */
const PATTERN_URL = "/WhoopWhoop_Daily_Pattern_Seamless.svg";

/**
 * Deterministic per-day shift, in shape cells. Keyed off the same LOCAL
 * calendar date the puzzle uses, so the pattern and the puzzle roll over
 * together at the player's own midnight. Always a whole cell, so the seamless
 * loop is never broken.
 */
const dayCellOffset = (now = new Date()) => {
  const [y, m, d] = getLocalDateString(now).split("-").map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return ((days % SHAPES_PER_TILE) + SHAPES_PER_TILE) % SHAPES_PER_TILE;
};

/**
 * The brand pattern strip that tops and tails the daily screens.
 *
 * The painted band is snapped to an odd whole number of shape cells and
 * centred, so a shape always sits dead-centre and no shape is ever clipped at
 * either edge. Each day the tile slides by a whole number of cells.
 *
 * The tile is theme-agnostic: shape colours are frozen brand literals.
 */
const DailyShapeRule: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () =>
      setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width, height } = box;
  const scale = height > 0 ? height / TILE_H : 1;
  const pitch = PITCH * scale;

  let baseBand: React.CSSProperties = { width: 0 };
  if (width > 0 && pitch > 0) {
    if (width < TILE_W * scale) {
      // Narrow (mobile): scale one whole tile down to fit — nothing to clip.
      baseBand = {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "contain",
      };
    } else {
      let cells = Math.floor(width / pitch);
      if (cells % 2 === 0) cells -= 1; // odd → a shape lands dead-centre
      baseBand = {
        position: "absolute",
        left: "50%",
        top: 0,
        transform: "translateX(-50%)",
        width: cells * pitch,
        height: "100%",
        backgroundRepeat: "repeat-x",
        backgroundSize: `auto 100%`,
        backgroundPosition: `calc(50% + ${dayCellOffset() * pitch}px) center`,
      };
    }
  }

  const layerStyle: React.CSSProperties = {
    ...baseBand,
    backgroundImage: `url(${PATTERN_URL})`,
    transition: `opacity ${MOTION.slow}`,
  };

  return (
    <div
      ref={hostRef}
      className="daily-shape-rule"
      aria-hidden="true"
      style={{ ...style, position: "relative" }}
    >
      <div style={layerStyle} />
    </div>
  );
};

export default DailyShapeRule;
