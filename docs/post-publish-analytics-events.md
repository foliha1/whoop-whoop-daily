# Post-publish: Classic usage events (security pass 3)

The app now writes usage events only through `log_analytics_events`
(migration 0027). The old open insert policy stays until publish so tabs on the
old app keep logging.

## Publish day

1. Confirm the published bundle has no direct table writes:
   fetch every JS asset of https://whoop-whoop.com/classic.html and check that
   `"analytics_events"` does not appear (the new code only names the RPC).
2. Drop the policy and the table grant:

   ```sql
   DROP POLICY "Anyone can insert analytics events" ON public.analytics_events;
   REVOKE INSERT ON public.analytics_events FROM anon, authenticated;
   ```
3. Test: a direct insert as anon must be refused (401/403 or RLS error):

   ```bash
   curl -s -X POST "$URL/rest/v1/analytics_events" -H "apikey: $ANON" \
     -H "Content-Type: application/json" -d '{"event_type":"room_created"}'
   ```
   Then play one Classic game on the published site and confirm its
   `room_created` / `game_started` / `game_completed` rows arrive.

## Later, not publish day

- The four email tables (`email_send_log`, `email_send_state`,
  `email_unsubscribe_tokens`, `suppressed_emails`) still carry leftover INSERT
  grants to anon and authenticated. Their policies already block those roles, so
  this is tidy-up only: revoke the grants after checking the email functions
  run as the server role.
- `log_daily_events` has a per-visitor daily limit keyed on the client-supplied
  visitor id (the per-IP limit still applies). Consider replacing it with a
  per-signed-in-user limit on `auth.uid()`, matching `log_analytics_events`.
