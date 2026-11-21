// The game-triggered datasets (see js/gameTriggered.js): what each one is built from, what makes
// it change, and how long its NHL source can lag behind the final horn. Shared by server.js and
// the Cloudflare Functions, which differ only in where the last build is stored.

import { upstreamFetch } from './upstream.js';
import { addFaceoffCounts, fetchFaceoffReport } from './faceoffs.js';
import { addGoalieShootoutLosses, fetchGoalieShootoutReport } from './goalieShootouts.js';
import { buildCareerTotals } from './careerTotals.js';
import { buildGameFlow } from './gameFlow.js';
import { buildTeamStats } from './teamStats.js';
import { addBlockedShots, fetchRealtimeReport } from './blockedShots.js';
import { getGameTriggered, leagueGamesTrigger, wildGamesTrigger, r2Store } from './gameTriggered.js';

const HOUR = 60 * 60 * 1000;

// Build calls skip the per-call cache (ttl 0): the whole result is stored instead, and on
// Cloudflare each cache read/write would count toward the Worker subrequest limit.
async function nhlJson(url, init = {}) {
    const r = await upstreamFetch(url, { redirect: 'follow', ttl: 0, ...init });
    if (!r.ok) throw new Error(`NHL API error ${r.status} for ${url}`);
    return r.json();
}

async function buildStandings() {
    return { data: await nhlJson('https://api-web.nhle.com/v1/standings/now') };
}

const LEADER_CATEGORIES = [
    ['skater', 'goals'], ['skater', 'assists'], ['skater', 'points'], ['skater', 'plusMinus'],
    ['goalie', 'wins'], ['goalie', 'savePctg'], ['goalie', 'goalsAgainstAverage'], ['goalie', 'shutouts'],
];

// { goals, assists, points, plusMinus, wins, savePctg, goalsAgainstAverage, shutouts }; any
// missing category fails the build. No per-call retries: a rate-limited NHL API would otherwise
// cost ~3 requests per category, and the whole build is retried later anyway.
async function buildLeagueLeaders(season) {
    const results = await Promise.all(LEADER_CATEGORIES.map(([kind, category]) =>
        nhlJson(`https://api-web.nhle.com/v1/${kind}-stats-leaders/${season}/2?categories=${category}&limit=100`, { retries: 0 })
            .then(json => [category, json])
    ));
    return { data: Object.fromEntries(results) };
}

// Club stats with faceoff counts, blocked shots and goalie shootout losses merged in. The reports are
// optional (the page shows without them), but a build missing one is incomplete, so it's rechecked.
async function buildWildStats(season) {
    const [clubStats, faceoffs, shootouts, realtime] = await Promise.all([
        nhlJson(`https://api-web.nhle.com/v1/club-stats/MIN/${season}/2`),
        fetchFaceoffReport(season),
        fetchGoalieShootoutReport(season),
        fetchRealtimeReport(season),
    ]);
    return {
        data: addBlockedShots(addGoalieShootoutLosses(addFaceoffCounts(clubStats, faceoffs), shootouts), realtime),
        complete: faceoffs !== null && shootouts !== null && realtime !== null,
    };
}

export const DATASETS = {
    // NHL standings update as soon as a game ends
    standings: {
        r2Key: 'game-triggered/standings.json',
        trigger: () => leagueGamesTrigger(),
        build: () => buildStandings(),
        settleMs: 4 * HOUR, recheckMs: 1 * HOUR,
    },
    leagueLeaders: {
        r2Key: 'game-triggered/league-leaders.json',
        trigger: () => leagueGamesTrigger(),
        build: season => buildLeagueLeaders(season),
        settleMs: 6 * HOUR, recheckMs: 2 * HOUR,
    },
    wildStats: {
        r2Key: 'game-triggered/wild-stats.json',
        trigger: season => wildGamesTrigger(season),
        build: season => buildWildStats(season),
        settleMs: 6 * HOUR, recheckMs: 2 * HOUR,
    },
    // Player landing pages can lag well behind the final
    careerTotals: {
        r2Key: 'game-triggered/career-totals.json',
        trigger: season => wildGamesTrigger(season),
        build: (season, { landingTtl }) => buildCareerTotals(season, landingTtl),
        settleMs: 10 * HOUR, recheckMs: 4 * HOUR,
    },
    // Blocks, penalties, hits, faceoffs and shot attempts for every team (js/teamStats.js); the
    // stats API can lag the final horn
    teamStats: {
        r2Key: 'game-triggered/team-stats.json',
        trigger: () => leagueGamesTrigger(),
        build: season => buildTeamStats(season),
        settleMs: 6 * HOUR, recheckMs: 2 * HOUR,
    },
    // Scoring first and time leading/trailing for every team (js/gameFlow.js). Builds add to the
    // previous one (only unfinished days are fetched, usually one request), so the short recheck
    // is cheap and lets a capped backfill (or a day that failed) catch up within minutes.
    gameFlow: {
        r2Key: 'game-triggered/game-flow.json',
        trigger: () => leagueGamesTrigger(),
        build: (season, { previous }) => buildGameFlow(previous),
        settleMs: 3 * HOUR, recheckMs: 5 * 60 * 1000,
    },
};

// Requests in the same process (the Express server, or one Worker isolate) that arrive while a
// dataset is loading share that load, instead of finding the rebuild lock and failing fast.
const inFlight = new Map(); // `${name}:${season}` → Promise

/**
 * Serve or rebuild one dataset. store: { read, write } (memoryStore() locally, or omit and pass
 * bucket for R2). Resolves to { data, rebuilt }; throws only when there's nothing stored.
 */
export function loadDataset(name, options = {}) {
    const key = `${name}:${options.season}`;
    if (!inFlight.has(key)) {
        inFlight.set(key, loadDatasetOnce(name, options).finally(() => inFlight.delete(key)));
    }
    return inFlight.get(key);
}

function loadDatasetOnce(name, { season, store, bucket, landingTtl = 0, now } = {}) {
    const ds = DATASETS[name];
    return getGameTriggered({
        name,
        season,
        store: store ?? r2Store(bucket, ds.r2Key),
        trigger: () => ds.trigger(season),
        build: previous => ds.build(season, { landingTtl, previous }),
        settleMs: ds.settleMs,
        recheckMs: ds.recheckMs,
        now,
    });
}
