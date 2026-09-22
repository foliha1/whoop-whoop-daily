# Current-tier badge presentation

## Goal
Show the badge art for the player’s current points tier in the Daily results score hero and the top score section on YOU. Render nothing when that tier has no mapped artwork.

## Changes
- Add a small reusable current-tier badge image component that:
  - resolves art only through the existing badge-art map;
  - preloads/decodes the image before mounting it visually;
  - uses meaningful alt text (`<tier name> badge`);
  - reserves no space when art is absent or fails to load;
  - keeps the fixed artwork unchanged across light and night themes.
- Place the badge beside the current tier name in the Daily score hero, sized below today’s points in visual priority.
- Place a larger version beside the total and current tier name in the top YOU score section.
- Keep the existing badge shelf unchanged; it continues to show earned historical badges.
- Reuse the current tier-up / badge-earned-today milestone state and confetti. Any badge entrance will use the existing shared timing constants and stop under reduced motion.

## Verification
- Add focused presentation tests for Great Eye artwork, Rookie no-art behavior, and selecting current tier rather than highest-ever tier.
- Verify a dropped player renders the current tier badge while historical badges remain on the shelf.
- Check Daily results at 390×520 in light and night themes, with Great Eye artwork present, confirming no scrolling.
- Check the no-art Rookie layout has no empty slot or spacing.

## Boundaries
No changes to points calculation, persistence, gameplay, share cards, groups, or Classic.
