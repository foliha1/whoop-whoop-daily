# Step 2: One WHOOP! WHOOP! home

## Current state and corrections to the brief

- `/` and `/today` both render `DailyPage`; `/daily` does not exist. `/classic`, `/classic.html`, and `/classic/:roomCode` render Classic, while invite links deliberately use the real static file `/classic.html?r=CODE`. `/you` is separate and stays so.
- `index.html` contains Daily crawler tags. `scripts/classicHead.mjs` creates `classic.html`, `classic/index.html`, and `play/index.html` with Classic tags. React Helmet changes tags after load, so it does not solve crawler previews.
- Lovable’s SPA fallback has previously won over extensionless directory indexes. I will therefore emit an exact static `daily` HTML asset for `/daily`, plus `daily/index.html` and `daily.html` fallbacks, and verify the served `content-type`, canonical, title, description, image, and manifest before cutover. Root `index.html` becomes the Home document. Classic’s working `.html` document and invite behavior remain unchanged.
- The long `LandingPage` already contains marketing, Daily email capture, and Solo/Multiplayer links, but it is not routed. It cannot fit the requested home at 360×640 and will be replaced by the compact three-card home rather than extended.
- Classic’s display name is currently only `ww_display_name` in local storage, capped at 6 characters. It is sent in untrusted Realtime presence and is not stored in `room_members` or `room_seats`. Signed-in accounts have no profile/name table. Solo currently displays `You`. Daily Groups reuse the local name and persist a client-supplied name through `create_daily_group`/`join_daily_group`; those are additional server surfaces that must be fixed.
- The current Classic exit is top-right, not top-left, and Daily has no equivalent persistent in-game exit. The shared chrome will move the exit to the requested top-left position without changing its confirmation behavior.
- Reminder-email delivery/campaign content is not in this repository; only signup, consent, and auth email code is here. The ActiveCampaign reminder destination must be checked and changed operationally to `/daily`; it cannot be claimed complete from a repository edit alone.
- Solo does not currently use the global name, and `/you` and Settings do not currently offer name editing.

## Proposed release order

### Part 1 — Global name and server enforcement

Add this independently first so Felix can test name carryover, account syncing, Groups, and two-browser Classic before any route changes.

1. Keep `DISPLAY_NAME_MAX = 6` so existing Classic names carry over unchanged. Signed-out names remain in `ww_display_name` on that device. Signed-in names live in a new `player_profiles` row keyed only by server-derived `auth.uid()` and follow the account across devices.
2. On a signed-in account’s first profile read, seed from the existing local Classic name only if the account has no profile; validate it server-side first. Later devices always receive the account name and cannot overwrite it accidentally. Explicit edits in Your Stats or Settings call `set_my_display_name`.
3. Add an authoritative 5-argument `join_room_session(..., p_display_name)` alongside the published 4-argument function for rollout compatibility. It ignores the candidate for signed-in callers and reads their profile; signed-out callers’ candidates are normalized and checked. It stores the accepted name on `room_members`; seat registration copies that server value to `room_seats`.
4. Realtime presence becomes liveness/public-id only. A new key-protected `room_member_names` RPC returns canonical names to room members, so another browser cannot spoof a visible name by editing presence metadata.
5. Replace `create_daily_group` and `join_daily_group` bodies so signed-in names come from `auth.uid()` → `player_profiles`, and signed-out candidates pass the same authoritative filter before reaching `daily_group_members`. Group titles are not player display names and remain unchanged.
6. Solo never asks for a name: it displays the global name when one exists and `You` otherwise. Daily never asks. Classic and Groups ask only when the player first enters a social flow and has no resolved name.
7. Add the same name editor to Your Stats and the shared Settings sheet. Signed-out saves locally; signed-in saves to the account. Rejected names show exactly `Try another name.`
8. After this part is published, follow a small post-publish checklist: confirm the published bundle uses the 5-argument join, revoke the old 4-argument overload from PUBLIC/anon/authenticated, and test that raw presence names are ignored.

