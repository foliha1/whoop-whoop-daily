import type { CSSProperties } from "react";

/* ------------------------------------------------------------------ *
 * RAW — the frozen literal palette.
 *
 * These hexes NEVER follow the theme. Use them for anything that must
 * keep its literal colour in both light and night mode:
 *   • the playing cards (faces + backs) and the dice faces
 *   • the match / miss marks on the results screen
 *   • every animation colour (wrong-match wash + ring, success ghost,
 *     shine sweeps)
 *   • the canvas share image, which is a light brand artifact
 *   • anything doing colour maths (canvas, contrast) — `var(...)`
 *     strings can't be parsed.
 * ------------------------------------------------------------------ */
export const RAW = {
  cream: "#F8F2E9",
  creamHover: "#e8e0d4",
  khaki: "#D0C3AF",
  khakiMuted: "#ADA290",
  khakiMutedHover: "#bdb5a4",
  warmBlack: "#231f20",
  warmGrey: "#544c4a",
  red: "#d72229",
  redHover: "#b81b20",
  blue: "#0072B2",
  blueHover: "#005a8f",
  orange: "#E79024",
  orangeHover: "#c47618",
  success: "#59cd90",
  successHover: "#4ab87d",
  offWhite: "#fef9f0",
  soloTint: "#97DAFF",
  peepsTint: "#FFC1C3",
  /** Blue 2 — the pale blue used for the winner's rank on the Classic result. */
  blue2: "#97DAFF",
  /** Mocha — the quiet rank ink inside the khaki standings panel. */
  mocha: "#544C4A",
} as const;


/* ------------------------------------------------------------------ *
 * COLORS — the themed palette.
 *
 * Inline styles are used throughout, so themeable entries point at CSS
 * custom properties rather than hexes: the actual values live in
 * `index.css` under `:root` (light) and `html[data-theme="night"]`
 * (night), which means inline styles follow the theme with no component
 * changes. Brand tones are identical in both themes, so they stay
 * literal.
 * ------------------------------------------------------------------ */
export const COLORS = {
  // UI surface (window/content backgrounds) — themed
  surface: "var(--ww-surface)",
  surfaceHover: "var(--ww-surface-hover)",
  panel: "var(--ww-panel)",
  panelMuted: "var(--ww-panel-muted)",
  panelMutedHover: "var(--ww-panel-muted-hover)",
  // Ink ramp: ink (strong text), inkMuted (secondary/subtle text) — themed
  ink: "var(--ww-ink)",
  inkMuted: "var(--ww-ink-muted)",
  // Brand tones + their hover states — identical in both themes
  red: RAW.red,
  redHover: RAW.redHover,
  blue: RAW.blue,
  blueHover: RAW.blueHover,
  orange: RAW.orange,
  orangeHover: RAW.orangeHover,
  success: RAW.success,
  successHover: RAW.successHover,
  // Theme background (backs the "Off-White" theme swatch — distinct from `surface`, the UI background)
  offWhite: RAW.offWhite,
  // Play-mode accent tints used on the "How do you want to play?" screen.
  soloTint: RAW.soloTint,
  peepsTint: RAW.peepsTint,
} as const;


export const BORDER = {
  standard: `1.5px solid ${COLORS.ink}`,
  heavy: `2px solid ${COLORS.ink}`,
} as const;

export const RADIUS = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

export const SPACE = {
  0: 0,
  1: 2,
  2: 4,
  3: 6,
  4: 8,
  5: 10,
  6: 12,
  7: 14,
  8: 16,
  10: 20,
  12: 24,
  14: 28,
  16: 32,
} as const;

export const SHADOW = {
  windowFocused: "4px 6px 0 rgba(0,0,0,0.3)",
  windowUnfocused: "3px 4px 0 rgba(0,0,0,0.15)",
  /** Playing-card lift (faces + minis). */
  card: "0 6px 14px rgba(0,0,0,0.25)",
  /** Small card mini/tile lift. */
  cardMini: "0 1.81px 1.81px rgba(0,0,0,0.25)",
} as const;

