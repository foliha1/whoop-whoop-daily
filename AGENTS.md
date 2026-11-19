# Architecture decisions
- Pre-order usage events are emitted only on production builds at the three public site hosts; development and preview are excluded so conversion reports stay free of testing traffic.
- Pre-order checkout creates a fresh Storefront API cart and opens in a new tab (same tab only if blocked); public proof exposes a device-linked aggregate; conversion counts reuse the capped logger and admin date reports.
- The physical rulebook uses a presentation-only full-rules section and original card/die assets, not seasonal substitutions, so bag QR readers see the printed deck without touching gameplay.
- Subscriber activity is written server-side after a saved signup, with masked addresses and independent AC/seed outcomes; admin-only date-filtered reads never change signup success or numbering.
- ActiveCampaign Daily numbering is seeded by the existing signup pipeline and advanced by its delivery automation, not a backend daily sync, to preserve subscriber-local rollover and avoid competing writers.
- Admin downloads share one collapsed accordion using existing export handlers; subscriber email confirmation stays inside it to preserve the personal-data safeguard.
- Admin date presets reuse inclusive local-calendar date inputs; charts scale existing read-only event counts without changing rates, RPCs or CSV exports, so visual comparisons never imply new cohort measurements.
- Admin Solo/Together reports use an additive admin-only mode aggregate with the existing created-at date window; game-wide claims are labelled explicitly because Solo includes the bot, and wide report tables scroll within their own sections.
- Lobby subscription success remains in the shared email dialog until dismissed; only confirmed signup triggers subscriber persistence, keeping retries and unverified addresses separate from success.
- About uses the shared scrollable Daily frame and existing card artwork as an editorial page in both launch states, keeping its presentation independent of gameplay and signup flows.
- ON Classic tutorial tips occupy a separate flow row from die/actions and are replaced per step; compact tutorials scroll instead of overlapping controls.
- ON gameplay roll cubes render at native hero resolution and scale down into the tray; server-clock animation deadlines and the OFF rendering remain unchanged.
- Expanded play statistics use identity-scoped local match records deduplicated against a caller-only server aggregate; Solo measurements are collected read-only by seat, because game-wide claims include the bot and cannot be used as player accuracy.
- Hosted-table history is captured at server room creation and retained independently of room cleanup, so rematches never inflate tables hosted.

- Daily How to Play selects a scripted presentation through the runtime umbrella gate and shares the legacy seen flag; tutorial scripts never dispatch engine actions or persist attempts.

- Screen music uses the runtime umbrella flag and a shared screen policy; game pages retain ownership of silence/results and How to Play overrides, while other ON routes explicitly restore entry music.

- Solo bot claim deadlines are anchored to the committed roll's full animation completion and checked again at dispatch, so waiting to roll or an overdue reaction cannot consume the player's grace.

- Stage non-critical media after first paint and deduplicate image decode promises, so entry screens never compete with full game assets.
- Classic host timers are absolute deadlines (src/lib/hostDeadlines.ts); on resume, queued grants/intents run first by server time, overdue deadlines drain in order, one state is sent, and heartbeat liveness resets — so a returning host neither loses claims nor skips players who stayed.
- Classic channel messages are signed by the sender's per-join ECDSA key (server messages by the server key); receivers get keys only from the server — because the Realtime channel is public.
- Usage events are written only through allow-listed, rate-limited SECURITY DEFINER functions (log_analytics_events, log_daily_events), never direct table inserts — because anon keys are public.
- Player names shown to peers come from server-resolved profiles or validated social RPCs, never Realtime presence metadata, because presence is client-controlled.
- Umbrella route and static-head cutovers derive only from `src/launch.config.ts`; admin preview changes runtime UI but never crawler-visible build output.
- The launched umbrella Home reuses the Classic idle entry frame; Home-only destinations extend that frame rather than creating a separate layout.
- The Home plain-logo motion is a checked-in crop of the Classic Lottie with its suffix asset removed, so runtime code only loads final variants.

- Classic in-game controls use the shared 44px header slot: launch ON orders Leave, readout, Settings; launch OFF preserves readout, Settings, Leave.
- The launched Daily holds the engine in READY behind a non-dismissible start dialog; only its Start action enters the existing deal/study sequence, so pre-start exits never create attempts.
- The Daily's pre-start HUD shows no round rule (src/pages/DailyPage.tsx readout returns a blank for READY), because the seeded roll is already known before Start and the memorize phase depends on it staying unseen.
- ON-only pattern rails reserve the shared top-left 44px control plus a token gap and remeasure the remaining rail, so pattern edges always end on complete cells.

- Results score tiles always paint their numbers and captions with themed ink tokens; fixed warm black is reserved for surfaces that are provably light in both themes (the orange tier-up banner), because a theme-dependent tile can otherwise render text invisible.
- The /rules page groups content into numbered chapters via src/components/rulesLayout.tsx; only Quick Start and the Right/Wrong pair are boxed, so the rulebook keeps an open editorial rhythm.
- Build-time crawler content stays in the HTML but is hidden by a synchronous head-script class in JavaScript-enabled browsers, so deferred application loading cannot flash the fallback; non-JavaScript readers retain the text and shared FAQ data.
- Skin, Spook, Holo Day and Daily #100 rules live in src/lib/AGENTS.md.
- Streak badges (src/lib/streakBadges.ts) are derived on Your Stats from the identity-scoped get_daily_results history using the longest run ever, never stored separately, so they backfill earlier streaks, survive broken streaks and follow signed-in players across devices; names and criteria for every badge live in src/lib/badgeCatalog.ts, and the All Badges grid shows art only for earned badges.
