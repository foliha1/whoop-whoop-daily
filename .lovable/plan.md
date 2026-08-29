# Hide Groups (keep the work)

Hide every player-facing Groups access point while keeping all code, tables, and RPCs intact, so multiplayer work can ship first. Re-enabling later is a small revert.

## Current access points

1. `/groups` route — registered openly in `src/App.tsx:51`.
2. Ready-screen chip — "Your groups" Users icon linking to `/groups` (`src/pages/DailyPage.tsx` ~line 1155, `ready-groups-chip`).
3. Results-screen line — `DailyGroupsLine` mount (`src/pages/DailyPage.tsx:909`); already renders nothing for signed-out users, but signed-in users would still see it.

## Changes

1. **Gate the route**: wrap `/groups` in the existing `DebugOnlyRoute` component (same pattern already used for `/play`, `/about`, `/typography`). Without `?debug=1` the URL renders the 404 page; with it, the full Groups UI works untouched for testing.
2. **Hide the ready-screen chip**: remove (or comment out with a clear `HIDDEN:` note) the groups chip block in `DailyPage.tsx` so the lobby returns to its prior layout.
3. **Hide the results line**: remove the `DailyGroupsLine` mount (with the same `HIDDEN:` note) so the results screen is identical for everyone again.

## What stays untouched

- All backend work: `daily_groups`, `daily_group_members`, RLS policies, and all RPCs remain live in the database.
- All Groups source files (`GroupsPage`, `DailyGroupBoard`, `DailyGroupModals`, `DailyGroupSignIn`, `useGroupAuth`, `useMyGroups`, `dailyGroups.ts`) and their tests remain in the repo and keep passing.
- Magic-link auth itself stays; it's just unreachable from the UI until re-enabled.

## Verification

- `/groups` without `?debug=1` → 404 page; with `?debug=1` → full Groups flow still works.
- Ready screen and results screen show no Groups UI at any viewport; lobby still scroll-free at 480px.
- Existing tests still pass; adjust `src/test/groupsGate.test.tsx` only if it asserts the now-removed mounts.

## Re-enable later

Unwrap the route in `App.tsx` and restore the two mounts in `DailyPage.tsx` — nothing else to rebuild.
