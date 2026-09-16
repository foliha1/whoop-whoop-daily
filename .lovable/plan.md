# Route code-splitting and Daily load reduction

## Build
- Replace all nine eager page imports in `src/App.tsx` with `React.lazy` imports.
- Wrap the existing route switch in one `Suspense` boundary whose fallback is an empty, full-height themed cream ground.
- Keep every path, redirect, animation, and `DebugOnlyRoute` wrapper unchanged.

## Daily isolation
- Audit `DailyPage`'s static dependency graph for Classic, multiplayer, results, demo, and admin modules.
- Remove only route-loading coupling if found; do not alter page or game behavior.

## Verification
- Produce a production bundle report with route chunk names and raw/gzip sizes.
- Compare the JavaScript required by a first visit to `/` before and after the change.
- Confirm `AdminPage` is isolated and no Classic/admin modules are present in Daily's route chunk.
- Fetch the generated `/classic.html?r=CODE` without JavaScript and confirm its Classic title and social metadata remain intact.

## Technical details
- Preserve the existing Vite Classic prerender plugin and static `classic.html` output.
- Use the existing semantic surface token for the blank Suspense fallback; no spinner or loading text.