### Part 2 — Route, home, Daily-entry, metadata, and install cutover

Build this separately if useful, but do not publish it alone. Parts 2 and 3 are one publish unit: root metadata, `/daily`, all Daily share destinations, and Home navigation must go live together.

1. Route `/` to a rewritten compact `HomePage`; route `/daily` to `DailyPage`; make `/today` redirect to `/daily` while preserving every query parameter. Keep `/you`, Classic routes, and `/classic.html?r=CODE` unchanged.
2. Home has the generic WHOOP! WHOOP! logo and three equal cards. Proposed short copy:
   - `Play Daily #N` / `See Today’s Daily` — “Nine cards. Ten seconds. Remember.”
   - `Solo` — “Play the full game on your own.”
   - `Play with Peeps` — “Start a table or join your people.”
   Daily is orange with warm-black text; Solo blue/cream; Peeps red/cream. Measured contrast is 6.53:1, 4.66:1, and 4.55:1 respectively, unchanged in night mode because these use `RAW` token pairs.
3. Cards stack Daily/Solo/Peeps on narrow screens and use one equal row at `min-width: 769px`. The compact layout budget fits 360×640 without page scrolling; browser tests will enforce that rather than relying on the estimate.
4. The Daily card reads the current puzzle and attempt state. Before play it says `Play Daily #N`. After the first attempt it remains enabled, says `See Today’s Daily`, opens the stored/server-restored result ready to share, and shows `Next puzzle in Nh` from a minute-updated local-midnight deadline.
5. `/daily` opens the board shell at a `Tap to Start` prompt. That tap—not mount—unlocks audio and starts the existing deal/study state transition. New players see the existing onboarding first. Existing reducer phases and the stable `useDailyGame` timers remain untouched; no study/game timer will be moved into a render-dependent effect.
6. Solo routes directly to its game with no name screen. Peeps opens one chooser with `Start a table` and `Join a table`; name collection occurs only after that choice if needed. Invite links bypass the chooser and proceed directly to their room/name requirement.
7. The generic logo is removed from non-home UI, including old Daily ready and Classic idle lockups.
8. Root static tags become exactly: title `WHOOP! WHOOP!`; description `The memory game where the rules keep changing. Play the Daily, go Solo, or play with friends.`; canonical `/`; and clearly named `og-home-placeholder-1200x630.png`. The exact `/daily` HTML keeps today’s Daily title/description/image/canonical. Classic static tags remain unchanged.
9. Add `home.webmanifest`, named `WHOOP! WHOOP!`, starting at `/`, with clearly named placeholder home icons. Root points to it. Keep `daily.webmanifest` and `classic.webmanifest` at their existing URLs so installed products update rather than break; Daily’s start URL becomes `/daily`, Classic remains `/classic.html`. A Daily page points to the legacy Daily manifest; Classic keeps its legacy manifest.
10. Capture attribution on Home before navigation and forward the current query string to the selected destination. Old `/?utm_…`, `?ref=…`, and `?i=…` links therefore land on Home, remain attributable, and carry Daily invite context when Daily is chosen.

### Part 3 — Destinations, navigation, analytics, and final hardening

1. Change every current Daily destination to `/daily`:
   - result share URL, share caption, text fallback, and Daily invite URL;
   - Daily canonical/OG/Twitter URL;
   - Classic result footer and Classic idle “Looking for Daily?” link;
   - Support page `Play Now` and game-return links;
   - legal-page “Back to the daily” link;
   - Groups and Your Stats result-return paths;
   - `/today` alias, sitemap entry, and Daily manifest start URL;
   - the external ActiveCampaign reminder link, verified separately because it is not in this repo.
   Privacy/Terms links, `/groups?join=`, auth-email asset URLs, Classic invites, and generic Home links do not change.
