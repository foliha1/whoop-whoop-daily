# Fix the Classic board pulse scale

## Cause
The deal-in class and claim-pulse class are currently applied to the same card wrapper. Both define the CSS `animation` property and animate `transform`; because the deal-in rule appears later, it overrides the pulse scale on cards carrying both classes. The border remains visible because it animates on a separate child, which makes the effect read as a stroke-only pulse.

## Changes
- Split each card into independent deal-in and claim-pulse layers so their animation declarations cannot replace each other.
- Keep the pulse on the full visual card layer with a centered transform origin and no layout movement.
- Use one 1000ms cycle: `scale(1)` at the start, `scale(0.96)` at 50%, and `scale(1)` at the end.
- Apply the existing symmetric ease-in/ease-out curve to both halves of the scale and stroke animations.
- Preserve synchronized whole-board pulsing, glow, selection wash, unavailable dimming, reduced-motion behavior, and all game logic.

## Verification
- Measure computed transforms at the start, midpoint, and end of a live pulse.
- Confirm each card's center remains fixed and the cycle duration is exactly 1000ms.
- Run the relevant TypeScript and focused test checks.
