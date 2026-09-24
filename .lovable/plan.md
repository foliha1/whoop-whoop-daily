# Optional sign-in with an email code

The custom 6-digit flow from the previous request is dropped. Nothing was built from it.

## What players see
- Playing stays open to everyone. No screen, share or invite asks you to sign in.
- The email box on results (and "Restore your streak" in the lobby) becomes **Sign in to save your score**: enter your email, get a 6-digit code, type it in (number keypad, `autocomplete="one-time-code"`), and you're done. There are no links and no passwords, so it works inside Instagram's in-app browser.
- You stay signed in on that device. Settings shows "Signed in as f•••@gmail.com" with **Sign Out** and **Delete Account**.
- "Playing as … Not you?" is replaced by the real signed-in state. An email with no sign-in behind it shows no history anywhere.

## Decision 1: consent for the daily reminder (you choose)
- **A. One box that promises both.** "Sign in and get the daily puzzle by email." Signing in adds you to the list, and the box says so plainly. It's simple, but in the EU consent then depends on sign-in, which is weak under GDPR because consent should be separate from the service.
- **B. Sign-in with a separate, unticked reminder opt-in (recommended).** A checkbox under the code field, unticked by default: "Also email me the daily puzzle." Only a ticked box sends you to ActiveCampaign, and the tick is stored with a timestamp. Settings gets a Daily Reminder on/off switch. This works in both the EU and the US.
- **C. Sign-in only, with the reminder offered later.** After you verify, a one-tap "Want the daily puzzle by email?" prompt appears on the confirmation step. It's cleanest for consent but adds one more tap.
- The pre-launch "Notify Me" box stays a reminder signup, since it's explicitly that.

## Decision 2: existing subscribers (you choose)
Everyone already on the list stays subscribed. Nothing about their list membership changes.
- **A. Quiet merge (recommended).** On their first sign-in they see "Welcome back — we found N games" and their full history, points and badges appear. The Settings reminder switch shows On.
- **B. Merge plus a re-confirm prompt.** Same as A, but the first sign-in also asks "Keep getting the daily puzzle?" (Yes / No thanks). This gives a clean consent record for older signups.
- On a new browser, until they sign in, a returning subscriber sees what an anonymous player sees. The fix for "zero on a new browser" is signing in.

## Identity rules
- Signed in: the account (`auth.uid()` on the server). Anonymous: `visitor_id`, as now.
- Every per-player function works out who the player is on the server, from the session only. Any email or user id sent from the client is ignored as proof.
- Email-as-identity linkage is retired: `get_subscriber_email`, `email_has_history`, `backfill_result_emails` and the email branches in the points, history and group functions. The email columns stay as stored data only.
- Replay block: a signed-in player who has already played today gets the already-played state on any device. The first-attempt rule applies everywhere (one result per puzzle, the earliest).

## First sign-in merge
This runs once, on the server, the first time an account signs in. It attaches:
1. every result under that email,
2. every result from the browser you're signing in on,
3. results from browsers already tied to that email through the subscriber record.

Duplicates per puzzle collapse to the earliest by the existing first-attempt rule, and nothing is deleted.

**How browsers link to accounts:** a new table `player_devices(visitor_id primary key, user_id, linked_at)`, plus a `user_id` column on `daily_results`. Every later sign-in on a new browser adds that browser and merges its results.

## Admin stays locked
`/admin` keeps its server-side allowlist check in every admin function. A player account passes the sign-in check but fails the allowlist, so it gets nothing. No roles are stored on accounts. A test confirms a non-allowlisted signed-in user is refused.

## Deleting an account
Settings → Delete Account → confirm. A server function removes the account, its device links, results, streak data, subscriber record and group memberships, and unsubscribes the email from ActiveCampaign. Anonymous rows on this browser are cleared too, and the browser starts fresh.

## Privacy policy updates
- Accounts are optional and use a one-time code sent to your email. There are no passwords, and we send a one-time code to confirm an email is yours before showing its history.
- What we store: your email, sign-in times, the browsers linked to your account, your results and stats, and your reminder choice.
- How to delete: Settings → Delete Account, or email hello@whoop-whoop.com. Deletion is permanent.
- Terms: "no account is required" becomes "an account is optional."

## Events
Added to the Daily events table: `signin_started`, `signin_code_sent`, `signin_verified` and `signin_failed` (with a reason: invalid code, expired, rate limited, or send error), plus `account_deleted` and `reminder_opt_in`.

## Admin dashboard
Retention is split into **Signed-in players** (by account) and **Anonymous visitors** (by visitor_id), with the same day-1, day-7 and day-30 figures, plus sign-in conversion from the events above.

## Groups (still hidden)
Groups uses the same rule: members are resolved by `auth.uid()` when signed in. At relaunch, a membership row gets `user_id`, and the first-sign-in merge attaches memberships from linked browsers. Until then the Groups code is only updated so it doesn't depend on the retired email functions.

## Sending codes
- Branded sign-in email templates are sent through `notify.whoop-whoop.com`. The template shows the 6-digit code only, with no link.
- Sign-in stays in code mode throughout, and signup is on (accounts are created on first code).
- Hourly send limit is raised once the domain is active.
- **What remains before real delivery:** the domain setup must be finished, meaning the DNS records are added where whoop-whoop.com is managed and verification has passed (this can take up to a few days). Until then, codes go through the shared development sender and are rate-limited.

## Not changing
Points values, tiers, decay, gameplay, Classic, share card, and Groups visibility.

## Technical details
- Migration: `player_devices` table (with grants and row-level security), `daily_results.user_id`, and a `resolve_player()` helper that returns (user_id or visitor_id). `save_daily_result`, `get_first_attempt`, `get_daily_results`, `get_streak`, `get_daily_stats`, `get_daily_percentile`, `get_whoop_points`, `whoop_points_rows` (identity = user_id when present), `log_daily_events` and the group functions are rewritten to use it. New functions: `link_device_and_merge()` and `set_reminder_consent(bool)`. New server function `delete-account` (service role) that also unsubscribes the email in ActiveCampaign. `ac-subscribe` is called only when consent is given.
- Client: an auth hook (`onAuthStateChange` and `getUser`); `signInWithOtp({ email, options: { shouldCreateUser: true } })` → `verifyOtp({ email, token, type: "email" })`; DailyEmailCapture, DailyEmailModal and DailyRecognition become the sign-in flow; SettingsSheet adds account rows.
- Tests: session-only identity (a spoofed email or id is ignored), the merge collapses to the earliest attempt, a signed-in replay is blocked across devices, a non-allowlisted user is refused by admin, deletion removes everything, and consent is never implied.
- Verification: fresh browser → sign in → history, points and badges restored; unverified email → nothing revealed.
