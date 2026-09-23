# Loading states for Your Stats and Groups

## What changes

- Show the existing flipping WHOOP! WHOOP! card while Your Stats loads the player's score, instead of leaving the page's content blank. Keep the title, Back link, pattern strips, existing error message, and normal page content once the score read settles. The optional population and daily-stat details can still appear when available rather than delaying the whole page.
- Replace the Groups page's plain “Loading…” line with the same card while the group list loads or refreshes. Keep Back available, hide stale list and membership-dependent actions during a refresh, and preserve the prefilled join dialog for `/groups?join=CODE` even while the list is loading.
- Use the flipping card for these two pages while their page code is first being opened, so the transition from navigation through data loading does not show a blank screen. Preserve the existing load presentation on other pages.
- Give each loader a page-appropriate screen-reader label; retain the static card for reduced-motion users. After loading, existing section-entry motion and error/empty states remain in place.

## Technical approach

- Extract the visual card from `ClassicLoading` into a reusable, token-styled loader with a contextual accessible label and a layout option for full-screen versus in-page use. Reuse its existing card assets and `ww-loading-flip` animation; keep Classic's current appearance intact.
- Add page-specific lazy-loading fallbacks for `/you` and `/groups`, and use the same loader for their existing `loading` flags (`useWhoopPointsState` and `useMyGroups`). No changes to scoring, group operations, or game logic.
- Verify initial navigation, slow data reads, completed/error/empty states, join-code prefilling, group-list refresh, light/night themes, 360px/mobile and desktop layouts, and reduced motion. Add focused tests for the loading-to-content handoff and accessible labels.
