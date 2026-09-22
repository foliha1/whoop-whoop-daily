# Daily Results Reference Redesign

## Goal
Recompose only the Daily results presentation to match the supplied reference: compact results summary, round list, structured score panel, and reordered actions. Keep all existing result data, copy, score timing, milestone/confetti behavior, sharing fallbacks, email signup behavior, gameplay, Classic, groups logic, and share-card image unchanged.

## Implementation

### Results structure
- Keep the existing top and bottom brand pattern strips and the existing `WHOOP! WHOOP! Daily #N` header.
- Keep the current state-specific headline copy exactly as-is, including the revisit line break.
- Keep `YOUR DAILY RESULTS` left aligned using the existing label role.
- Retain the three equal stat tiles for solved, misses, and streak, but restyle them as compact themed khaki panels with the value above the small-caps label.
- Keep streak milestone state and its existing shine/confetti treatment in the moved streak tile.
- Keep the current per-round data and event ordering, but present it as three compact divided rows: round number, matching rule, then miss/solve dots at right. Preserve the Peek indicator and existing mark entrance timing.
- Remove the daily percentile line from the results presentation to match the reference. Its calculation and underlying data remain unchanged.

### Score panel
- Replace the current score hero and separate links with one themed panel headed `YOUR WHOOP WHOOP SCORE`.
- Add a fixed-size left tier tile with `YOUR TIER`, the current-tier badge, and tier name. When artwork is unavailable, center a larger tier name in the same complete tile without an image placeholder.
- Build the right side as a 2×2 grid: `+N today`, labelled total score, `Your Stats` linking to `/you`, and `Groups` linking to `/groups`.
- Continue reading `todayPoints`, `total`, and `tier` only from the already post-write-gated Whoop Points result.
- Preserve the existing tier-up/new-badge milestone detection and shared confetti. Keep fixed badge art theme-independent and load-gated through the existing reusable image helper.
- Keep Rookie and every other existing badge in the badge-art map. Rookie displays its badge like any mapped tier; the no-art fallback remains generic for genuinely unmapped or unloadable art.

### Actions and subscription
- Keep the existing Invite behavior: native link-only share for today’s Daily, with clipboard/toast fallback and no result-card attachment.
- Keep Share’s existing preview, generated image, native file share, text fallback, and download fallback unchanged.
- Make Invite and Share equal-width side-by-side buttons, followed immediately by a full-width Done button.
- Remove the old groups standings line and old stats text link from results; their destinations move into the score panel.
- Keep the existing email capture copy and behavior for non-subscribers, moving its unchanged callout below Done. Subscribed players end at Done before the bottom strip.

### Sizing and overflow
- Use only existing semantic colors, borders, radii, spacing tokens, button styles, and text roles. Do not introduce bold 700 weight or reduce information text below the existing 14px tier.
- Treat the SVG measurements only as proportion and hierarchy guidance. Use established panel/button styles and the nearest spacing, radius, border, and type tokens throughout.
- Build the score panel with fluid grid columns that share available width and adapt down to 360px without overflow. Give the tier tile a consistent proportional share and scale its badge within that fluid tile; do not use the reference’s fixed tile or row dimensions.
- Keep gameplay’s fixed, non-scrolling frame unchanged. Results continue using the frame’s internal vertical scrolling only when content exceeds the viewport.

## Technical details
- Refactor `WhoopPointsChange` into the new score-panel presentation, with route links and the no-art tier fallback contained there.
- Simplify `DailyResultCard` block order and stagger indices to match the new visual order while retaining existing animation classes and timing relationships.
- Add stable test hooks around the tier tile, navigation buttons, action order, and subscription placement.
- Update focused badge/tier and result-presentation tests for Rookie’s no-art mapping and fallback.

## Verification
- Exercise a subscribed results state at 390×844 in light and night modes and confirm no internal scrolling.
- Test descending viewport heights at 390px width and report the first height where subscribed results require scrolling; separately report the non-subscriber threshold because the retained email form is taller.
- Verify a Rookie result displays its mapped badge in the tier tile.
- Verify a badge-bearing tier renders decoded fixed artwork in the tier tile in both themes.
- Verify a non-subscriber sees the unchanged email capture below Done.
- Verify Invite sends only the Daily invitation link and Share still opens the unchanged result-card flow.
- Run focused result, badge/tier, share, and points tests plus the project’s automatic type/build checks.

## Reference approximations to report
- Report the established radius, border, spacing, control, and type tokens selected to express the reference’s hierarchy.
- Do not report pixel substitutions for the measured columns or rows: those become fluid proportional tracks and token-based minimum control sizing.
