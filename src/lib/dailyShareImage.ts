// ============================================================================
// Daily share image — a 1080x1350 PNG drawn with the Canvas 2D API.
//
// Marks and counts only: never a card face, a grid position, the rule that was
// rolled, or anything else that could spoil the day's puzzle.
// ============================================================================

import { DAILY_ROUNDS } from "@/lib/dailyEngine";
import type { DailyResult } from "@/lib/daily";
import { RAW, FONT_FAMILY } from "@/lib/tokens";
import { SPOOK_AT_LOAD } from "@/lib/skin";
import patternAsset from "@/assets/WhoopWhoop_Daily_Pattern_Seamless.svg.asset.json";
import lockupAsset from "@/assets/WhoopWhoop_Daily_Lockup.svg.asset.json";
import lockupCreamAsset from "@/assets/WhoopWhoop_Daily_Lockup_Cream.svg.asset.json";
import spookLogoLight from "@/assets/spook/spook-logo-light.svg?url";
import spookLogoNight from "@/assets/spook/spook-logo-night.svg?url";

/**
 * Blue/red as TEXT on the cream card. Under Spook the brand fills shift with
 * RAW, but text drawn on cream needs the readable light shades — the same
 * values --ww-blue-text / --ww-red-text use in the light theme.
 */
const TEXT_BLUE = SPOOK_AT_LOAD ? "#557202" : RAW.blue;
const TEXT_RED = SPOOK_AT_LOAD ? "#9400BD" : RAW.red;

/** Which surface the card is drawn on. Light is the original composition. */
export type ShareImageTheme = "light" | "night";

/**
 * Per-theme surface/ink only. Brand red, blue and orange — and therefore the
 * result marks — are identical in both, exactly as they are in the app.
 */
const THEME = {
  light: {
    surface: RAW.cream,
    ink: RAW.warmBlack,
    panel: RAW.khaki,
    /** Peek pill: ink chip with surface-coloured type. */
    pillBg: RAW.warmBlack,
    pillFg: RAW.cream,
    lockup: lockupAsset.url,
    pattern: SPOOK_AT_LOAD
      ? "/WhoopWhoop_Daily_Pattern_Seamless_Spook.svg"
      : patternAsset.url,
  },
  night: {
    surface: RAW.warmBlack,
    ink: RAW.cream,
    // The night equivalent of the khaki panel (--ww-panel in night mode).
    panel: "#3A3335",
    pillBg: RAW.cream,
    pillFg: RAW.warmBlack,
    lockup: lockupCreamAsset.url,
    pattern: SPOOK_AT_LOAD
      ? "/WhoopWhoop_Daily_Pattern_Seamless_Night_Spook.svg"
      : "/WhoopWhoop_Daily_Pattern_Seamless_Night.svg",
  },
} as const;

export const SHARE_IMAGE_W = 1080;
export const SHARE_IMAGE_H = 1350;

const PAD = 80;

/** Streaks only make the card at 3+ days — below that it's clutter. */
const SHARE_STREAK_MIN = 3;

// --- Shape rule geometry ----------------------------------------------------
// The same seamless brand tile `DailyShapeRule` paints on screen.
const RULE_W = 920;
const RULE_H = 49.24;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
};

/** The score line, matching the wording used in the share text. */
export function scoreLine(result: DailyResult, streak?: number | null): string {
  return scoreSegments(result, streak)
    .map((s) => s.text)
    .join("");
}

type Segment = { text: string; color: string };

/**
 * The score line split into coloured runs. Concatenated, this is exactly the
 * string `scoreLine` returns.
 */
function scoreSegments(
  result: DailyResult,
  streak?: number | null,
  ink: string = RAW.warmBlack
): Segment[] {
  const solved = result.roundsSolved ?? 0;
  const misses = result.totalMisses ?? 0;
  const dot: Segment = { text: " · ", color: ink };
  const segs: Segment[] = [];

  if (solved === 0) {
    segs.push({ text: "Whooped! Better luck tomorrow", color: TEXT_RED });
  } else {
    segs.push({ text: `${solved} of ${DAILY_ROUNDS}`, color: TEXT_BLUE });
    segs.push(dot);
    segs.push(
      misses === 0
        ? { text: "Clean", color: TEXT_BLUE }
        : {
            text: `${misses} ${misses === 1 ? "miss" : "misses"}`,
            color: TEXT_RED,
          }
    );
  }

  if (typeof streak === "number" && streak >= SHARE_STREAK_MIN) {
    segs.push(dot);
    segs.push({ text: `${streak} day streak`, color: ink });
  }

  return segs;
}