2. Add a shared 44×44 Home icon at top-left on every non-home, non-playing screen with visible icon and screen-reader label `Home`. During Solo or multiplayer play, use the X in that exact slot and preserve the current leave confirmation. Before the Daily's `Tap to Start`, show Home and leave without cost. Once study starts, replace it with X; confirm with title `Leave today's Daily?`, body `You only get one try a day. If you leave now, this run ends and the rounds you haven't finished count as unsolved.`, primary/default-focus `Keep Playing`, and destructive `Leave`. Leaving saves the first attempt with unfinished rounds unsolved, keeps the streak, and returns Home so the Daily card offers `See Today's Daily`. Match this rule when the tab/app closes mid-run as far as browser lifecycle delivery permits.
3. Keep stats placement and the How-to chooser out of this step. The only `/you` addition is the specifically requested name editor. Existing scoring, points, tiers, Groups visibility, and sign-in flag remain unchanged.
4. Extend `log_analytics_events`’s allowlist from the existing eight events to these twelve:
   `classic_demo_opened`, `classic_demo_finished`, `classic_demo_skipped`, `room_created`, `room_joined`, `invite_link_clicked`, `game_started`, `game_completed`, `home_viewed`, `home_daily_tapped`, `home_solo_tapped`, `home_peeps_tapped`.
   Limits, identity handling, rejection behavior, and grants remain exactly as in pass 3. No direct inserts return.

## Current Daily-ready content and its destination

- Daily logo: Home only.
- Date/puzzle context and streak: compactly retained in the Daily `Tap to Start` prompt for now; broader stats placement waits for step 3.
- Played badge/CTA: replaced by the Home card’s dynamic title and countdown; `/daily` opens the result directly when already played.
- How to Play: first-player gate stays before start; reference remains in Settings.
- Settings: stays available through shared screen chrome.
- Recognition/restore/sign-in: remains in Settings and the existing result save flow; it is not placed on Home.
- Prelaunch `Get the First Daily` signup: the Daily Home card opens the existing `DailyPreLaunchSignup`; direct `/daily` is guarded to that signup while prelaunch is active.
- Result email capture and post-sign-in reminder consent: unchanged on the result screen.
- Home email capture: show a small block below the cards only after at least one completed Daily and only while not subscribed. It uses the existing list with a new `home` source; brand-new players and subscribers never see it. Keep the cards visually primary and enforce no Home scroll at 360×640; report before shrinking any other element if the block does not fit. Preserve the existing `landing` source for any remaining callers.
- Legal/contact: compact Home footer plus existing legal pages.

## Name filtering and SQL security

- Use a reviewed high-confidence subset of the open-source LDNOOBW English list, stored in a server-only `blocked_display_names` table. Matching is against the whole normalized name only: Unicode NFKC/case fold, trim/collapse separators, and common digit substitutions. No substring matching, so normal names such as `Cass`, `Dickon`, or `Scunthorpe` are not blocked merely for containing a short term. Empty, control-character, over-6-character, and exact blocked/obfuscated names are rejected.
- Client code mirrors the same high-confidence list only for immediate feedback; server checks are authoritative anywhere a player name reaches peers.
- New/replaced RPCs: `display_name_allowed`, `get_my_display_name`, `set_my_display_name`, 5-argument `join_room_session`, `room_member_names`, `register_room_seats_by_pid`, `create_daily_group`, and `join_daily_group`.
- Every new/replaced function is `SECURITY DEFINER` with fixed `search_path = public`. Each migration explicitly revokes EXECUTE from PUBLIC, anon, and authenticated before granting only: profile reads/writes to authenticated; social join/name reads to anon and authenticated; internal filter helper to no client role; service role only where already needed. Account identity always comes from `auth.uid()`, never a client user id. Tables have RLS enabled and no broad client writes.

## Files to touch

**Routing/static/install:** `src/App.tsx`, `src/pages/LandingPage.tsx` (rewritten as Home), `index.html`, `scripts/classicHead.mjs` (expanded to path heads), `vite.config.ts` if the export is renamed, `public/home.webmanifest` (new), `public/daily.webmanifest`, `public/classic.webmanifest` only if cache-version references require it, `public/og-home-placeholder-1200x630.png` (new placeholder), new placeholder files under `public/icons/home-placeholder/`, `public/sitemap.xml`, `README.md`.

**Daily/destinations:** `src/pages/DailyPage.tsx`, `src/hooks/useDailyGame.ts` only if an explicit prestart/result-entry API is needed, `src/lib/daily.ts`, `src/lib/dailyEvents.ts`, `src/pages/SupportPage.tsx`, `src/components/LegalPage.tsx`, `src/pages/GroupsPage.tsx`, `src/components/ClassicResultScreen.tsx`, `src/components/MultiplayerWindow.tsx`.

**Names/social identity:** new `src/lib/displayName.ts`, `src/lib/visitor.ts`, `src/lib/account.ts`, new `src/lib/profile.ts`, `src/lib/rooms.ts`, `src/hooks/useRoomPresence.ts`, `src/lib/publicState.ts`, `src/hooks/useSoloGame.ts`, `src/lib/dailyGroups.ts`, `src/components/DailyGroupModals.tsx`, `src/components/SettingsSheet.tsx`, `src/pages/YouPage.tsx`, `src/integrations/supabase/types.ts`.

**Navigation/presentation:** new `src/components/HomeControl.tsx`, `src/components/SiteHeader.tsx`, `src/components/MultiplayerGameView.tsx`, `src/components/DailyLogoLockup.tsx` only if a generic Home variant is added, `src/index.css`, `src/lib/tokens.ts` only for shared semantic card styles (no palette changes).

**Database/docs:** separate new migrations under `drizzle/migrations/` for profiles/name enforcement and analytics allowlist; matching generated migration if required by the project workflow; new `docs/post-publish-global-name.md`; `AGENTS.md` and `roadmap.md` for durable architecture/rollout notes.

## Tests and acceptance checks

- Static route tests parse built HTML for `/`, exact `/daily`, `/classic.html`, manifests, canonical/OG tags, titles, and placeholder assets; verify `/today` and query preservation.
- Home component/browser tests cover card order/copy/colors, pre/post-play Daily behavior, countdown rollover, Solo direct entry, Peeps chooser, invite bypass, attribution forwarding, keyboard order, visible focus, 44px controls, and light/night contrast.
- Name unit/database tests cover existing-name carryover; signed-out persistence; signed-in cross-device profile; account switching; server use of `auth.uid()`; six-character limit; representative accepted normal names; exact/obfuscated blocked names; friendly error; wrong caller isolation; presence spoof ignored; Classic and Groups server enforcement; Solo fallback `You`.
- Security catalog tests assert SECURITY DEFINER, fixed search paths, RLS, and exact PUBLIC/anon/authenticated grants for every touched function.
- Daily regression tests prove first-time onboarding precedes `Tap to Start`, study begins only on tap and runs once for 10 seconds, already-played opens share-ready result, result/email/reminder flows remain, prelaunch signup still writes to the list, Home signup eligibility/source are exact, and confirmed mid-run exit saves unfinished rounds as unsolved while preserving the streak.
- Navigation tests verify Home on every non-game screen and confirmed X exits during every game.
- Automated analytics tests verify all four new Home events pass and unknown types still drop.
- Browser matrix: 390×844, 360×640, and 390×600 for every Daily phase with no document scroll; 360×640 Home with no scroll; 768px and 769px around the stack/row breakpoint; 1024×768 desktop; light, night, reduced motion, keyboard, and screen-reader labels.
- Live staged checks after Felix publishes each part: two-browser Classic names/anti-spoof and Groups; crawler `curl` read-back for root/Daily/Classic; old installed Daily and Classic launch correctly; new Home install opens `/`; normal Daily/Solo/Peeps flows and usage events; external reminder opens `/daily`.

Nothing in these parts changes game rules, scoring, points, tiers, game timings, sign-in enablement, Groups visibility, or the security guarantees from passes 1–3.
