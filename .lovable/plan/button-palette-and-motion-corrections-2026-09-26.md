# Button palette and motion corrections

## Scope and guardrails

This is a presentation-only pass. It will not change game rules, the 2-second flip hold, animation or settle clocks, points, sign-in, or Groups visibility. Nothing will be published.

No new colors are needed. Every planned text/fill pair passes 4.5:1 using the existing palette.

## Part A — one canonical button system

### Implementation

- Make `BUTTON_PALETTE` in `tokens.ts` the only source for button colors and states.
- Make `AppButton` translate its existing API to canonical roles instead of maintaining `TONE_MAP`; remove theme-flipping brand foregrounds and whole-button disabled opacity.
- Consolidate the legacy `play`, `neutral`, `ink`, `ghost`, and `danger` appearances into the approved Primary, Secondary, Accent, Utility, Quiet, and Destructive roles. Existing call sites may retain compatibility names only if they resolve directly to those canonical entries.
- Add explicit canonical states for Quiet selected/inverse, Destructive first/outlined, Destructive confirm/solid, Disabled, and Loading. Loading remains visually in its role while interaction is locked and only the label changes; unavailable controls use Disabled colors.
- Replace duplicated brand-color maps and inline button colors in Classic game controls, Classic result actions, How to Play, Settings, release announcement, sign-in links, and other product surfaces with canonical role styles.
- Keep switches, theme swatches, cards, tabs, pagination dots, and list rows as their appropriate control types, but source any button-like text/fill states from the same accessible role palette.
- Classic mode tiles keep blue for **Play Solo** and red for **Play with Peeps**. Both labels use fixed cream; pale Blue 2 and pink remain icon-only.
- Initial destructive actions use a red outline with theme ink text on theme surface. Only the explicit confirmation becomes solid red with fixed cream.

### Full control-to-role mapping

| Surface | Controls | Role |
|---|---|---|
| Daily start/header | Let’s Play! | Primary |
| Daily start/header | How to Play, Settings, header close/exit | Utility |
| Daily game | Peek | Secondary; Disabled after use |
| Daily results/share | Invite, preview Make Another | Secondary |
| Daily results/share | Share, Copy/Download image | Accent |
| Daily results/share | Done, preview Back | Utility |
| Daily results | Your Stats | Secondary |
| Daily email capture | Send; Sending… | Secondary; loading retains Secondary |
| Sign-in | Sign In, Send Code; sending/verifying labels | Secondary; loading retains Secondary |
| Sign-in | Sounds good | Primary |
| Sign-in | No thanks, Resend code, Use a different email | Quiet |
| Recognition/streak recovery | Restore your streak, Not you?, Keep | Quiet |
| Recognition/streak recovery | Forget identity first action / Yes, forget confirmation | Destructive outline / Destructive confirm |
| Classic landing/demo | Learn How to Play, Back to Your Table, Play Again, Next | Primary |
| Classic landing/demo | Play Solo | Secondary |
| Classic landing/demo | Play with Peeps, Let’s Play! | Primary |
| Classic landing/demo | Back, Done, close, settings | Utility |
| Classic mode tiles | Play Solo blue tile / Play with Peeps red tile | Secondary / Primary, both fixed-cream labels |
| Classic lobby | Create/Join forward action and retry start | Primary |
| Classic lobby | Join alternate, Share/Invite | Secondary |
| Classic lobby | Table code/copy | Accent |
| Classic lobby | Back, Cancel, Close, copied confirmation | Utility |
| Classic lobby | Stay / cancel leave | Quiet |
| Classic lobby | Leave table/end game first action and confirmation | Destructive outline / Destructive confirm |
| Classic game | WHOOP! WHOOP! | Primary |
| Classic game | Select Match | Secondary |
| Classic game | Your Roll! / Play! | Accent |
| Classic game | Wait, unavailable call, inactive banner action | Disabled |
| Classic game | Settings, Cancel, neutral close | Utility |
| Classic game | Leave/end first action and modal confirmation | Destructive outline / Destructive confirm |
| Classic result | Play Again | Primary |
| Classic result | Invite | Secondary |
| Classic result | Done | Utility |
| Classic result | Waiting… | Disabled status treatment |
| Your Stats | Back, badge arrows, badge-detail Close | Utility |
| Your Stats | Badge tiles | Quiet selection controls |
| Settings | Close, How to Play, Sign Out | Utility |
| Settings | Your Stats | Secondary |
| Settings | Appearance segments | Quiet; selected uses inverse Quiet |
| Settings | Delete Account / Tap Again to Delete Everything | Destructive outline / Destructive confirm |
| Settings | Sound, music, and email controls | Switches; preserve semantics, use accessible theme states rather than button roles |
| How to Play | Back, step dots | Utility |
| How to Play | Next | Secondary |
| How to Play | Let’s Play! | Primary |
| Release announcement | Main acknowledgement/action | Primary |
| Release announcement | Dismiss/secondary action | Quiet |
| Hidden Groups | Back, code tile, group rows | Utility / Quiet selection |
| Hidden Groups | Create Group | Primary |
| Hidden Groups | Join Group, Invite, Save My Email | Secondary |
| Hidden Groups | Today/Season | Quiet; selected uses inverse Quiet |
| Hidden Groups | Leave Group first action / confirmation; Stay | Destructive outline / Destructive confirm; Quiet |
| Support | Play Now | Primary |
| Support | Pre-Order Now | Secondary |
| Support | Back to the game | Utility |
| Music/theme widgets | Previous/next, playlist, mute, theme choices | Utility or Quiet selected/inverse |
| Music widget | Play / Pause | Secondary / Utility |
| Shared modal controls | Close/Done/Back | Utility |
| Shared modal controls | affirmative main action / alternate choice | Primary / Quiet |
| Admin/internal | Save/import main actions | Primary |
| Admin/internal | Refresh/export/alternate actions | Secondary |
| Admin/internal | Sign out/back/expand | Utility |
| Debug-only Classic controls | Drain/force/close controls | Utility; production gating unchanged |

