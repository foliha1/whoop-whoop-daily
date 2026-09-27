# One launch switch for the umbrella change (Parts 1–3)

## Summary
One setting, `launched: false`, in a single file. With it OFF, players get today's site. With it ON, Parts 1–3 appear together. Felix can preview the ON version on the live site after signing in with an email on the admin allowlist. Crawlers only read the static pages, and those stay OFF until launch day.

## Where the switch lives
- `launch.config.json` at the project root: `{ "launched": false }`. This is the only thing that changes on launch day.
- `src/lib/launch.ts` reads the config and exports:
  - `LAUNCHED` (fixed when the site is built)
  - `useUmbrella()`, which returns true when `LAUNCHED` is ON, or when the signed-in user passes the admin preview check.
- `scripts/classicHead.mjs` and `vite.config.ts` read the same JSON when the site is built. They use it to decide which static pages to produce.
- Every gated spot in the app calls `useUmbrella()`. Nothing reads the JSON directly, so the cleanup pass can find every gate with one search.

## What it gates (every file)
**Part 1 (already built, now gated):**
- `src/components/SettingsSheet.tsx` and `src/pages/YouPage.tsx`: the name editor only renders when ON.
- `src/components/DisplayNameEditor.tsx`: only used behind the gate. The file itself doesn't change.
- `src/hooks/useSoloGame.ts`: OFF shows "You", as today. ON shows the global name.
- `src/components/MultiplayerWindow.tsx`: OFF keeps today's Classic name screen: same copy, same flow, same six-character box. ON uses the new first-social-play prompt and the account name.
- `src/lib/profile.ts` and `src/lib/account.ts`: account-name syncing only runs when ON. With OFF, the name stays saved on the device only, as today.
- `src/components/DailyGroupModals.tsx`: Groups is behind the debug gate, so players can't reach it either way. The name behaviour here is still gated so it stays consistent.

**Parts 2–3 (not built yet; built behind the gate from the start):**
- `src/App.tsx`: when OFF, `/` is the Daily, as today, and `/daily` goes to `/`. When ON, `/` is the new Home and `/daily` is the Daily. The home icon, and removing the logo from game screens, are ON only.
- The new Home page, its three cards, the home email signup with source "home", Tap to Start, the Daily leave confirmation, Solo without the name screen, and Start or Join for Peeps: all ON only.
- Share links: `/` when OFF, `/daily` when ON.
- `src/lib/analytics.ts`: home events are only sent when ON. The server allowlist can accept them early, which does no harm.

**Static pages and installs (build time only):**
- `scripts/classicHead.mjs` and `vite.config.ts`: when OFF, they produce exactly today's `index.html`, `classic.html`, `classic/index.html` and `play/index.html`, and nothing else. When ON, they also produce the Home tags for `/`, a `daily.html` / `daily/index.html` with the Daily tags, and the WHOOP! WHOOP! home install file.
- `public/`: the new home install file and preview image are only copied into the site when ON. The current Daily and Classic install files never change.

## Part 1 server changes with the switch OFF
These are live today and stay live. The app will keep using them whichever way the switch is set, because they fix security problems and players can't see them:
- Classic joins use the five-part join call, and names come from the server's list of players at the table, not from what each browser claims. Players see the same names they typed.
- The server still checks names: length, control characters, a letter or number in any language, and the blocked-word list. With OFF, a player who types a blocked word sees today's name screen with "Try another name." underneath. That is the only difference a player could see with OFF. Every other name works the same.
- The older four-part join call is still live for the published site, which uses it today. The published app never uses the account-name functions, so they sit unused until launch.
- This is safe because today's published site already runs against these server changes. After the change, the app still uses the new calls; it just doesn't show the new screens.

**Decision for Felix:** keeping the name check on while OFF is the safer choice. If "nothing visible" has to be absolute, the only way is to let blocked words reach other players until launch. I don't recommend that.

## Private preview
- `useUmbrella()` calls a new server function, `can_preview_umbrella()`. It is SECURITY DEFINER, has a fixed search path, returns `public.is_admin()`, and only signed-in users can run it. Signed-out visitors never make the call and always get OFF.
- Felix signs in on whoop-whoop.com (phone or desktop) with his allowlisted email. The site then switches to ON for him in his browser. There is no URL flag anyone could guess.
- If the check fails or the network is down, the site stays OFF.
- Crawlers can't sign in and don't run JavaScript. Link previews and search engines only see the static OFF pages.
- **Limits of the preview:**
  - The link-preview tags and the home install file only exist after launch, so Felix can't preview how a shared link looks or how the home install works.
  - While he is signed in, "Add to Home Screen" still installs today's Daily or Classic app.
  - I will show him the new tags from a test build before launch.

## Launch day
1. Change `launch.config.json` to `{ "launched": true }`. One line.
2. Publish. A publish is required, because the static pages, install files and share links are created when the site is built.
3. Post the announcement.
4. Checks: `/` shows Home; `/daily` shows the Daily with its own preview tags; `/classic.html?r=CODE` still joins; old home-screen installs still open.

Nothing can flip without a publish on its own. The server side is already live, so there are no database steps on launch day.

## After launch: cleanup pass
- Delete `launch.config.json`, `src/lib/launch.ts` and `can_preview_umbrella()`.
- Remove every `useUmbrella()` gate and its OFF branch: today's `/` Daily route, the old name screen, "You" in Solo, and the build-time OFF branch.
- Delete the OFF-only tests.
- Then follow the existing post-publish name steps, including removing the four-part join call once the published site no longer uses it.

## Tests
- A test helper runs gated tests with the switch both OFF and ON.
- **OFF must prove nothing changed:**
  - `index.html` and all three Classic pages are byte-for-byte the same as today's, and no Home or `daily.html` page is produced.
  - `/` renders the Daily.
  - The Classic name screen matches today's.
  - Settings and Your Stats have no name editor.
  - Solo says "You".
  - There is no Home icon and the logo stays in place.
  - Share links use `/`.
  - No home events are sent.
- **ON:** all the Parts 1–3 behaviour, the new static pages and the home install file.
- **Preview:** admin gets ON, non-admin gets OFF, signed out gets OFF, a failed check gets OFF.

## If someone previews and the switch goes back OFF
- **"Leave":** a Daily left mid-run is saved as a normal first attempt, with the unfinished rounds unsolved and the streak kept. That is the same kind of result the site saves today, so with OFF the Daily shows it as an already-played day. Only admins can reach Leave before launch.
- **Names:**
  - The account name stays in the name store. With OFF the app doesn't read it and uses the name saved on the device, as today.
  - A name set through Settings also updates the device name, so it carries over.
  - Classic seats still show whatever name the server accepted.
  - Nothing is lost or broken. The account name comes back at launch.

## Risks
- **Two versions of the site in one build:** gated code ships to every player. It stays hidden, but someone reading the site's code could find it before launch.
- **Missed gates:** the OFF tests and a search for `useUmbrella` catch these.
- **Admin sees ON on a shared device:** signing out returns it to OFF.
- **Urgent fixes before launch:** they must be tested with OFF. That is the default, so no extra steps.

## Technical details
- Vite imports the JSON config, so it becomes a fixed value in the built site.
- The preview result is kept in memory for the page session only, never saved on the device.
- The home email source "home" is added next to "landing", and "landing" keeps working.
- New migration: `can_preview_umbrella()` with revoke from PUBLIC and anon, and grant to authenticated.
