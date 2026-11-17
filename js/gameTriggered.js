// Game-triggered data: rebuild NHL-derived data only after games finish, not on a timer.
// Shared by server.js and the Cloudflare Functions (standings, league leaders, Wild stats, career
// totals).
//
// Team and league stats only change when games finish, so each dataset's last build is stored
// (R2 on Cloudflare, so every data center shares one copy; memory locally) along with the ids of
// the finished games its trigger saw. Each request checks the trigger (one small, cached NHL call)
// and rebuilds only when:
//   - a finished game appears that the stored build hadn't seen, or
//   - the stored build isn't settled and `recheckMs` has passed. NHL stats can update a while after
//     the final horn, so a build counts as settled only once it ran at least `settleMs` after the
//     latest game's start and was complete (no optional part failed); until then it's rebuilt every
//     `recheckMs`.
// Before a rebuild the attempt is recorded, and for ATTEMPT_LOCK_MS no other rebuild of that
// dataset starts anywhere: the stored build is served meanwhile (or, with nothing stored, the
// request fails fast and the /api middleware serves its last good copy), and a failed attempt
// (e.g. the NHL rate-limiting us) isn't retried any sooner.

import { upstreamFetch } from './upstream.js';
import { fetchWildSchedule } from './wildSchedule.js';

export const ATTEMPT_LOCK_MS = 15 * 60 * 1000; // one rebuild attempt per dataset per 15 min, site-wide
const HOUR = 60 * 60 * 1000;

// ---- triggers: which finished games can the data have changed with? ---------------------------
// Each returns { ids: [finished game ids], latestStart: ms | null }.

const isFinished = g => g.gameType === 2 && (g.gameState === 'FINAL' || g.gameState === 'OFF');

function finishedGames(games) {
    const done = games.filter(isFinished);
    const starts = done.map(g => Date.parse(g.startTimeUTC)).filter(Number.isFinite);
    return { ids: done.map(g => g.id), latestStart: starts.length ? Math.max(...starts) : null };
}

async function getJson(url, ttl) {
    const r = await upstreamFetch(url, { redirect: 'follow', ttl });
    if (!r.ok) throw new Error(`${url} failed: ${r.status}`);
    return r.json();
}

// Finished regular-season Wild games this season, from the Wild schedule's game-window cache
// (js/wildSchedule.js, shared with the schedule route): refreshed every 5 min around games, so a
// final is seen within minutes, and rarely otherwise.
export async function wildGamesTrigger(season) {
    const r = await fetchWildSchedule(season);
    if (!r.ok) throw new Error(`Wild schedule failed: ${r.status}`);
    const { games = [] } = await r.json();
    return finishedGames(games);
}

// Finished regular-season games league-wide, today and the previous game day. Cached 5 min,
// matching how often each data center runs these routes (the /api middleware's fresh window) (so games that end
// after midnight, or finish while a new day's games are scheduled, are seen). Games rolling out of
// this window, or days with no games, never trigger a rebuild: only a newly finished game does.
export async function leagueGamesTrigger() {
    const today = await getJson('https://api-web.nhle.com/v1/score/now', 300);
    const previous = today.prevDate
        ? await getJson(`https://api-web.nhle.com/v1/score/${today.prevDate}`, 600)
        : { games: [] };
    return finishedGames([...(today.games ?? []), ...(previous.games ?? [])]);
}

// ---- stores --------------------------------------------------------------------------------------

// R2 object per dataset; no bucket bound → nothing stored (every request rebuilds)
export function r2Store(bucket, key) {
    if (!bucket) return { read: async () => null, write: async () => {} };
    return {
        async read() {
            const object = await bucket.get(key);
            return object ? JSON.parse(await object.text()) : null;
        },
        write: record => bucket.put(key, JSON.stringify(record), { httpMetadata: { contentType: 'application/json' } }),
    };
}

// In-memory store (local dev server), so local runs never overwrite production's R2 copies
export function memoryStore() {
    let record = null;
    return { read: async () => record, write: async r => { record = r; } };
}

// ---- refresh logic -------------------------------------------------------------------------------

// A rebuild started (or failed) within ATTEMPT_LOCK_MS. A successful build writes a fresh record
// without attemptAt, so its presence means an attempt is still running or didn't succeed.
export function rebuildLocked(stored, now) {
    return stored?.attemptAt != null && now - stored.attemptAt < ATTEMPT_LOCK_MS;
}

/**
 * 'stored' (serve the stored build) or 'rebuild'.
 * stored: { season, data, gameIds, computedAt, settled } | null; trigger: { ids, latestStart }
 */
export function refreshDecision(stored, trigger, season, recheckMs, now) {
    if (!stored?.data || stored.season !== season) return 'rebuild';
    const seen = new Set(stored.gameIds ?? []);
    if (trigger.ids.some(id => !seen.has(id))) return 'rebuild';
    if (!stored.settled && now - stored.computedAt >= recheckMs) return 'rebuild';
    return 'stored';
}

/**
 * Serve or rebuild a game-triggered dataset.
 *   season    current season id (a stored build from another season is ignored)
 *   store     { read, write } — r2Store(...) or memoryStore()
 *   trigger   () => Promise<{ ids, latestStart }>
 *   build     () => Promise<{ data, complete }> — throw on failure; complete=false when an optional
 *             part failed, so the build is rechecked rather than settled
 *   settleMs, recheckMs   see top of file
 * Resolves to { data, rebuilt }; throws only when there's nothing stored to fall back on.
 */
export async function getGameTriggered({ name, season, store, trigger, build, settleMs = 6 * HOUR, recheckMs = 2 * HOUR, now = Date.now() }) {
    const stored = await store.read().catch(() => null);
    const usable = stored?.data && stored.season === season ? stored : null;

    // Another rebuild is running or just failed: never pile onto the NHL API
    if (rebuildLocked(stored, now)) {
        if (usable) return { data: usable.data, rebuilt: false };
        throw new Error(`${name}: rebuild already in progress or recently failed`);
    }

    let seen = null;
    try {
        seen = await trigger();
    } catch (err) {
        // Can't tell whether a game finished: keep the stored build rather than rebuild blind
        if (usable) return { data: usable.data, rebuilt: false };
    }

    if (seen && refreshDecision(usable, seen, season, recheckMs, now) === 'stored') {
        return { data: usable.data, rebuilt: false };
    }

    await store.write({ ...(stored ?? {}), attemptAt: now }).catch(() => {});
    try {
        const { data, complete = true } = await build();
        await store.write({
            season,
            data,
            gameIds: seen?.ids ?? [],
            computedAt: now,
            // An unknown trigger (it failed) or an incomplete build is never settled, so it's rechecked
            settled: Boolean(seen) && complete && (seen.latestStart === null || now >= seen.latestStart + settleMs),
        }).catch(() => {});
        return { data, rebuilt: true };
    } catch (err) {
        if (usable) {
            console.warn(`${name}: rebuild failed; serving the stored build:`, err.message);
            return { data: usable.data, rebuilt: false };
        }
        throw err;
    }
}
