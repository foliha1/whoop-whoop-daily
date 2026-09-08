# Classic live-test polish

## Scope
- Make the large game button fit every current label on narrow phones while preserving the prominent WHOOP! WHOOP! treatment.
- Correct the How to Play copy, including the fixed nine-card table, winner-roll wording, two-call limit, and an unambiguous Match or Miss explanation.
- Fix the die example so its measured visual bounds stay inside the available teaching-card space on short phones and desktop.
- Remove the inactive Music switch from shared settings and retain Sound effects.
- Show a brief, named caller signal using the existing player/status area, with reduced-motion-safe transitions.
- Ensure only newly refilled pair slots replay the existing deal-in treatment while the other seven cards remain visually stable.

## Technical details
- Use the existing design helpers from `tokens.ts` for type, controls, spacing, borders, radii, motion, and shadows.
- Keep all changes presentational; do not alter the reducer, game rules, arbiter, target, or Daily behavior.
- Validate Classic at 390×520 and 390×844, plus a wide desktop How to Play view; confirm no compact-screen scrolling or clipping.
