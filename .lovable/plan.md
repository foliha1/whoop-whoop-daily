# Classic exit position and Daily signup copy

## Changes
- Keep the existing Classic in-game header and leave confirmation behavior, but in the launch-enabled experience place the 44×44 exit control first, at the top-left of the game column.
- Rebalance the round/card readout and Settings control so the control row remains tappable and uncluttered at 390×844 and 360×640.
- Preserve the current top-right exit placement exactly while the launch switch is OFF.
- Restore the Daily-result subscribe popup body to its original reminder copy, while retaining the restore sentence for restore mode and the Home-specific reminder sentence for Home.

## Verification
- Add regression coverage for ON/OFF Classic exit ordering and all three email-popup copy cases.
- Run the full suite and OFF byte-for-byte checks without changing the launch switch.
- Capture before/after Solo and three-player Together screenshots at 390×844 and 360×640 in light and night modes, and inspect all images for overlap and tap-target clearance.

## Technical details
- Use the existing umbrella switch passed into the shared Classic game view; no new feature flag.
- Keep the existing leave callback and confirmation modal unchanged.
- Record any durable structural decision in `AGENTS.md` only if implementation introduces one.
