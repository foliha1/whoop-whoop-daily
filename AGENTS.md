# Architecture decisions

- Stage non-critical media after first paint and deduplicate image decode promises, so entry screens never compete with full game assets.
- Classic host timers are absolute deadlines (src/lib/hostDeadlines.ts); on resume, queued grants/intents run first by server time, overdue deadlines drain in order, one state is sent, and heartbeat liveness resets — so a returning host neither loses claims nor skips players who stayed.
- Classic channel messages are signed by the sender's per-join ECDSA key (server messages by the server key); receivers get keys only from the server — because the Realtime channel is public.
