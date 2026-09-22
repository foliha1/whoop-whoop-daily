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
- Keep the existing daily percentile line because it is existing results content, placing it directly after the round rows.

### Score panel
- Replace the current score hero and separate links with one themed panel headed `YOUR WHOOP WHOOP SCORE`.
- Add a fixed-size left tier tile with `YOUR TIER`, the current-tier badge, and tier name. When artwork is unavailable, center a larger tier name in the same complete tile without an image placeholder.
- Build the right side as a 2×2 grid: `+N today`, labelled total score, `Your Stats` linking to `/you`, and `Groups` linking to `/groups`.
- Continue reading `todayPoints`, `total`, and `tier` only from the already post-write-gated Whoop Points result.
- Preserve the existing tier-up/new-badge milestone detection and shared confetti. Keep fixed badge art theme-independent and load-gated through the existing reusable image helper.
- Treat the latest requirement that Rookie has no displayed art as authoritative: remove Rookie from the badge-art map while leaving its uploaded asset untouched. Other mapped tier badges remain available, and the no-art fallback remains generic.

### Actions and subscription
- Keep the existing Invite behavior: native link-only share for today’s Daily, with clipboard/toast fallback and no result-card attachment.
- Keep Share’s existing preview, generated image, native file share, text fallback, and download fallback unchanged.
- Make Invite and Share equal-width side-by-side buttons, followed immediately by a full-width Done button.
- Remove the old groups standings line and old stats text link from results; their destinations move into the score panel.
- Keep the existing email capture copy and behavior for non-subscribers, moving its unchanged callout below Done. Subscribed players end at Done before the bottom strip.

### Sizing and overflow
- Use only existing semantic colors, borders, radii, spacing tokens, button styles, and text roles. Do not introduce bold 700 weight or reduce information text below the existing 14px tier.
- Use the existing 24px frame padding, yielding a 342px content width at 390px rather than forcing the measured 346px reference width.
- Use the nearest existing tokens for the reference’s 16px panel padding, approximately 3px radii, 2px borders, and normalized internal gaps.
- Keep gameplay’s fixed, non-scrolling frame unchanged. Results continue using the frame’s internal vertical scrolling only when content exceeds the viewport.

## Technical details
- Refactor `WhoopPointsChange` into the new score-panel presentation, with route links and the no-art tier fallback contained there.
- Simplify `DailyResultCard` block order and stagger indices to match the new visual order while retaining existing animation classes and timing relationships.
- Add stable test hooks around the tier tile, navigation buttons, action order, and subscription placement.
- Update focused badge/tier and result-presentation tests for Rookie’s no-art mapping and fallback.

## Verification
- Exercise a subscribed results state at 390×844 in light and night modes and confirm no internal scrolling.
- Test descending viewport heights at 390px width and report the first height where subscribed results require scrolling; separately report the non-subscriber threshold because the retained email form is taller.
- Verify a Rookie result shows a finished tier tile with no image or empty placeholder.
- Verify a badge-bearing tier renders decoded fixed artwork in the tier tile in both themes.
- Verify a non-subscriber sees the unchanged email capture below Done.
- Verify Invite sends only the Daily invitation link and Share still opens the unchanged result-card flow.
- Run focused result, badge/tier, share, and points tests plus the project’s automatic type/build checks.

## Reference approximations to report
- 346px panel width → 342px at 390px viewport, preserving the existing 24px frame padding.
- ~3px and ~2.6px radii → `RADIUS.sm` (4px).
- ~16px panel padding → `SPACE[8]` (16px).
- ~10px outer and ~6–9px inner gaps → one normalized spacing token selected during visual fitting.
- 91/103.5px measured columns and 102/68/25px rows → stable proportional grid tracks and nearest control/spacing dimensions that preserve readable 14px text and touch targets.
