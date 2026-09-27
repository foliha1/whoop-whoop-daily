# Security pass 3 of 3: Classic usage events

## What I checked before writing this (live database + published site)

- `analytics_events` has one insert policy, "Anyone can insert analytics events", for anon and authenticated, with check `true`. This matches the brief.
- The only app code that writes to it is `trackEvent` in `src/lib/analytics.ts`. It sends one event per call, with `event_type`, `room_code`, `visitor_id` and `metadata`.
- The published site (whoop-whoop.com/classic.html bundle) sends exactly 8 event names: `classic_demo_opened`, `classic_demo_finished`, `classic_demo_skipped`, `room_created`, `room_joined`, `invite_link_clicked`, `game_started`, `game_completed`. The preview sends the same 8.
- Real rows so far (about 1,340): the largest metadata is 85 characters, with at most 2 keys. Room codes are 6 characters, except `invite_link_clicked`, which reaches 46 because it logs whatever code was in the invite link. Visitor ids are 36 characters.

## Things in the brief that don't match the current code

1. **No admin chart reads `analytics_events`.** The admin Classic card (`admin_classic`) reads `classic_results`. The How to Play card (`admin_howto`) and the Rejections card (`admin_rejections`) read `daily_events`. None of them change in this pass. So test 4 will check two things separately: the events still land in `analytics_events`, and the admin Classic card still counts the games (from `classic_results`).
2. **Solo games log no usage events today.** `game_started` and `game_completed` fire only in multiplayer, and the demo events fire for anyone. For solo, test 4 will check that the demo events are logged and that the result shows up on the admin page.
3. **Some names are declared but never sent.** `room_replayed` and `email_captured` are in the app's type list but nothing sends them. The `mp_howto_*` names (156 old rows) come from an earlier version and aren't sent anymore. `classic_result_rejected` is written only by the server's save functions, never by the app. None of these go in the allowed list. Old rows stay.
4. **The visitor id can't come from the server.** It's a random id stored in the browser, and the server has nothing to derive it from. It will stay a label: trimmed and format-checked, but never used for rate limits. Everything the server can know it sets itself: `created_at`, the IP-based limit and the signed-in user limit. The table has no user id column, and I won't add one in this pass.

## What gets built

### A. New server function `log_analytics_events(p_visitor_id text, p_events jsonb) returns integer`
- SECURITY DEFINER, `search_path = public`. REVOKE EXECUTE from PUBLIC, anon and authenticated, then GRANT EXECUTE to anon and authenticated.
- Always returns the number written, 0 or more. It never raises an error for bad input, so a rejected call looks the same as a normal one.
- Uses the same pattern as the existing `log_daily_events`.

### B. Allowed event types
`classic_demo_opened`, `classic_demo_finished`, `classic_demo_skipped`, `room_created`, `room_joined`, `invite_link_clicked`, `game_started`, `game_completed`. Any other type is dropped quietly.

### C. Size limits
| Field | Limit | Over the limit |
|---|---|---|
| Events per call | 10 | extras ignored |
| event_type | must exactly match the list | dropped |
| room_code | 16 characters, trimmed | trimmed (keeps bad-invite codes useful) |
| visitor_id | 64 characters, trimmed; empty means the whole call is dropped | trimmed |
| metadata | must be a JSON object, at most 8 keys and 512 bytes as text | dropped entirely (not trimmed) |

The metadata limit of 512 bytes is about 6 times the largest real row.

### D. Rate limits (per UTC day, using the existing `rl_hit` counters)
- Per IP address (`request_ip()`): 2,000 events.
- Per signed-in user (`auth.uid()`, only when signed in): 500 events.
- Nothing is keyed on the visitor id, so rotating it doesn't help.

How much headroom: a six-person family table on one wifi, playing 20 games with rematches, sends roughly 6 × (1 join + 20 starts + 20 completions) plus a few demo events, about 300 events. That's well under 2,000.

### E. Server-set fields
`created_at` uses the column default, and the function ignores any client value. The client can't supply `id` either.

### F. Rejections are counted, not logged row by row
Each dropped event increments one daily counter per reason in the existing `write_limits` table (bucket `analytics_dropped`, keyed by reason: `unknown_type`, `bad_metadata`, `over_batch`, `rate_ip`, `rate_user`, `no_visitor`). An attacker can make that counter bigger, but can't add rows. The counters themselves aren't rate-limited, because they update in place.

### G. App switch and publish-day step
- `trackEvent` calls `log_analytics_events` with a one-event batch. It stays fire-and-forget, so players see nothing different.
- The old insert policy stays for now, so tabs still running the old app keep logging until you publish.
- A new doc, `docs/post-publish-analytics-events.md`, covers publish day:
  1. Check that the published bundle no longer contains `from("analytics_events")`.
  2. Drop the policy "Anyone can insert analytics events".
  3. Also revoke INSERT on `analytics_events` from anon and authenticated.
  4. Run test 5.

### H. Other tables anon or authenticated can insert into directly
From a live query of every insert and all-commands policy in `public`:

| Table | Policy | Who can actually insert |
|---|---|---|
| analytics_events | Anyone can insert, check `true` | **anyone (this pass)** |
| email_send_log | check `auth.role() = 'service_role'` | server only |
| email_send_state | same check (all commands) | server only |
| email_unsubscribe_tokens | same check | server only |
| suppressed_emails | same check | server only |

- `daily_events` has no insert policy. It's written only through `log_daily_events`, which already has an allowed list and per-IP limits. That function also has a per-visitor limit keyed on a client id. This is harmless because the IP limit still applies, but I'd consider it for a later tidy-up rather than change it now.
- Every other table has no insert policy.
- The four email tables also keep leftover INSERT grants to anon and authenticated, which their policies block. I'd revoke those grants later, but I won't touch them in this pass: they're safe as they are, and the emails run through them.
- So the only fix in this pass is `analytics_events`.

## Tests
- **Fast automated test** (`src/test/analyticsEvents.test.ts`): `trackEvent` calls `log_analytics_events` with the right shape, never inserts into the table directly, and never throws.
- **Live database checks through the function**, with a counter read before and after each:
  1. An unknown type returns 0 and writes no row.
  2. Metadata over 512 bytes, or with more than 8 keys, is dropped (returns 0). A 30-character room code is trimmed to 16.
  3. Pre-fill today's IP counter for the test machine's IP to just under 2,000, then send events under 5 different made-up visitor ids. Once the counter reaches the limit, every one is refused. Afterwards, reset that counter row.
  4. Live preview: a 2-browser Classic game and a solo game. `room_created`, `room_joined`, `game_started`, `game_completed` and the demo events arrive with server times, and the admin Classic card counts both games.
  5. Written into the doc for publish day: a direct insert as anon gets refused.
- Full suite in one pass. Afterwards, I delete the test rows and tables and list them, as last time.

## Technical details: files and functions touched
- New migration `drizzle/migrations/0026_log_analytics_events.sql`: creates `log_analytics_events`, with its grants. No table or policy changes.
- `src/lib/analytics.ts`: switched to the new function, and the unused type names removed.
- `src/integrations/supabase/types.ts`: regenerated.
- New `src/test/analyticsEvents.test.ts`.
- New `docs/post-publish-analytics-events.md`.
- `AGENTS.md`: one rule — usage events are written only through allow-listed, rate-limited server functions.
- Not touched: `log_daily_events`, the admin functions, the email tables, gameplay or UI.
