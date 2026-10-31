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

- Skins remap card art at render time via skinArt; card data and network payloads always carry classic art. The Spook palette shift is frozen at page load: SPOOK_AT_LOAD (src/lib/skin.ts) drives RAW in tokens.ts and data-skin="spook" on <html> (set by initSkin next to initTheme), so colors never change mid-game; text/icons on blue and red fills use COLORS.onBlue/onRed, blue/red text on the page uses COLORS.blueText/redText. Card-face recolouring is independent of UI fill colours to preserve colour-blind distinction.
- Seasonal lobby artwork and bylines use SPOOK_AT_LOAD with theme-resolved static logos capped to the existing lockup slot; seat accents live in RAW tokens, keeping skin-off presentation and Daily artwork unchanged.
- Non-board card renderers subscribe with useSkin and remap only displayed/preloaded URLs through skinArt; card-colour copy uses colorWord with SPOOK_AT_LOAD so words match the frozen palette. Image readiness keys use JSON encoding rather than comma splitting because skin face data URLs contain commas.
- Spook decorations (ghost, cobwebs) render only under [data-skin="spook"]: the root-mounted SpookGhost pauses via setSpookGhostPaused during Daily runs (STUDY→WHOOPED) and live games (phase ≠ GAME_OVER), finishing its current trip first — it must never float over cards being memorised. Cobwebs are mask-image pseudo-elements with isolation + z-index:-1 so they stay behind content; panels get overflow:hidden only under the skin.