### Contrast table

Ratios are calculated from the current source hex values. Fixed brand pairs are identical in light and night. “Pressed” means the approved hover/pressed fill.

| Role/state | Text / fill | Light | Night |
|---|---|---:|---:|
| Primary | cream `#F8F2E9` / red `#D72229` | 4.55 | 4.55 |
| Primary pressed | cream / red hover `#B81B20` | 5.87 | 5.87 |
| Secondary | cream / blue `#0072B2` | 4.66 | 4.66 |
| Secondary pressed | cream / blue hover `#005A8F` | 6.60 | 6.60 |
| Accent | warm black `#231F20` / orange `#E79024` | 6.53 | 6.53 |
| Accent pressed | warm black / orange hover `#C47618` | 4.62 | 4.62 |
| Utility | theme surface / theme ink | 14.65 | 14.65 |
| Utility pressed | theme surface / theme ink-muted | 7.52 | 7.66 |
| Quiet | theme ink / theme surface | 14.65 | 14.65 |
| Quiet pressed | theme ink / surface-hover | 12.38 | 12.64 |
| Quiet selected/inverse | theme surface / theme ink | 14.65 | 14.65 |
| Destructive first | theme ink / theme surface, red outline | 14.65 | 14.65 |
| Destructive first pressed | theme ink / surface-hover, red outline | 12.38 | 12.64 |
| Destructive confirm | cream / red | 4.55 | 4.55 |
| Destructive confirm pressed | cream / red hover | 5.87 | 5.87 |
| Disabled | ink-muted / panel | 4.82 | 5.79 |

The red outline remains a non-text cue; using theme ink for its label fixes the current night-mode red-text failure without adding a color. Focus rings and icon-only controls will also be checked against the 3:1 non-text threshold.

## Part B — motion corrections

1. Pass `startFaceUp` to Classic’s `DailyMatchGhost`. The pair will remain face-up for the existing 500ms reveal beat, then continue through the unchanged hold/reward sequence; `SETTLE_MATCH_MS` remains 1900ms.
2. Remove the universal `0.01ms !important` reduced-motion override. Preserve authored opacity fades at their intended durations. Add explicit reduced-motion treatment wherever the audit found reliance on that override:
   - remove movement from revisit, modal backdrop/panel exit, selected-card wash/ring, result/mark entrances, card deal/flip/shrink, match-ghost transforms, press/hover transforms, reveal translations, rotating indicators, and music marquee;
   - retain deliberate opacity/color fades where authored;
   - stop looping shine, pulse, sweep, marquee, chase, spin, and decorative movement;
   - cover component-level inline transforms as well as CSS classes, so removing the global rule cannot reactivate movement.
3. Add an opt-out to `WhoopPointsChange`’s inner `daily-intro`, defaulting to current standalone behavior. Daily’s results slot will disable only that inner entrance because its outer `.ww-res-in` already owns the reveal.

## Verification

- Add palette unit tests proving `AppButton` and `buttonStyle` resolve through the same canonical source, fixed brand foregrounds never theme-flip, loading never fades, and Disabled uses panel/ink-muted.
- Add role/state regression tests for Classic action buttons and mode tiles, Settings deletion stages, sign-in loading, How to Play, announcement actions, and hidden Groups.
- Add automated contrast assertions for every row above in both themes, including pressed and selected states.
- Add motion tests for Classic’s face-up ghost and unchanged 500ms/1900ms timeline, reduced-motion CSS coverage with no universal duration override, and the single results-slot score entrance.
- Run the entire test suite once with no skipped tests and run the normal preview/build validation. Report results and changed surfaces; do not publish.