/** Draw the score line as one centred string with per-segment colours. */
function drawScoreLine(
  ctx: CanvasRenderingContext2D,
  result: DailyResult,
  streak: number | null | undefined,
  cy: number,
  ink: string
) {
  const segs = scoreSegments(result, streak, ink);
  ctx.font = `72px ${FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const widths = segs.map((s) => ctx.measureText(s.text).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = (SHARE_IMAGE_W - total) / 2;
  segs.forEach((s, i) => {
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, x, cy);
    x += widths[i];
  });
}

/**
 * Render the day's result as a shareable PNG. Rejects if the canvas or the
 * artwork is unavailable — callers fall back to the text-only share path.
 */
export async function renderDailyShareImage(
  result: DailyResult,
  streak?: number | null,
  theme: ShareImageTheme = "light"
): Promise<Blob> {
  const T = THEME[theme];
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_IMAGE_W;
  canvas.height = SHARE_IMAGE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* fonts API flaked — draw with whatever is loaded */
    }
  }

  const [lockup, pattern] = await Promise.all([
    loadImage(T.lockup),
    loadImage(T.pattern),
  ]);

  ctx.fillStyle = T.surface;
  ctx.fillRect(0, 0, SHARE_IMAGE_W, SHARE_IMAGE_H);

  // --- Vertical rhythm: space-between between the five stacked blocks -------
  const HEADER_H = 331.4;
  const PANEL_W = 484;
  const PANEL_H = 446;
  const SCORE_H = 50;
  const blocks = [RULE_H, HEADER_H, PANEL_H, SCORE_H, RULE_H];
  const free = SHARE_IMAGE_H - PAD * 2 - blocks.reduce((a, b) => a + b, 0);
  const gap = free / (blocks.length - 1);

  let y = PAD;
  const advance = (h: number) => {
    const top = y;
    y += h + gap;
    return top;
  };

  // --- 1. Top shape rule ----------------------------------------------------
  ctx.drawImage(pattern, PAD, advance(RULE_H), RULE_W, RULE_H);

  // --- 2. Header: the Daily lockup + puzzle-number badge --------------------
  const headerTop = advance(HEADER_H);
  const LOCKUP_W = 394.22;
  const BADGE_D = 204.56;
  const HEADER_GAP = 25.1;
  const rowW = LOCKUP_W + HEADER_GAP + BADGE_D;
  const rowX = (SHARE_IMAGE_W - rowW) / 2;

  ctx.drawImage(lockup, rowX, headerTop, LOCKUP_W, HEADER_H);

  const badgeCx = rowX + LOCKUP_W + HEADER_GAP + BADGE_D / 2;
  const badgeCy = headerTop + HEADER_H / 2;
  ctx.save();
  ctx.translate(badgeCx, badgeCy);
  ctx.rotate((15.06 * Math.PI) / 180);
  ctx.fillStyle = RAW.orange;
  ctx.beginPath();
  ctx.arc(0, 0, BADGE_D / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RAW.warmBlack;
  ctx.font = `100px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${result.puzzleNumber}`, 0, 0);
  ctx.restore();


  // --- 3. Rounds panel ------------------------------------------------------
  const panelTop = advance(PANEL_H);
  const panelX = (SHARE_IMAGE_W - PANEL_W) / 2;
  ctx.fillStyle = T.panel;
  roundRect(ctx, panelX, panelTop, PANEL_W, PANEL_H, 16);

  const P_PAD = 48;
  const ROW_W = PANEL_W - P_PAD * 2; // 388
  const ROW_H = 96;
  const ROW_GAP = 31;
  const rowsX = panelX + P_PAD;

  const events = result.roundEvents ?? [];

  for (let i = 0; i < DAILY_ROUNDS; i++) {
    const rowY = panelTop + P_PAD + i * (ROW_H + ROW_GAP);
    const midY = rowY + ROW_H / 2;

    // Label.
    ctx.fillStyle = T.ink;
    ctx.font = `72px ${FONT_FAMILY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`R${i + 1}`, rowsX, midY - 4);

    // Marks: two slots, flush right — unused slots sit on the left.
    const MARK = 64;
    const MARK_GAP = 20;
    const groupW = MARK * 2 + MARK_GAP; // 148
    const groupX = rowsX + ROW_W - groupW;
    const roundEvents = events[i] ?? [];
    const slots: (string | undefined)[] = [undefined, undefined];
    for (let k = 0; k < roundEvents.length && k < 2; k++) {
      // right-align: last event lands in the right slot
      slots[2 - Math.min(roundEvents.length, 2) + k] = roundEvents[k];
    }
    for (let s = 0; s < 2; s++) {
      const ev = slots[s];
      if (!ev) continue;
      ctx.fillStyle = ev === "SOLVE" ? RAW.blue : RAW.red;
      ctx.beginPath();
      ctx.arc(
        groupX + s * (MARK + MARK_GAP) + MARK / 2,
        midY,
        MARK / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Peek pill, between the label and the marks.
    if (result.peekUsed && result.peekRound === i + 1) {
      const pillW = 87;
      const pillH = 44;
      const pillX = groupX - 24 - pillW;
      const pillY = midY - pillH / 2;
      ctx.fillStyle = T.pillBg;
      roundRect(ctx, pillX, pillY, pillW, pillH, 4);
      ctx.fillStyle = T.pillFg;
      ctx.font = `40px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PEEK", pillX + pillW / 2, pillY + pillH / 2 + 1);
    }

    // Bottom border.
    ctx.strokeStyle = T.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rowsX, rowY + ROW_H);
    ctx.lineTo(rowsX + ROW_W, rowY + ROW_H);
    ctx.stroke();
  }

  // --- 4. Score line --------------------------------------------------------
  const scoreTop = advance(SCORE_H);
  drawScoreLine(ctx, result, streak, scoreTop + SCORE_H / 2, T.ink);

  // --- 5. Bottom shape rule -------------------------------------------------
  ctx.drawImage(pattern, PAD, advance(RULE_H), RULE_W, RULE_H);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas toBlob failed"));
    }, "image/png");
  });
}
