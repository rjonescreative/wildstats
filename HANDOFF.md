# WildStats — Hand-off Notes

Context for a new session on **Wild Hockey Hub** (https://wildhockey.win), a Minnesota Wild fan site. `CLAUDE.md` has the hard rules; this file is the "how things actually work" companion. Read both before starting.

## Working agreements (from the owner)

- **Never commit or push without explicit permission** — each commit needs its own OK. When asked to commit, include *all* modified/staged files (`git add -u`), never `.claude/worktrees/`.
- Work on `main` only. No branches, no worktrees.
- **API changes must land in both** `server.js` (local Express) and `functions/api/...` (Cloudflare Pages Functions), with matching response shapes.
- **Gold (`--wild-gold` / `#EAAA00`) is for links only.** Clickable triggers may use it; badges, headings, borders must not.
- **Always check mobile** (375px and 320px phones, plus 768/1024 breakpoints). No horizontal scroll.
- **Missing data rule:** if a stat value is missing, exclude it unless it can be calculated exactly (e.g. empty-net assists are 0 when total assists are 0). Never silently treat unknown as 0.
- The owner prefers being asked before running things that touch production data, and has objected to running JS in the live site's browser tab. Verify production with `curl`, page text, or screenshots instead.
- After a push, confirm the Cloudflare deploy finished and the new code is actually served (see "Deploy & verify").

## Stack & layout

- Frontend: vanilla JS ES modules + one `styles.css` (CSS variables in `:root`). No build step.
- Local dev: `node server.js` on port 3000 (`.claude/launch.json` → preview name `wildstats`). Restarting it is allowed.
- Production: Cloudflare Pages (`pages_build_output_dir = "."`), Functions in `functions/`, R2 bucket bound as `env.H2H_DATA` (bucket `wildstats-data`).
- Data source: NHL APIs — `api-web.nhle.com/v1` (schedules, boxscores, club-stats, player landing/game-log) and `api.nhle.com/stats/rest/en` (summary/realtime reports; filter by `franchiseId=37` for Wild-only numbers).

Key files:

| File | What it does |
|---|---|
| `js/router.js` | SPA routing, page titles/descriptions (`getPageTitle`, `getMetaDescription`), client meta/canonical updates, analytics page views |
| `js/seasonConfig.js` | **Season helpers shared by browser, server.js, and Functions**: `getCurrentSeason` (rolls over in October), `getSeasonGames` (82 through 2025-26, 84 from 2026-27), `getPreviousSeason`, `getPlayoffYear`, `getPastSeasons`, `seasonFromLabel`, and the **`PLAYOFF_MODE`** flag |
| `js/teamRecordsMeta.js` | Team-records URL slugs, path parse/build, titles/descriptions — shared by router and `functions/[[route]].js` |
| `functions/[[route]].js` | Catch-all for SPA routes: injects page title/description/canonical/OG tags, BreadcrumbList JSON-LD, and pre-rendered jersey-numbers content for SEO |
| `js/api.js` | Client fetch helpers with in-memory cache (`state.js`) |
| `js/views/*.js` | One module per view (`init(subView)`); stats sub-views live under `stats.js` |
| `sitemap.xml` | ~400 URLs incl. generated team-records combos and past-season schedules |

## Routes

- `/` dashboard · `/schedule` (current) · `/schedule/past[/YYYY-YY]` (past seasons, defaults to last season; `/schedule/past` canonicalizes to the season URL)
- `/standings/{wildcard|division|conference|league|playoffs}` (playoffs tab hidden unless `PLAYOFF_MODE`)
- `/stats` (players) · `/stats/season` · `/stats/head-to-head[/team-slug]` (defaults to next opponent) · `/stats/milestones` · `/stats/numbers` (jersey numbers)
- `/stats/team-records/[playoffs|combined/]{all-time|season}/{stat}/{pos}` — stat slugs include `goals`, `power-play-goals`, `short-handed-points`, `empty-net-assists`, `even-strength-goals`, `games-played`, `wins`, `shootout`, `penalty-minutes`. Regular season has no type segment. Old `pp-goals` style slugs still resolve.

When adding a page: add the route in `router.js`, a title/description in `getPageTitle`/`getMetaDescription`, server meta in `functions/[[route]].js` (PAGE_META or `resolveMeta`, and `isSpaRoute`), and a sitemap entry. Otherwise Google sees the homepage's title and a canonical pointing to `/`.

## Data pipelines (GitHub Actions → R2)

| Workflow | Script | R2 key | Schedule (UTC) |
|---|---|---|---|
| Update H2H Data | `scripts/update-h2h-data.js` | `h2h/MIN-{OPP}.json` | 06:00 daily |
| Update Milestones Data | `scripts/update-milestones.js` | `milestones/franchise-leaders.json` | 06:30 daily |
| Update Sweater Numbers | `scripts/update-sweater-numbers.js` | `numbers/sweater-numbers.json` | 06:45 daily |
| Warm team schedules cache | (curl only) | `schedules/all-teams-{season}.json` | every 55 min |

Other R2 keys: `wild/season-breakdown-{season}-v5.json` (written on demand by the season-breakdown endpoint).

Run manually: `gh workflow run update-milestones.yml` (add `-f seed=true` for a full rebuild where supported). Check with `gh run list --workflow=... --limit 3`. GitHub sometimes delays scheduled runs by hours or fails to assign a runner (job "cancelled" with no steps = GitHub outage, not our code — check githubstatus.com).

### Milestones payload (`/api/milestones/leaders`)

- `skaters.careerLeaders.{all|forwards|defense}.{stat}` and `skaters.singleSeasonRecords...`, `goalies.careerLeaders.{stat}` / `goalies.singleSeasonRecords`.
- `playoffs` and `combined` have the same shape (regular-season + playoffs for combined).
- Stats include situational `ev/pp/sh/en` × `Goals/Assists/Points` (from the stats API, Wild-only), plus `shootoutGoals`, `penaltyMinutes`, `gamesPlayed`, `wins`, `shutouts`.
- **Split-season correction:** `club-stats` returns full-season totals for traded players. The script corrects candidates to Wild-only using player landing pages (`correctSplitSeasonRecords` / `correctSplitSeasonCareerTotals`, cached per run). Combined = corrected regular season + playoffs.
- Also stores raw `seasonData`, `playoffSeasonData`, `shootoutData` for incremental runs; `--rebuild` reprocesses without fetching.

### Sweater numbers (`/api/numbers/sweater`)

- Built from every Wild box score (regular + playoffs). A game counts only if the player's **official game log** credits it — box scores list dressed players (incl. backup goalies) and some 0:00 lines are credited, some not. Fallback when a log lags: real ice time.
- `numbers[num][playerId] = { regular, playoffs, firstSeason, lastSeason, seasons: { [season]: { regular, playoffs } } }`. The page groups consecutive seasons into stints (2004-05 lockout counts as consecutive) and falls back to one range if per-season counts don't add up.
- Validated against official GP: all 344 players match. Full seed takes ~22 min on Actions.

## Playoff mode

`PLAYOFF_MODE` in `js/seasonConfig.js` (currently `false`). When `true` it shows: magic-number columns (dashboard + standings), opponent playoff-position colors on the schedule, the Standings › Playoffs tab/bracket (projected "If the season ended today" matchups until the NHL publishes series), and Record vs Playoff Teams on `/stats/season`.

## Gotchas that cost time

- **Cloudflare Workers freeze the clock at the Unix epoch during module init.** Never compute dates (season labels etc.) at module top level in `functions/` — do it inside the request handler. (A top-level `getSeasonLabel()` once rendered "1969-70" titles.)
- **NHL API rate-limits this machine's IPv4** (HTTP 429). `server.js` sets `setDefaultResultOrder('ipv4first')`, so the local server hits it while standalone Node scripts often don't. To test UI locally, point fetches at production read-only APIs from the browser console (e.g. override `window.fetch` to rewrite `/api/...` to `https://wildhockey.win/api/...`). Some endpoints (e.g. `team-schedule`) don't send CORS headers, so that trick won't work for them.
- **Testing pipelines without touching production:** copy the script with `writeToR2(payload)` replaced by a local file write, run with `node -r dotenv/config scripts/.dryrun-x.mjs`, then delete the copy. Serve the output via a temp JSON in the project root to preview pages, and delete it before committing.
- **Edge propagation:** after a successful Pages deploy, Cloudflare edges can serve old JS/CSS for a minute or two. Poll with a cache-busting query until the new code shows consistently. `styles.css` is browser-cached up to 4h — users may need a hard refresh.
- **Wrangler isn't installed.** Test Functions by importing them in Node with a tiny `HTMLRewriter` stub and a fake `env.H2H_DATA`/`env.ASSETS` (see git history around the SEO commits for examples).
- Local server stops occasionally; restart with the preview tool (`wildstats`).
- The browser pane caches ES modules — `fetch(url, {cache: 'reload'})` the changed files before reloading.

## Deploy & verify (after an approved push)

```bash
SHA=$(git rev-parse --short HEAD)
gh api repos/rjonescreative/wildstats/commits/$SHA/check-runs --jq '.check_runs[] | select(.name=="Cloudflare Pages") | "\(.status) \(.conclusion)"'
curl -s "https://wildhockey.win/js/views/<file>.js?v=$RANDOM" | grep -c "<something new>"
```

Commit messages end with the `Co-Authored-By` line from the current session's attribution instructions.

## Design conventions

- Dark UI; section headings use the uppercase/gray/letter-spaced style with a bottom border (`.milestones-section-title` pattern). Cards: `rgba(20,20,20,0.75)` background, `--border-subtle`, 8–10px radius.
- Team records selectors: desktop sidebar (>1024px); ≤1024px collapse to gold "LABEL / value ▾" triggers that open a left slide-out menu (5 across ≥700px, 3 ≥480px, 2 below).
- Jersey numbers: `images/jersey-back.png` (100×100) with an SVG number — Saira Condensed 800, 45px, `y="60"`, fill `--jersey-wheat` `#F8F1DF`, stroke `--jersey-red` `#BA161C`.
- Former teams (PHX, ATL, ARI) have no local logo; schedule rows fall back to the NHL's era logo (`team.darkLogo`).
- Retired numbers live in `RETIRED_NUMBERS` in `js/views/numbers.js` (currently #9 Koivu).

## Known open items

- `/standings` and `/standings/wildcard` serve the same content under the same title (consider canonicalizing `/standings` → `/standings/wildcard`).
- `ubuntu-latest` moves to Ubuntu 26 on Oct 19, 2026 (workflows only use Node/curl; should be fine).
