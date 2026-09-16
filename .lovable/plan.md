# How to Play demo: bubble padding, line spacing, and circle progress

All changes are in `src/components/ClassicDemo.tsx`, presentation only. Nothing touches the reducer, game rules, claim arbiter, or the Daily.

## 1. Bubble side padding → 20px, responsive

Current: the instruction bubble (the fixed 176px lower slot) uses `paddingInline: SPACE[20]` (40px).

- Replace with `SPACE[10]` (20px) on mobile and `SPACE[16]` (32px) on tablet/desktop, driven by the existing `useIsMobile` hook (`src/hooks/use-mobile.tsx`, breakpoint 768px). The demo column is capped at 420px, so this covers every real case; tokens keep it off raw values.
- Add the `useIsMobile` import; the component currently doesn't have it.
- The step-12 bullet list inherits the same bubble padding — no separate change.

## 2. Instruction line spacing +5%

Current: bubble copy uses `textStyle("control", true)` with `fontSize: FONT_SIZE.sm`, so line spacing comes from `LINE_HEIGHT.tight` (1.1).

- Set `lineHeight: LINE_HEIGHT.tight * 1.05` (1.155) directly on the bubble text style, derived from the token so it can never drift. Type stays Geist at `FONT_SIZE.sm` — size unchanged.

## 3. Progress dashes → circles

Current: fifteen dashes, each `flex: "1 1 0"`, height `SPACE[2]`, filled `RAW.blue` when `i <= step`, `RAW.cream` otherwise, `BORDER.standard`.

- Replace with fifteen fixed-size circles: `width`/`height` `SPACE[2]` (4px) scaled up to a visible dot (`SPACE[3]`, 6px — pick after seeing it at 390px; 15 dots must still clear the SKIP button), `borderRadius: RADIUS.sm` scaled to a circle (or `999px`), gap stays `SPACE[1]`.
- Fill: current and previous steps get `RAW.warmBlack` (brand black). Remaining steps get no fill (`transparent`), keeping `BORDER.standard` so they read against the khaki surface.
- Keep the `MOTION.fast` background transition and the existing `aria-label`.

## Verification

- Playwright at 390×520: every step fits with no scrolling — re-measure step 12's three-bullet copy specifically, since the taller line spacing adds height.
- Confirm the bubble measures ~20px of side padding on a phone viewport and widens to 32px at ≥768px wide.
- Confirm the progress row renders as circles: black through the current step, hollow ahead, and nothing collides with the SKIP button.
- Run the test suite (352 expected; the one post-run worker timeout is the known flake).
