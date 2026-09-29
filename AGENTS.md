# Architecture decisions

- Stage non-critical media after first paint and deduplicate image decode promises, so entry screens never compete with full game assets.
- Classic host timers are absolute deadlines (src/lib/hostDeadlines.ts); on resume, queued grants/intents run first by server time, overdue deadlines drain in order, one state is sent, and heartbeat liveness resets — so a returning host neither loses claims nor skips players who stayed.
- Classic channel messages are signed by the sender's per-join ECDSA key (server messages by the server key); receivers get keys only from the server — because the Realtime channel is public.
- Usage events are written only through allow-listed, rate-limited SECURITY DEFINER functions (log_analytics_events, log_daily_events), never direct table inserts — because anon keys are public.
- Player names shown to peers come from server-resolved profiles or validated social RPCs, never Realtime presence metadata, because presence is client-controlled.
- Umbrella route and static-head cutovers derive only from `src/launch.config.ts`; admin preview changes runtime UI but never crawler-visible build output.
- The launched umbrella Home reuses the Classic idle entry frame; Home-only destinations extend that frame rather than creating a separate layout.
- The Home plain-logo motion is a checked-in crop of the Classic Lottie with its suffix asset removed, so runtime code only loads final variants.

- Classic in-game controls use the shared 44px header slot: launch ON orders Leave, readout, Settings; launch OFF preserves readout, Settings, Leave.
