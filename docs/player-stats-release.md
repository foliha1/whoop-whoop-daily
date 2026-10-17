# Expanded player statistics

## Scope
- ON/admin-preview only: Daily, Solo, Together tabs. Launch config remains false. Nothing published; Groups route and visibility unchanged.
- Daily retains existing score, tiles, ladder, earning information and badges. No additional Daily metrics.
- Solo: completed matches, target victories, win rate, human claim accuracy, quickest winning-claim time, human pairs collected.
- Together: completed matches, first-place wins (competition-ranking ties count), win rate, tables created. Rematches do not count as new tables.

## Persistence
- Live additive migration: `drizzle/migrations/0037_player_match_stats.sql`.
- Existing result writes and gameplay rules remain unchanged. Optional Solo measurement write follows the existing result save.
- New reads use the caller's authenticated user ID; no user ID argument and no raw seat identities returned. Both stats functions allow authenticated/service roles, not anon. Hosted-table history is service-only with RLS enabled.
- Signed-in table creation now captures hosted-table history server-side, including OFF clients. This is an invisible additive live change and retains history after room cleanup.
- Existing account-owned completed results populate played/won counts. Older Solo rows have no trustworthy human claim or winning-claim timing data; precision tiles stay unmeasured rather than using bot-inclusive game totals.
- Precision totals include measured completed games only. Past unmeasured claims cannot be reconstructed. Prior hosted rooms are recoverable only where a completed verified result exists; abandoned/deleted historical rooms are not reconstructed.
- Device records update at GAME_OVER and deduplicate by game ID against remote results. Anonymous records remain device-only and are not silently merged into a signed-in account. No anonymous sign-in added.
- Existing result recorder is still best-effort; a failed server save can leave a device-only record. This work does not introduce a Classic outbox or claim server-authoritative gameplay proof.

## Verification
- 674 tests pass across 67 files, including player-only claims, metric arithmetic, missing historical data, deduplication, joiner wins, tied first place, rematches and OFF isolation.
- Latest preview build: OK.
- Signed-in admin preview read existing account data successfully: Solo 8 completed / 1 win / 13%, Together empty. No test data written to that account.
- Three tabs exercised at 390x844, 360x640, 390x600 and 1280x1800 in light/night; no horizontal overflow or browser page errors. Mobile uses two columns to keep words intact. Existing motion primitives and Radix keyboard tab controls retained.
- Existing OFF launch and product metadata tests pass. Head files, launch config, manifests and static-head scripts were not changed; no production-byte build comparison was performed.
- New-game Solo measurements, hosted-table creation and Together completion were tested with hooks, not a real completed multiplayer game. Cross-device readback after a new measurement write remains unverified. Existing authenticated aggregate read was verified, not substituted with fixture data.
- Screenshots retained under `/tmp/browser/stats/`.