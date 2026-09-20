# Correct Daily groups typography and night-mode modal panels

## Changes
- Remove explicit Geist family/weight overrides where group text already uses a `textStyle` role, including the groups list, group boards, modal field labels, and results-screen groups line.
- Keep typography role sizing, casing, tracking, and all existing behavior unchanged; each affected label will inherit Friend from its role as the current token system specifies.
- Treat the interactive khaki modal panels as an oversight rather than fixed artwork: switch both the groups modal panel and email modal panel to the themed panel color, while leaving cards, dice, results artwork, patterns, and share artifacts untouched.
- Update the two modal comments so they no longer describe the panel as permanently khaki.

## Verification
- Check create/join group modals and the email modal in night mode at phone size, including panel contrast, controls, borders, headings, body copy, labels, close controls, and errors.
- Confirm the `/groups` debug gate and all group/game behavior remain unchanged.
- Run the focused groups tests and type check.

## Technical details
- `textStyle()` currently resolves all roles to Friend; removing `FONT_FAMILY_UI` therefore changes only the explicitly overridden caption/metadata elements, not headings or group names already rendering correctly.
- `COLORS.panel` maps to the light khaki panel in light mode and the dark themed panel in night mode. `RAW.khaki` is reserved by the token documentation for fixed artwork/colour math, not interactive modal chrome.
- The email form contains additional frozen ink/input colors; verify their contrast against the themed panel and only adjust them if required for legibility, using existing semantic tokens.
