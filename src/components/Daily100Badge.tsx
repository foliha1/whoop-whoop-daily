import React from "react";
import { RAW } from "@/lib/tokens";

/**
 * The "100 Days of Daily" keepsake. Same build as the tier badges
 * (src/assets/badges): 420 box filled edge to edge, heavy warm-black ring and
 * outlines. Every fill is holographic foil: bright foil rays over a pearl
 * foil field, a bright foil ring, and a pastel foil centre so "100" (Friend,
 * solid warm black) stays easy to read. Fixed art: ignores theme and skin.
 */
const RAYS = 16;

function wedge(i: number): string {
  const step = (2 * Math.PI) / RAYS;
  const a0 = i * step - Math.PI / 2 - step / 2;
  const a1 = a0 + step;
  const r = 230;
  const p = (a: number) => `${(210 + r * Math.cos(a)).toFixed(2)} ${(210 + r * Math.sin(a)).toFixed(2)}`;
  return `M210 210 L${p(a0)} L${p(a1)} Z`;
}

type Stop = [number, string];
const PASTEL: Stop[] = [[0, "#FFB8E2"], [0.25, "#FFF0B8"], [0.5, "#C2FFE6"], [0.75, "#B0E4FF"], [1, "#DCC6FF"]];
const BRIGHT: Stop[] = [[0, "#FF5FB0"], [0.25, "#FFC94A"], [0.5, "#4FE3B0"], [0.75, "#3FB5FF"], [1, "#9B6BFF"]];
const PEARL: Stop[] = [[0, "#FFF0F7"], [0.3, "#FFFBE8"], [0.55, "#EFFFF8"], [0.8, "#EEF6FF"], [1, "#F5EEFF"]];

const Foil: React.FC<{ id: string; stops: Stop[]; flip?: boolean }> = ({ id, stops, flip }) => (
  <linearGradient id={id} x1={flip ? "1" : "0"} y1="0" x2={flip ? "0" : "1"} y2="1">
    {stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
  </linearGradient>
);

const Daily100Badge: React.FC<{ size: number; fluid?: boolean }> = ({ size, fluid = false }) => {
  const id = React.useId().replace(/:/g, "");
  const field = `field-${id}`;
  const rays = `rays-${id}`;
  const ring = `ring-${id}`;
  const pearl = `pearl-${id}`;
  return (
    <svg
      className="ww-ui-small-in"
      viewBox="0 0 420 420"
      width={size}
      height={size}
      role="img"
      aria-label="100 Days of Daily badge"
      style={{ display: "block", flex: "0 0 auto", ...(fluid ? { width: "100%", height: "auto" } : null) }}
    >
      <defs>
        <Foil id={field} stops={PEARL} />
        <Foil id={rays} stops={BRIGHT} />
        <Foil id={ring} stops={BRIGHT} flip />
        <Foil id={pearl} stops={PASTEL} flip />
        <pattern id={`lines-${id}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
          <rect width="2.5" height="10" fill="#ffffff" opacity="0.35" />
        </pattern>
        <clipPath id={`disc-${id}`}>
          <circle cx="210" cy="210" r="194" />
        </clipPath>
      </defs>

      {/* pale foil field with bright foil rays */}
      <g clipPath={`url(#disc-${id})`}>
        <rect width="420" height="420" fill={`url(#${field})`} />
        {Array.from({ length: RAYS }, (_, i) =>
          i % 2 === 0 ? <path key={i} d={wedge(i)} fill={`url(#${rays})`} /> : null,
        )}
        <rect width="420" height="420" fill={`url(#lines-${id})`} />
      </g>

      {/* heavy outer ring, like the tier badges (outer edge meets the box) */}
      <circle cx="210" cy="210" r="202" fill="none" stroke={RAW.warmBlack} strokeWidth="16" />

      {/* bright foil ring */}
      <circle cx="210" cy="210" r="150" fill={`url(#${ring})`} stroke={RAW.warmBlack} strokeWidth="16" />

      {/* pearl foil centre, 100 in Friend, solid */}
      <circle cx="210" cy="210" r="124" fill={`url(#${pearl})`} stroke={RAW.warmBlack} strokeWidth="16" />
      <text
        x="210"
        y="210"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Friend, Georgia, serif"
        fontSize="142"
        letterSpacing="-6"
        fill={RAW.warmBlack}
      >
        100
      </text>
    </svg>
  );
};

export default Daily100Badge;
