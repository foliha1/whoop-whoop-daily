# Correct the shared typography roles

## Findings

`textStyle()` currently sets `FONT_FAMILY` unconditionally, so every requested role resolves to Friend:

| Role | Current family | Intended family | Status |
|---|---|---|---|
| `title` | Friend | Friend | Correct |
| `subhead` | Friend | Friend | Correct |
| `body` | Friend | Geist | Wrong |
| `control` | Friend | Geist | Wrong |
| `caption` | Friend | Geist | Wrong |
| `label` | Friend | Geist | Wrong |

This is a central token bug, not a groups-only styling problem. `TextRoleDef` has no family field, and `textStyle()` hardcodes Friend for every role. Existing product comments and implementations explicitly establish Friend headings with Geist body, helper, metadata, and UI copy.

The workaround is widespread:

- Direct overrides layered on `textStyle()`: Daily result labels and game status; Classic demo body and instruction copy; Classic entry helper text and Daily link.
- Standalone Geist styles bypassing `textStyle()`: Daily How to Play body/labels, legal copy, Daily footer, recognition and recall metadata, admin numeric data, landing-page body, and email-form copy.
- The groups overrides removed in the preceding correction were part of this same workaround. No further typography edits have been made during this reassessment.

The night-panel correction is already valid and remains: group and email modal panels use `COLORS.panel`, with theme-aware text, input, and border colors. Frozen cards, dice, result artwork, patterns, and share artwork remain unchanged.

## Implementation

1. Add an explicit family classification to each shared text role in `src/lib/tokens.ts`.
   - Friend display roles: `subhead`, `title`, `heading`, `hero`, result display roles, `action`, and `display`.
   - Geist text/UI roles: `body`, `control`, `caption`, `captionItalic`, `label`, `pill`, and `chip`.
   - Make `textStyle()` resolve both family and the matching supported weight from the role.

2. Remove only redundant Geist overrides that currently compensate for these corrected roles.
   - Include the Daily, Classic demo, Classic entry, and groups flow.
   - Preserve intentional one-off typography that does not use a shared role, such as numeric/admin styles and bespoke artwork text.
   - Remove the redundant Friend override on the admin title.

3. Update the typography reference page to render each sample through `textStyle()` and display its resolved family, so future role drift is visible.

## Verification

- Run the full type-check and test suite.
- Compare phone-sized and desktop renders in both light and night themes for:
  - Daily ready, active play, and results.
  - Classic entry, active game, results, and all How to Play instruction states, especially the tight bullet step.
  - Groups page/modals/results line and the Daily email modal.
- Confirm body, helper, control, caption, and label copy is Geist; headings and branded display copy remain Friend.
- Check wrapping, clipping, control heights, pills, tracked labels, and the 390×520 no-scroll constraints.
- Keep `/groups` behind `DebugOnlyRoute`; do not alter gameplay, reducers, season logic, RPCs, or Classic behavior.

## Expected visible impact

This will change every un-overridden use of `body`, `control`, `caption`, `label`, `pill`, and `chip` from Friend to Geist. High-traffic changes include Daily ready/result prose, labels, pills, and controls; Classic entry prose and controls; in-game controls and labels; and the small Classic results caption. Display headings, game lockups, scores, result headlines, and branded CTA roles remain Friend.
