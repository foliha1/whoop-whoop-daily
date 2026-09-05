// ============================================================================
// appVersion — the identifier stamped onto stored Classic results.
//
// Results from different rule versions must never be silently averaged
// together, so every recorded game carries the rules version plus the bundle
// id of the build that produced it.
// ============================================================================

/** Bump when the Classic rules change in a way that moves the numbers. */
export const RULES_VERSION = "v6.7";

/** Injected at build time when available; "dev" in the sandbox. */
const BUILD_ID =
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_BUILD_ID as string | undefined)) ||
  "dev";

export const APP_VERSION = `classic-${RULES_VERSION}+${BUILD_ID}`;
