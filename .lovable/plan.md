# Loading-speed audit batch

## Scope

Improve startup loading only. Preserve gameplay, timings, animation behavior, colors, points, sign-in, and Groups visibility. Do not publish.

## Implementation

1. **Stage game art**
   - Add targeted preload/decode helpers with deduplication.
   - Daily loads the card back and three die faces immediately; after the ready screen paints, idle-load and fully decode today’s seeded nine faces before Play can reveal them; after Play, load the remaining faces during study.
   - Classic loads its board art while players are in the lobby, not on the entry screen.

2. **Defer logo animation**
   - Remove module-scope Lottie/runtime and Daily JSON loading.
   - Paint the active static SVG first; after first paint, load only the active variant’s runtime and JSON when reduced motion is off. Static fallback and the existing animation remain unchanged.

3. **Remove Classic’s second loading step**
   - Import `MultiplayerWindow` directly inside the already-lazy `MultiplayerPage`; keep optional intro/demo/how-to-play code lazy.

4. **Defer music warm-up**
   - Schedule each active theme after first paint during idle time, with first user interaction as the earlier fallback. Preserve audio unlock, files, volume, and playback behavior.

5. **Gate Daily results data correctly**
   - Keep streak loading on the ready screen.
   - Load percentile and Whoop Points only once a result exists/results are opening, and re-read after save as today.
   - Stop requesting lifetime stats from Daily because that page does not render them.

6. **Reserve Your Stats layout**
   - Keep points, tier population, Daily stats, and badge art parallel.
   - Give late sections stable, final-sized quiet placeholders so values replace them without moving surrounding content.

## Verification and reporting

- Add focused regression tests for preload stages, decode-before-reveal, active-only/reduced-motion logo loading, single-step Classic loading, deferred music, data gates, and stable Stats placeholders.
- Run the full suite once with no skipped tests and confirm a clean preview build.
- Before application edits, build and serve the current production output and capture the cold mobile throttled-4G baseline for `/` and `/classic.html`. After implementation, rebuild and repeat with the same script/profile, reporting requests, transferred bytes, and Play visible/usable time before versus after. Development-server numbers are excluded.
- Run bundle analysis and report, without removing: TanStack Query, both toast systems, and the shell tooltip provider. Current source audit indicates Query has a provider but no query hooks; both toast systems have consumers; tooltip primitives are used by the sidebar path.
- Report production cache headers without changing hosting: HTML is currently no-cache; hashed JS/CSS are one-year immutable; fonts, card/badge SVGs, and OGG files currently have ETags but no `Cache-Control` header.
- Do not publish until approved.
