# Normalize button typography and label case

## Scope

Apply a type-and-case-only pass across Daily, Classic, How to Play, groups, settings, modals, and admin. Preserve every label’s words, punctuation, tone, and the exact `WHOOP! WHOOP!` brand name. Do not touch gameplay, reducers, rules, season logic, RPCs, routing, or Classic prerender behavior.

## Implementation

1. Correct the shared text roles in `src/lib/tokens.ts`.
   - Change `control` from Geist Medium to Friend Regular, keeping its existing 18px desktop / 17px mobile steps and non-italic style.
   - Keep `action` unchanged as Friend Regular Italic.
   - Set `caption`, `captionItalic`, `label`, `pill`, and `chip` to 14px at both desktop and mobile breakpoints.
   - Preserve each role’s existing family, weight, italic setting, line height, tracking, and transform except for the explicitly requested `control` family/weight change.

2. Bring the exceptional custom text button onto `buttonStyle()`.
   - Replace its inline font family/size treatment with the closest existing helper variant and size while preserving its dimensions, color intent, behavior, and label wording.
   - Leave icon-only, switch, swatch, dot-navigation, and other non-text controls structurally unchanged.
   - Confirm no text button synthesizes Friend bold (`fontWeight: 700`).

3. Normalize visible button and CTA strings to Title Case across the entire source tree.
   - Edit source strings directly; do not use CSS `textTransform`.
   - Keep small connecting words lowercase mid-label.
   - Preserve existing punctuation exactly, including existing exclamation marks.
   - Keep every `WHOOP! WHOOP!` occurrence exactly uppercase.
   - Update label-bearing props and dynamic button-label branches where they supply visible button text, without changing aria descriptions that are sentences rather than visible labels.
   - Record every recased label for the completion count and flag any genuinely ambiguous case rather than changing its wording.

4. Verify Daily results technical copy.
   - Map scores, streak, misses, share line, subscribe copy, and all stats to their resolved roles and sizes.
   - Confirm informational metadata using the changed small roles resolves to 14px on both breakpoints.
   - Report any remaining informational element above 14px by its existing role; do not add raw size overrides.

## Verification

- Run the TypeScript check and full test suite.
- At 390×520, verify light and night modes for Daily ready/results, Classic entry/in-game/results/How to Play, and groups page/modals.
- Confirm no visible button label wraps, clips, or overflows, especially `WHOOP! WHOOP!` and the Classic result action row.
- Confirm Friend Regular on standard buttons, Friend Italic on play buttons, and no unintended copy or behavior changes.
- Report every changed role before/after, the exact count of recased labels, any uncertain label, and the resolved Daily results technical-copy sizes.
