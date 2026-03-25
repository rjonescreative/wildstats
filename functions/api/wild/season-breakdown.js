// Cloudflare Pages Function — Wild season breakdown (incremental R2 cache)
// Stores per-game period scores + SO scorers + goalie data in R2, only fetching new games on each request.

const R2_KEY = 'wild/season-breakdown-20252026-v5.json';
const SEASON  = '20252026';

// Extract period scores, SO scorers, and goalie data from a play-by-play response
function extractGameData(pbp) {
    const homeId = pbp.homeTeam?.id;
    const awayId = pbp.awayTeam?.id;
    const isMinHome = pbp.homeTeam?.abbrev === 'MIN';
    const minTeamId = isMinHome ? homeId : awayId;
    const periodMap = {};
    const newSoScorers = {};
    const goalieEvents = {}; // MIN goalie id → shot/goal event count (to find primary)
    const goalieGA = {};     // MIN goalie id → { P1, P2, P3, OT, SO } goals against

    (pbp.plays ?? []).forEach(play => {
        const pd = play.periodDescriptor ?? {};
        const teamId = play.details?.eventOwnerTeamId;
        const goalieId = play.details?.goalieInNetId;

        // Period scoring: only count goals
        if (play.typeDescKey === 'goal') {
            const key = `${pd.number}|${pd.periodType}`;
            if (!periodMap[key]) {
                periodMap[key] = { period: pd.number, periodType: pd.periodType, home: 0, away: 0 };
            }
            if (teamId === homeId)      periodMap[key].home++;
            else if (teamId === awayId) periodMap[key].away++;
        }

        // SO shooter tracking: goals + shots + misses for MIN players
        if (pd.periodType === 'SO' && teamId === minTeamId) {
            const isGoal    = play.typeDescKey === 'goal';
            const isAttempt = isGoal || play.typeDescKey === 'shot-on-goal' || play.typeDescKey === 'missed-shot';
            if (isAttempt) {
                const id = isGoal ? play.details?.scoringPlayerId : play.details?.shootingPlayerId;
                if (id) {
                    if (!newSoScorers[id]) newSoScorers[id] = { goals: 0, attempts: 0 };
                    newSoScorers[id].attempts++;
                    if (isGoal) newSoScorers[id].goals++;
                }
            }
        }

        // Goalie tracking: shots/goals by the opposing team identify which MIN goalie is in net
        if (goalieId && teamId && teamId !== minTeamId) {
            const gid = String(goalieId);
            goalieEvents[gid] = (goalieEvents[gid] ?? 0) + 1;
            if (play.typeDescKey === 'goal') {
                const pk = pd.periodType === 'REG' ? `P${pd.number}` : pd.periodType;
                if (!goalieGA[gid]) goalieGA[gid] = {};
                goalieGA[gid][pk] = (goalieGA[gid][pk] ?? 0) + 1;
            }
        }
    });

    // Primary MIN goalie = one who faced the most events (shots + goals against)
    const primaryGoalieId = Object.entries(goalieEvents).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
        periods: Object.values(periodMap).sort((a, b) => a.period - b.period),
        soScorers: newSoScorers,
        isMinHome,
        primaryGoalieId,
        goalieGA,
    };
}

