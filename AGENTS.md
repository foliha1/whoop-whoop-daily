# Architecture decisions
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
- ON-only pattern rails reserve the shared top-left 44px control plus a token gap and remeasure the remaining rail, so pattern edges always end on complete cells.
