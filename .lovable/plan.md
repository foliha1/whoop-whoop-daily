# Classic music + welcome title line break

## What you asked for

1. Force a line break after "to" on the How to Play welcome card: "Welcome to / Whoop! Whoop! Classic".
2. Add the two uploaded tracks to the app:
   - **Whoop Whoop Classic Theme** → Classic lobby music (mirroring how the Daily plays its theme on its intro/results screens).
   - **Whoop Whoop How to Play SHORT** → plays only while the How to Play demo is open.

## Changes

### 1. Upload the tracks as CDN assets
- Upload both MP3s from the uploads mount via `lovable-assets create`:
  - `src/assets/Whoop_Whoop_Classic_Theme.mp3.asset.json`
  - `src/assets/Whoop_Whoop_How_to_Play_SHORT.mp3.asset.json`
- No binaries copied into the repo.

### 2. Make the background theme support per-screen tracks (`src/lib/sounds.ts`)
- Today `THEME_FILE` is a single hardcoded URL. Change `startTheme` to accept an optional track URL: `startTheme(trackUrl?: string)`.
- Module state remembers the active track URL; calling `startTheme` with a different track fades out and tears down the current loop, loads the new buffer, and loops it with the existing fade-in.
- Calling `startTheme()` with no argument uses the current Daily theme (`/sounds/theme.mp3`), so the Daily is untouched.
- Keep all existing behavior: the `musicEnabled` toggle in Settings still gates all music, fade times, bounded retry, iOS wake handling. Existing tests (`sounds.test.ts`) only cover SFX cues and stay green.
- Both new tracks get a small fetch cache (buffer per URL) so switching between lobby and demo music doesn't refetch.

### 3. Classic lobby music (`src/components/MultiplayerWindow.tsx`)
- Call `startTheme(classicThemeAsset.url)` whenever the Classic lobby is showing (the mode-picker/lobby screens, not during play), and `stopTheme()` when a game starts.
- Also start it on the result screen, matching the Daily's "music on intro and results" behavior.
- Cleanup on unmount: `stopTheme()`.

### 4. How to Play demo music (`src/components/ClassicDemo.tsx`)
- On demo mount: `startTheme(howToPlayAsset.url)` (switches the track even if lobby music was playing).
- On demo close/unmount: stop the demo track; the lobby effect in step 3 restarts lobby music if the lobby is still on screen.
- Works in both entry modes: the welcome screen (step 0) and the in-game "How to Play" chip. In the in-game case, gameplay has no music, so the demo track simply starts and stops.

### 5. Welcome title line break (`src/components/ClassicDemo.tsx`)
- Render the title as `Welcome to<br />Whoop! Whoop! Classic`.
- The title frame is currently fixed at `height: 61` (one line). With the forced break it becomes two 36px lines, so change the fixed height to auto (keep `lineHeight: 1`) on both the frame and the `h1`. The card is vertically centered (`margin: "auto"`), so the extra ~36px stays centered and fits at 390×520.
- All other tokens unchanged (Friend, 400, 36px, -0.01em, warmBlack, 290px card, same gaps).

## Out of scope
- No reducer, rules, claim-arbiter, or Daily changes. The Daily keeps its current theme track.
- The `MusicWindow` (SoundCloud playlist window) is untouched.

## Verification
- Type-check + `bunx vitest run`.
- Playwright at 390×520 on `/classic`:
  - Welcome card shows the title on two lines with the break after "to", nothing overflowing, no scrolling.
  - Confirm the classic theme loads (network request for the CDN MP3) on the lobby.
  - Open How to Play → the SHORT track loads and the lobby track stops; close the demo → lobby track resumes.
- Confirm the Daily still plays its original theme on its intro screen.

## Note
The demo's closing copy still says "WHOOP Bot" while the solo opponent is named "WHOOP" — the earlier flag is still open awaiting your call. Not touched here.
