// Cloudflare Pages Function — aggregated all-team schedules with R2 caching
//
// Cache strategy (stale-while-revalidate):
//   1. R2 data fresh (< 1hr):  return immediately — no NHL API calls
//   2. R2 data stale (>= 1hr): return stale data immediately, refresh R2 in background
//   3. No R2 data at all:      fetch synchronously (first cold start only), write R2
//
// A GitHub Actions cron hits this endpoint every 55 min so real users almost
// always land on path #1 and the 32 NHL API calls never run during a user request.

const TTL_MS = 60 * 60 * 1000; // 1 hour

const ALL_NHL_TEAMS = [
    'ANA','BOS','BUF','CAR','CBJ','CGY','CHI','COL','DAL','DET',
    'EDM','FLA','LAK','MIN','MTL','NJD','NSH','NYI','NYR','OTT',
    'PHI','PIT','SEA','SJS','STL','TBL','TOR','UTA','VAN','VGK','WPG','WSH',
];

function stripGameFields(game) {
    return {
        id:          game.id,
        season:      game.season,
        gameType:    game.gameType,
        gameDate:    game.gameDate,
        gameState:   game.gameState,
        homeTeam:    { abbrev: game.homeTeam?.abbrev, score: game.homeTeam?.score },
        awayTeam:    { abbrev: game.awayTeam?.abbrev, score: game.awayTeam?.score },
        gameOutcome: game.gameOutcome ? { lastPeriodType: game.gameOutcome.lastPeriodType } : undefined,
    };
}

async function fetchTeam(abbrev, season) {
    try {
        const response = await fetch(
            `https://api-web.nhle.com/v1/club-schedule-season/${abbrev}/${season}`,
            { redirect: 'follow' }
        );
        if (!response.ok) return { abbrev, games: [] };
        const data = await response.json();
        return { abbrev, games: (data.games ?? []).map(stripGameFields) };
    } catch {
        return { abbrev, games: [] };
    }
}

async function fetchAllTeams(season) {
    const BATCH_SIZE = 8;
    const BATCH_DELAY_MS = 200;
    const payload = {};
    for (let i = 0; i < ALL_NHL_TEAMS.length; i += BATCH_SIZE) {
        const batch = ALL_NHL_TEAMS.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map(a => fetchTeam(a, season)));
        results.forEach(r => {
            if (r.status === 'fulfilled') payload[r.value.abbrev] = r.value.games;
        });
        if (i + BATCH_SIZE < ALL_NHL_TEAMS.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }
    return payload;
}

async function writeR2(env, key, data) {
    await env.H2H_DATA.put(key, JSON.stringify({ data, updatedAt: new Date().toISOString() }), {
        httpMetadata: { contentType: 'application/json' },
    });
}

export async function onRequest(context) {
    const { env } = context;
    const { season } = context.params;
    const R2_KEY = `schedules/all-teams-${season}.json`;

    const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
    };

    // 1. Read from R2
    let cached = null;
    try {
        const obj = await env.H2H_DATA.get(R2_KEY);
        if (obj) cached = await obj.json();
    } catch {}

    if (cached) {
        const ageMs = Date.now() - new Date(cached.updatedAt).getTime();
        if (ageMs < TTL_MS) {
            // Fresh — return immediately, no NHL API calls
            return new Response(JSON.stringify(cached.data), { headers });
        }
        // Stale — return immediately, refresh R2 in background
        context.waitUntil(
            fetchAllTeams(season)
                .then(data => writeR2(env, R2_KEY, data))
                .catch(() => {})
        );
        return new Response(JSON.stringify(cached.data), { headers });
    }

    // No R2 data — first cold start, fetch synchronously
    try {
        const data = await fetchAllTeams(season);
        context.waitUntil(writeR2(env, R2_KEY, data).catch(() => {}));
        return new Response(JSON.stringify(data), { headers });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch schedules' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
