# Caching, cleanup, measurement, permissions

1. **Sample every Classic game** — `TIMING_SAMPLE_RATE = 1` (named constant in `classicResponsiveness.ts`); nothing else changes.
2. **Hashed static assets** — move fonts, 48 card faces + card back, 3 die faces, 5 badges, 3 OGG + 3 MP3 theme files from `public/` into `src/assets/`. Reference them through Vite imports (`import.meta.glob` eager `?url` for card faces) so builds emit `/assets/<name>-<hash>.<ext>` with year-long immutable caching. Update `index.css` @font-face, `index.html` preloads (Classic page inherits via prerender), `cardData.ts`, `whoopBrain.ts`, `opponentMemory.ts`, `MatchDie.tsx`, `whoopTiers.ts`, `sounds.ts`, `DailyHowToSteps.tsx`, `LandingPage.tsx`, `SupportPage.tsx`, `CardFlipLoader.tsx`, and tests. Not moved: classic.html, OG images, manifests, icons, favicons. Unreferenced copies deleted.
3. **Remove TanStack Query** — drop provider from `App.tsx`, the dependency, and the vite dedupe entry. Toasts and tooltips untouched.
4. **Timing table permissions** — revoke all table privileges on `classic_timing_samples` from anon/authenticated/PUBLIC; inserts stay via `log_classic_timing` (security definer), admin view via its security-definer RPC.

Verify: production build + preview check of Daily, Classic solo, Your Stats, How to Play, share image — every asset from `/assets/`, no 404s; nine cards on first reveal; full suite in one run.
