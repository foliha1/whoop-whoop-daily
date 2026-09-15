# Fix How to Play roll and spacing

## Changes
- Replace both demo-only die animations with the same full-screen `RollHeroOverlay` used during live Classic play, using the demo's existing scripted timing and landing the result in the small die container.
- Match the demo action row to live play: the die container and WHOOP! WHOOP! button will share the same compact-row height.
- Increase the instruction panel's horizontal padding by 20% using the spacing tokens.
- Reduce Geist instruction copy by exactly one typography-scale step.

## Verification
- Check both COLOR and SHAPE rolls animate full-screen and settle into the die container.
- Measure the die container and button heights.
- Run the focused tests and verify every step at 390×520 without scrolling, especially step 12's three bullets.

## Boundaries
- Presentation only. No Daily, reducer, game-rule, or claim-arbiter changes.
- WHOOP naming remains unchanged.
