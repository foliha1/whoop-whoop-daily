import React, { useEffect, useState } from "react";
import { SPACE } from "@/lib/tokens";
import { CHASE, chaseDelay, chaseRestColor, chaseVars, prefersReducedMotion } from "@/lib/chase";
import { LOADER_CHASE_MS, LOADER_SHAPE_CYCLE_MS } from "@/lib/animationTiming";

/**
 * The one loading treatment in the product.
 *
 * A single inline row of the four brand shapes — circle, square, triangle,
 * star. Each cell swaps to the next shape in the cycle, so the row is always
 * four shapes but never the same four in the same order, while the brand
 * colours travel through the row using the same chase mechanic as the Classic
 * result headline (`src/lib/chase.ts`).
 *
 * It has no font and no image dependency by design: the shapes are inline SVG
 * paths and every colour is a frozen brand literal from `RAW`, so it looks the
 * same in both themes and can never wait on the assets it is covering for.
 */

/** Inline shape geometry on a shared 24x24 box. No external art, ever. */
const SHAPES: readonly string[] = [
  // circle
  "M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Z",
  // square
  "M3.5 3.5h17v17h-17Z",
  // triangle
  "M12 2.8 21.6 20.4H2.4Z",
  // star (four-point brand burst)
  "M12 1.6 14.5 9.5 22.4 12 14.5 14.5 12 22.4 9.5 14.5 1.6 12 9.5 9.5Z",
];

const BrandLoader: React.FC<{
  /** Edge of one shape cell, in px. */
  size?: number;
  /** Accessible label announced while the wait lasts. */
  label?: string;
  style?: React.CSSProperties;
}> = ({ size = 20, label = "Loading", style }) => {
  const reduced = prefersReducedMotion();
  const [paused, setPaused] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );

  // An off-screen infinite animation is wasted work; resuming from the same
  // stop keeps both cycles coherent.
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div
      role="status"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: SPACE[2],
        ...chaseVars(LOADER_CHASE_MS),
        ["--ww-shape-dur" as string]: `${LOADER_SHAPE_CYCLE_MS}ms`,
        ...style,
      }}
    >
      {CHASE.map((_, cell) => (
        <span
          key={cell}
          aria-hidden="true"
          // The colour chase: one shared cycle, one stop of offset per cell.
          className={reduced ? undefined : "ww-chase-letter"}
          style={{
            position: "relative",
            display: "block",
            width: size,
            height: size,
            color: chaseRestColor(cell),
            animationDelay: reduced ? undefined : chaseDelay(cell, LOADER_CHASE_MS),
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {SHAPES.map((d, shape) => {
            // Cell n starts on shape n, so all four shapes are on screen at
            // once — that starting frame is also the reduced-motion rest.
            const offset = (shape - cell + SHAPES.length) % SHAPES.length;
            return (
              <svg
                key={shape}
                className="ww-loader-shape"
                data-rest={offset === 0 ? "true" : "false"}
                viewBox="0 0 24 24"
                width={size}
                height={size}
                style={{
                  position: "absolute",
                  inset: 0,
                  animationDelay: `-${(offset * LOADER_SHAPE_CYCLE_MS) / SHAPES.length}ms`,
                  animationPlayState: paused ? "paused" : "running",
                }}
              >
                <path d={d} fill="currentColor" />
              </svg>
            );
          })}
        </span>
      ))}
    </div>
  );
};

export default BrandLoader;