export const MOTION = {
  fast: "150ms ease-out",
  base: "250ms ease-out",
  slow: "400ms ease-in-out",
} as const;

export const THEME_SWATCHES = [
  { color: COLORS.red, label: "Red" },
  { color: COLORS.blue, label: "Blue" },
  { color: COLORS.orange, label: "Orange" },
  { color: COLORS.offWhite, label: "Off-White" },
  { color: "wild", label: "Wild" },
] as const;

export const FONT_FAMILY = '"Friend", Georgia, "Times New Roman", serif';

/** UI/caption stack — Geist. Used for small metadata lines. */
export const FONT_FAMILY_UI = '"Geist", "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Every Geist instance ships at medium weight. */
export const FONT_WEIGHT_UI = 500;

/* ------------------------------------------------------------------ *
 * Type scale — the ONLY place raw font sizes live.
 * Roughly a 1.22 ratio ladder; every role below picks two steps
 * (desktop + mobile) so sizing can never drift ad hoc.
 * ------------------------------------------------------------------ */
export const FONT_SIZE = {
  "3xs": 11,
  "2xs": 12,
  xs: 14,
  sm: 15,
  md: 17,
  lg: 18,
  xl: 21,
  "2xl": 22,
  "2.5xl": 24,
  "3xl": 26,
  "4xl": 28,
  "4.5xl": 32,
  "5xl": 34,
  "5.5xl": 36,
  "6xl": 48,
  "7xl": 72,
} as const;


export type FontSizeStep = keyof typeof FONT_SIZE;

export const FONT_WEIGHT = {
  regular: 400,
  /** Geist UI stack only — every Geist instance renders at medium. */
  medium: 500,
  bold: 700,
  black: 900,
} as const;

export const LINE_HEIGHT = {
  tight: 1.1,
  snug: 1.2,
  heading: 1.25,
  label: 1.3,
  normal: 1.4,
  relaxed: 1.55,
} as const;

type TextRoleDef = {
  step: FontSizeStep;
  mobileStep: FontSizeStep;
  weight: number;
  italic: boolean;
  lineHeight: number;
  /** CSS letter-spacing. Friend has one weight, so tracking carries hierarchy. */
  letterSpacing?: string;
  textTransform?: CSSProperties["textTransform"];
  fontVariantNumeric?: string;
};

/**
 * Role -> scale step mapping. Components reference roles, never raw px.
 * Friend ships Regular + Italic only: every role stays at regular weight and
 * earns its hierarchy from size, tracking and case instead.
 */
