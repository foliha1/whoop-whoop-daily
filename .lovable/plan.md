# Fix the post-verification reminder prompt

## Confirmed cause
- `DailySignIn` calls its parent `onSignedIn` immediately after code verification, before showing the reminder choice.
- On the results screen, that marks the player subscribed/signed-in, so the entire email capture unmounts and takes the reminder with it.
- In the restore dialog, the same callback starts the dialog's success auto-close timer before the reminder choice is made.

## Implementation
- Delay the parent success callback until the first-time player taps either reminder action.
- Keep immediate completion for existing subscribers and previously answered players, preserving quiet merge and no re-ask behavior.
- While the reminder choice is visible, disable every unrelated dismissal path: no close control and no Escape dismissal in the restore dialog.
- Replace the prompt with:
  - Copy: “We'll send you the daily puzzle.”
  - Primary: “Sounds good”
  - Secondary: “No thanks.”
- Keep both actions explicit and persist the same consent boolean and timestamp through the existing reminder RPC.
- Rename consent event choice values from generic `yes` / `no` to `sounds_good` / `no_thanks`, while retaining the existing event and source.

## Verification
- Add regression coverage proving the parent is not notified before a choice and the prompt survives rerenders.
- Test affirmative, decline, existing-subscriber, previously-answered, and restore-dialog non-dismissal behavior.
- Run focused tests, the full suite, and check the preview build diagnostics.

## Scope
- No changes to gameplay, points, tiers, Classic, Groups visibility, publishing, or the sign-in flag.
