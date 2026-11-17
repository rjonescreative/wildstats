// Checks that the live site's key /api routes are serving fresh NHL data.
//
// When the NHL API fails (usually rate-limiting Cloudflare's shared IPs with HTTP 429), the API
// middleware serves the last good copy marked X-Data-Stale, with X-Data-Updated saying when it was
// fetched. This script requests each route once, prints a table (also to the GitHub Actions job
// summary) and exits 1 if any route errors or serves data older than MAX_STALE_MINUTES — so a
// scheduled run fails and GitHub emails the repo owner.
//
// Usage: node scripts/check-api-freshness.js [baseUrl]   (default https://wildhockey.win)
// It runs against whichever Cloudflare data center is nearest the caller, and costs at most one
// NHL request per route (the middleware serves recent copies without running the route).
import { appendFileSync } from 'node:fs';

const BASE_URL = (process.argv[2] || 'https://wildhockey.win').replace(/\/+$/, '');
const MAX_STALE_MINUTES = 60;
const REQUEST_TIMEOUT = 30000; // ms

// Season ID, e.g. 20262027; rolls over in October (matches the other scripts and workflows)
function currentSeason(now = new Date()) {
    const year = now.getUTCMonth() + 1 < 10 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    return `${year}${year + 1}`;
}

const season = currentSeason();
const ROUTES = [
    '/api/standings/now',
    '/api/league/leaders',
    '/api/wild/stats',
    `/api/schedule/${season}`,
    `/api/all-team-schedules/${season}`,
    '/api/news/wild?offset=0&limit=6',
    // Rebuilt only after Wild games (js/gameTriggeredData.js); requesting it also lets a data
    // center that can reach the NHL build it when visitors elsewhere can't
    '/api/milestones/career-totals',
];

async function check(path) {
    const started = Date.now();
    try {
        const res = await fetch(BASE_URL + path, {
            headers: { 'User-Agent': 'wildhockey-freshness-monitor' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });
        await res.arrayBuffer();
        const stale = res.headers.get('x-data-stale') === 'true';
        const updated = Date.parse(res.headers.get('x-data-updated') || '');
        const ageMinutes = Number.isFinite(updated) ? Math.round((Date.now() - updated) / 60000) : null;
        let problem = null;
        if (!res.ok) problem = `HTTP ${res.status}`;
        else if (stale && (ageMinutes === null || ageMinutes > MAX_STALE_MINUTES)) {
            problem = `stale for ${ageMinutes ?? '?'} min`;
        }
        return {
            path, status: res.status, stale, ageMinutes, problem,
            seconds: (Date.now() - started) / 1000,
            colo: (res.headers.get('cf-ray') || '').split('-')[1] || '',
        };
    } catch (error) {
        return { path, status: 'error', stale: false, ageMinutes: null, problem: error.message, seconds: (Date.now() - started) / 1000, colo: '' };
    }
}

const results = [];
for (const path of ROUTES) results.push(await check(path)); // one at a time: no burst of NHL calls

const rows = results.map(r => `| \`${r.path}\` | ${r.status} | ${r.stale ? 'yes' : 'no'} | ${r.ageMinutes ?? '–'} | ${r.seconds.toFixed(1)}s | ${r.colo} | ${r.problem ?? 'OK'} |`);
const table = [
    `API freshness at ${new Date().toISOString()} (${BASE_URL})`,
    '',
    '| Route | Status | Stale | Data age (min) | Time | Data center | Result |',
    '|---|---|---|---|---|---|---|',
    ...rows,
].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n');

const failures = results.filter(r => r.problem);
if (failures.length) {
    console.error(`\n${failures.length} route(s) not serving fresh data: ${failures.map(f => `${f.path} (${f.problem})`).join(', ')}`);
    process.exit(1);
}