export const TEXT_ROLES = {
  caption:       { step: "xs",  mobileStep: "2xs", weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.normal },
  captionItalic: { step: "xs",  mobileStep: "2xs", weight: FONT_WEIGHT.regular, italic: true,  lineHeight: LINE_HEIGHT.normal },
  body:          { step: "md",  mobileStep: "sm",  weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.relaxed },
  label:         { step: "md",  mobileStep: "sm",  weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.label, textTransform: "uppercase", letterSpacing: "0.06em" },
  /** Pill / marker text (e.g. "Played today"). */
  pill:          { step: "md",  mobileStep: "sm",  weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.label },
  /** Small italic chip link ("How to Play"). */
  chip:          { step: "md",  mobileStep: "sm",  weight: FONT_WEIGHT.regular, italic: true,  lineHeight: LINE_HEIGHT.label },
  /** Buttons, inputs, code fields, small tiles. */
  control:       { step: "lg",  mobileStep: "md",  weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.tight },
  subhead:       { step: "xl",  mobileStep: "lg",  weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.heading, letterSpacing: "-0.01em" },
  /** Section titles inside pre-game cards. */
  title:         { step: "3xl", mobileStep: "2xl", weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.heading },
  heading:       { step: "3xl", mobileStep: "2xl", weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.snug, letterSpacing: "-0.015em" },
  /** Screen headlines ("How do you want to play?"). */
  hero:          { step: "5xl", mobileStep: "4xl", weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.snug },
  /** Classic result headline ("Great Game!") — 72/87 with tight tracking. */
  resultHero:    { step: "7xl", mobileStep: "6xl", weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.snug, letterSpacing: "-0.02em" },
  /** Winner standings row (rank / name / score) on the Classic result. */
  resultWinner:  { step: "5.5xl", mobileStep: "5xl", weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.tight },
  /** Remaining standings rows inside the khaki panel. */
  resultRow:     { step: "2.5xl", mobileStep: "2xl", weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.tight },
  /** Classic result buttons (PLAY AGAIN! / INVITE / DONE). */
  resultButton:  { step: "4.5xl", mobileStep: "4xl", weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.tight },
  /** Primary CTA lettering ("Let's Play!", table code). Italic needs descender room. */
  action:        { step: "4xl", mobileStep: "3xl", weight: FONT_WEIGHT.regular, italic: true,  lineHeight: LINE_HEIGHT.snug },
  display:       { step: "5xl", mobileStep: "4xl", weight: FONT_WEIGHT.regular, italic: false, lineHeight: LINE_HEIGHT.tight, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" },
} as const satisfies Record<string, TextRoleDef>;


export type TextRole = keyof typeof TEXT_ROLES;

/**
 * Resolved roles: same shape as before (`size` / `mobileSize` / `weight` /
 * `italic` / `lineHeight`) but derived from the scale above.
 */
export const TEXT = Object.fromEntries(
  (Object.keys(TEXT_ROLES) as TextRole[]).map((role) => {
    const r = TEXT_ROLES[role] as TextRoleDef;
    return [role, {
      size: FONT_SIZE[r.step],
      mobileSize: FONT_SIZE[r.mobileStep],
      weight: r.weight,
      italic: r.italic,
      lineHeight: r.lineHeight,
      letterSpacing: r.letterSpacing,
      textTransform: r.textTransform,
      fontVariantNumeric: r.fontVariantNumeric,
    }];
  }),
) as Record<TextRole, {
  size: number;
  mobileSize: number;
  weight: number;
  italic: boolean;
  lineHeight: number;
  letterSpacing?: string;
  textTransform?: CSSProperties["textTransform"];
  fontVariantNumeric?: string;
}>;

export function textStyle(role: TextRole, mobile = false): CSSProperties {
  const t = TEXT[role];
  return {
    fontFamily: FONT_FAMILY,
    fontSize: mobile ? t.mobileSize : t.size,
    fontWeight: t.weight,
    fontStyle: t.italic ? "italic" : "normal",
    lineHeight: t.lineHeight,
    ...(t.letterSpacing ? { letterSpacing: t.letterSpacing } : {}),
    ...(t.textTransform ? { textTransform: t.textTransform } : {}),
    ...(t.fontVariantNumeric ? { fontVariantNumeric: t.fontVariantNumeric } : {}),
  };
}

/** Escape hatch for one-off sizing that still respects the scale. */
export function fontSize(step: FontSizeStep, mobileStep?: FontSizeStep, mobile = false): number {
  return FONT_SIZE[mobile && mobileStep ? mobileStep : step];
}

/* ------------------------------------------------------------------ *
 * Controls — one source of truth for every tappable thing.
 * ------------------------------------------------------------------ */

/** Minimum touch target (WCAG 2.5.5 / iOS HIG). Never go below this. */
export const TOUCH_MIN = 44;

export const CONTROL_H = {
  sm: 36,
  md: 44,
  lg: 48,
} as const;

export const CONTROL_PAD_X = {
  sm: SPACE[5],
  md: SPACE[6],
  lg: SPACE[8],
} as const;

export type ButtonVariant =
  | "primary"     // main forward action (red)
  | "secondary"   // alternate forward action (blue)
  | "accent"      // playful / start (orange)
  | "neutral"     // low-emphasis on cream surfaces
  | "ink"         // dark utility (BACK / Cancel)
  | "play"        // the big italic "Let's Play!" CTA
  | "quiet"       // cream on cream (Stay)
  | "ghost"       // text-only
  | "danger";     // destructive (leave / quit)

const BUTTON_PALETTE: Record<ButtonVariant, { bg: string; bgHover: string; fg: string; border: string }> = {
  // Foreground on a fixed brand background stays literal: `surface` flips dark
  // in night mode, which would leave cream-on-blue reading as black-on-blue.
  primary:   { bg: COLORS.red,        bgHover: COLORS.redHover,        fg: RAW.cream,        border: BORDER.heavy },
  secondary: { bg: COLORS.blue,       bgHover: COLORS.blueHover,       fg: RAW.cream,        border: BORDER.heavy },
  accent:    { bg: COLORS.orange,     bgHover: COLORS.orangeHover,     fg: RAW.warmBlack,    border: BORDER.heavy },
  neutral:   { bg: COLORS.panel,      bgHover: COLORS.panelMutedHover, fg: COLORS.ink,       border: BORDER.heavy },
  ink:       { bg: COLORS.ink,        bgHover: COLORS.inkMuted,        fg: COLORS.surface,   border: BORDER.heavy },
  play:      { bg: COLORS.red,        bgHover: COLORS.redHover,        fg: COLORS.peepsTint, border: BORDER.heavy },
  quiet:     { bg: COLORS.surface,    bgHover: COLORS.surfaceHover,    fg: COLORS.ink,       border: BORDER.heavy },
  ghost:     { bg: "transparent",     bgHover: COLORS.surfaceHover,    fg: COLORS.ink,       border: "none" },
  danger:    { bg: COLORS.red,        bgHover: COLORS.redHover,        fg: RAW.cream,        border: BORDER.heavy },

};

/** Hover background for a variant — pair with `buttonStyle` on pointer events. */
export function buttonHoverBg(variant: ButtonVariant): string {
  return BUTTON_PALETTE[variant].bgHover;
}

/**
 * Canonical button surface. Size drives height + horizontal padding; variant
 * drives colour. Text role is `control`, or `action` for the big italic CTA,
 * so buttons never drift.
 */
export function buttonStyle(
  variant: ButtonVariant = "primary",
  size: keyof typeof CONTROL_H = "md",
  opts: { mobile?: boolean; fullWidth?: boolean; disabled?: boolean } = {},
): CSSProperties {
  const p = BUTTON_PALETTE[variant];
  // Spent/disabled controls get a real inactive surface (not a faded live one)
  // so they read as "unavailable" rather than "broken".
  const bg = opts.disabled ? COLORS.panelMuted : p.bg;
  const fg = opts.disabled ? COLORS.inkMuted : p.fg;
  const border = opts.disabled ? BORDER.heavy : p.border;
  return {
    ...textStyle(variant === "play" ? "action" : "control", opts.mobile),

    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE[4],
    width: opts.fullWidth ? "100%" : undefined,
    minHeight: Math.max(CONTROL_H[size], size === "sm" ? CONTROL_H.sm : TOUCH_MIN),
    padding: `0 ${CONTROL_PAD_X[size]}px`,
    background: bg,
    color: fg,
    border,
    borderRadius: RADIUS.sm,
    cursor: opts.disabled ? "not-allowed" : "pointer",
    opacity: 1,
    textDecoration: "none",
    whiteSpace: "nowrap",
    transition: `background ${MOTION.fast}, opacity ${MOTION.fast}, transform ${MOTION.fast}`,
  };
}

/** Square icon button — always a full touch target. */
export function iconButtonStyle(
  variant: ButtonVariant = "ghost",
  size: number = TOUCH_MIN,
): CSSProperties {
  const p = BUTTON_PALETTE[variant];
  return {
    boxSizing: "border-box",
    width: size,
    height: size,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    background: p.bg,
    color: p.fg,
    border: p.border,
    borderRadius: RADIUS.sm,
    cursor: "pointer",
    transition: `background ${MOTION.fast}`,
  };
}

/** Cream card/panel surface used by every pre-game section. */
export function panelStyle(
  tone: "surface" | "panel" = "surface",
  pad: keyof typeof SPACE = 8,
): CSSProperties {
  return {
    boxSizing: "border-box",
    background: tone === "surface" ? COLORS.surface : COLORS.panel,
    border: BORDER.heavy,
    borderRadius: RADIUS.md,
    padding: SPACE[pad],
  };
}

