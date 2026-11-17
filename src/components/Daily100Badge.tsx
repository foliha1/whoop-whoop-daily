import React from "react";
import { RAW } from "@/lib/tokens";

/**
 * The "100 Days of Daily" keepsake: a holographic foil medallion. Fixed brand
 * art (does not follow the theme or the skin), drawn as inline SVG so it needs
 * no asset. Words are solid warm black for legibility.
 */
const Daily100Badge: React.FC<{ size: number; fluid?: boolean }> = ({ size, fluid = false }) => {
  const id = React.useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 120 120"
      width={fluid ? "100%" : size}
      height={fluid ? "100%" : size}
      role="img"
      aria-label="100 Days of Daily badge"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={`foil-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF9AD5" />
          <stop offset="0.22" stopColor="#FFE59A" />
          <stop offset="0.44" stopColor="#A8FFD8" />
          <stop offset="0.66" stopColor="#8FD8FF" />
          <stop offset="0.86" stopColor="#C6A4FF" />
          <stop offset="1" stopColor="#FF9AD5" />
        </linearGradient>
        <linearGradient id={`gloss-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="0.48" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <pattern id={`lines-${id}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
          <rect width="1.2" height="5" fill="#ffffff" opacity="0.35" />
        </pattern>
      </defs>
      {/* scalloped foil seal */}
      <g>
        {Array.from({ length: 16 }, (_, i) => (
          <circle
            key={i}
            cx={60 + 48 * Math.cos((i * Math.PI) / 8)}
            cy={60 + 48 * Math.sin((i * Math.PI) / 8)}
            r="11"
            fill={`url(#foil-${id})`}
          />
        ))}
        <circle cx="60" cy="60" r="50" fill={`url(#foil-${id})`} />
        <circle cx="60" cy="60" r="50" fill={`url(#lines-${id})`} />
        <circle cx="60" cy="60" r="38" fill={RAW.cream} stroke={RAW.warmBlack} strokeWidth="2.5" />
        <circle cx="60" cy="60" r="50" fill={`url(#gloss-${id})`} />
      </g>
      <text
        x="60" y="66" textAnchor="middle"
        fontFamily="Friend, Georgia, serif" fontSize="34" letterSpacing="-1"
        fill={RAW.warmBlack}
      >100</text>
      <text
        x="60" y="84" textAnchor="middle"
        fontFamily="Geist, system-ui, sans-serif" fontWeight="600" fontSize="6.6" letterSpacing="0.6"
        fill={RAW.warmBlack}
      >DAYS OF DAILY</text>
      {/* sparkle */}
      <path d="M95 18 C96 24 98 26 104 27 C98 28 96 30 95 36 C94 30 92 28 86 27 C92 26 94 24 95 18Z" fill="#ffffff" stroke={RAW.warmBlack} strokeWidth="1.2" />
    </svg>
  );
};

export default Daily100Badge;
