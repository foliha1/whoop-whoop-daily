// ============================================================================
// MaterialIcon — official Google Material Symbols, inlined as paths.
//
// Paths are the 24px-grid Material Symbols Outlined artwork, rendered with
// `currentColor` so each icon follows its button's theme-aware ink. Inlined
// rather than font-loaded: no network fetch, no layout shift, tree-shakeable.
// ============================================================================

import React from "react";

// Source: google/material-design-icons, symbols/web/<name>/materialsymbolsoutlined.
const PATHS = {
  leaderboard:
    "M160-200h160v-320H160v320Zm240 0h160v-560H400v560Zm240 0h160v-240H640v240ZM80-120v-480h240v-240h320v320h240v400H80Z",
  group:
    "M40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm720 0v-120q0-44-24.5-84.5T666-434q51 6 96 20.5t84 35.5q36 20 55 44.5t19 53.5v120H760ZM360-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm400-160q0 66-47 113t-113 47q-11 0-28-2.5t-28-5.5q27-32 41.5-71t14.5-81q0-42-14.5-81T544-792q14-5 28-6.5t28-1.5q66 0 113 47t47 113ZM120-240h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T440-640q0-33-23.5-56.5T360-720q-33 0-56.5 23.5T280-640q0 33 23.5 56.5T360-560Zm0 320Zm0-400Z",
} as const;

export type MaterialIconName = keyof typeof PATHS;

const MaterialIcon: React.FC<{
  name: MaterialIconName;
  /** Rendered square size in px; matches the app's 16px chip-icon scale. */
  size?: number;
}> = ({ name, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 -960 960 960"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    style={{ flex: "0 0 auto" }}
  >
    <path d={PATHS[name]} />
  </svg>
);

export default MaterialIcon;