export async function onRequest(context) {
    const { env } = context;

    const jsonHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        // 1. Read cached data from R2
        let cached = { processedGameIds: [], periodScores: {}, soScorers: {}, goalieSeasonGA: {}, goalieDecisions: {} };
        try {
            const obj = await env.H2H_DATA.get(R2_KEY);
            if (obj) cached = await obj.json();
        } catch (e) {
            // Cache miss or parse error — start fresh
        }

        const processedSet = new Set(cached.processedGameIds ?? []);

        // 2. Fetch MIN schedule to find all completed games
        const schedResponse = await fetch(
            `https://api-web.nhle.com/v1/club-schedule-season/MIN/${SEASON}`,
            { redirect: 'follow' }
        );
        if (!schedResponse.ok || !schedResponse.headers.get('content-type')?.includes('json')) {
            // Schedule unavailable — return whatever is cached
            return new Response(JSON.stringify({
                periodScores:    cached.periodScores,
                soScorers:       cached.soScorers,
                goalieSeasonGA:  cached.goalieSeasonGA,
                goalieDecisions: cached.goalieDecisions,
            }), { headers: { ...jsonHeaders, 'Cache-Control': 'public, max-age=300' } });
        }
        const schedData = await schedResponse.json();
        const completedGames = (schedData.games ?? []).filter(
            g => g.gameType === 2 && (g.gameState === 'FINAL' || g.gameState === 'OFF')
        );

        // 3. Identify games not yet in cache
        const newGames = completedGames.filter(g => !processedSet.has(g.id));

        if (newGames.length === 0) {
            // Everything cached — fast path
            return new Response(JSON.stringify({
                periodScores:    cached.periodScores,
                soScorers:       cached.soScorers,
                goalieSeasonGA:  cached.goalieSeasonGA,
                goalieDecisions: cached.goalieDecisions,
            }), { headers: { ...jsonHeaders, 'Cache-Control': 'public, max-age=3600' } });
        }

        // 4. Fetch PBP for new games only, in batches of 12
        const BATCH_SIZE = 12;
        const pbpResults = [];
        for (let i = 0; i < newGames.length; i += BATCH_SIZE) {
            const batch = newGames.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(
                batch.map(game =>
                    fetch(`https://api-web.nhle.com/v1/gamecenter/${game.id}/play-by-play`, {
                        redirect: 'follow'
                    }).then(r => r.json())
                )
            );
            pbpResults.push(...batchResults);
        }

        // 5. Merge new data into cached data
        const periodScores    = { ...cached.periodScores };
        const soScorers       = { ...cached.soScorers };
        const goalieSeasonGA  = { ...cached.goalieSeasonGA };
        const goalieDecisions = { ...cached.goalieDecisions };

        newGames.forEach((game, i) => {
            const result = pbpResults[i];
            if (result.status !== 'fulfilled') return;
            const { periods, soScorers: newSO, isMinHome, primaryGoalieId, goalieGA } = extractGameData(result.value);
            if (periods.length > 0) {
                periodScores[game.id] = periods;
                processedSet.add(game.id);
            }
            Object.entries(newSO).forEach(([id, { goals, attempts }]) => {
                if (!soScorers[id]) soScorers[id] = { goals: 0, attempts: 0 };
                soScorers[id].goals   += goals;
                soScorers[id].attempts += attempts;
            });
            // Merge per-goalie GA by period
            Object.entries(goalieGA).forEach(([gid, ga]) => {
                if (!goalieSeasonGA[gid]) goalieSeasonGA[gid] = {};
                Object.entries(ga).forEach(([pk, count]) => {
                    goalieSeasonGA[gid][pk] = (goalieSeasonGA[gid][pk] ?? 0) + count;
                });
            });
            // Merge goalie home/away decision
            if (primaryGoalieId) {
                if (!goalieDecisions[primaryGoalieId]) {
                    goalieDecisions[primaryGoalieId] = { homeW: 0, homeL: 0, homeOT: 0, awayW: 0, awayL: 0, awayOT: 0 };
                }
                const myScore  = isMinHome ? game.homeTeam?.score : game.awayTeam?.score;
                const oppScore = isMinHome ? game.awayTeam?.score : game.homeTeam?.score;
                const last = game.gameOutcome?.lastPeriodType ?? 'REG';
                const outcome = myScore > oppScore ? 'W' : (last === 'OT' || last === 'SO') ? 'OT' : 'L';
                const prefix = isMinHome ? 'home' : 'away';
                goalieDecisions[primaryGoalieId][`${prefix}${outcome}`]++;
            }
        });

        // 6. Write updated cache back to R2 (non-blocking via waitUntil)
        const updated = {
            processedGameIds: [...processedSet],
            periodScores,
            soScorers,
            goalieSeasonGA,
            goalieDecisions,
            updatedAt: new Date().toISOString(),
        };
        context.waitUntil(
            env.H2H_DATA.put(R2_KEY, JSON.stringify(updated), {
                httpMetadata: { contentType: 'application/json' },
            }).catch(() => {}) // silently ignore write errors
        );

        return new Response(JSON.stringify({ periodScores, soScorers, goalieSeasonGA, goalieDecisions }), {
            headers: { ...jsonHeaders, 'Cache-Control': 'public, max-age=3600' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch season breakdown' }), {
            status: 500,
            headers: jsonHeaders,
        });
    }
}
