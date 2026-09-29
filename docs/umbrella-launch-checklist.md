# Umbrella launch-day checklist

Owner: Felix. Do these in order. Nothing here is done by the build.

## 1. Before flipping
- [ ] Admin preview on phone: Home, Daily tile (before + after playing), Solo, Together, Home icon, Daily leave dialog, Home email block.
- [ ] Confirm analytics allowlist has the four `home_*` events (already live since Part 3; harmless while OFF).
- [ ] Confirm `subscribe_daily` accepts source `home` (already live).
- [ ] Deploy the `ac-subscribe` backend function so it accepts source `home` (code is in the repo; until deployed, Home signups are rejected as a bad source).

## 2. Flip and publish
- [ ] Set `LAUNCHED = true` in `src/launch.config.ts` (the only switch).
- [ ] Publish.
- [ ] Hard-refresh `/`, `/daily`, `/today` (should redirect to `/daily`, keeping `?i=` invites), `/support`, `/privacy`, `/terms`.

## 3. ActiveCampaign (outside the repo — not changed by us)
- [ ] Change the daily reminder email's "Play" link from `https://whoop-whoop.com/` to `https://whoop-whoop.com/daily`.
- [ ] Check any other AC automations/templates that link to `/`.
- [ ] Confirm new contacts tagged with source `home` land in the right list.

## 4. Share previews
- [ ] Paste `https://whoop-whoop.com/` into iMessage, WhatsApp, Slack, X, LinkedIn: title WHOOP! WHOOP!, Home description, `og-home.png`.
- [ ] Paste `https://whoop-whoop.com/daily`: Daily title/description/image as today.
- [ ] Force re-scrape where stale (Facebook Sharing Debugger, LinkedIn Post Inspector).
- [ ] Share a Daily result: link ends in `/daily`.
- [ ] Share a Daily invite: `/daily?i=…` opens the Daily.

## 5. Install
- [ ] iPhone "Add to Home Screen" from `/`: name "Whoop Whoop", new 180 icon, opens Home.
- [ ] Android install from `/`: name "Whoop Whoop", whole (non-maskable) icon.
- [ ] Existing Daily installs still open the Daily.

## 6. Search
- [ ] `sitemap.xml` lists `/` and `/daily`; resubmit in Search Console.

## 7. Smoke after launch
- [ ] Home events appear in admin (home_viewed, home_daily_tapped, home_solo_tapped, home_peeps_tapped — "peeps" is the internal name for Together).
- [ ] Leave a Daily mid-run in a test account: result saved as first attempt, streak kept, tile shows "See Today's Results".
- [ ] Classic room create/join from Together; invite links join straight in.

## Rollback
- [ ] Set `LAUNCHED = false`, publish. The database changes are additive and safe to leave.
