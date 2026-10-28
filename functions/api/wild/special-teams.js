// Cloudflare Pages Function — Wild power play / penalty kill (official stats + R2-cached PBP splits)
// Official per-game numbers come from the NHL stats API on every request; period / score-state
// splits are derived from play-by-play once per game and stored in R2, along with the last good
// response, which is served when the stats API fails.

import { getCurrentSeason } from '../../../js/seasonConfig.js';
import { specialTeamsStatsUrls, extractSpecialTeams, statsRows, resolveSpecialTeams } from '../../../js/specialTeams.js';

// Keep each request well under the Workers subrequest limit; later requests pick up the rest
const MAX_NEW_GAMES = 40;

export async function onRequest(context) {
    const { env } = context;
    const SEASON = getCurrentSeason();
    const R2_KEY = `wild/special-teams-${SEASON}-v1.json`;

    const jsonHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const urls = specialTeamsStatsUrls(SEASON);
        const report = url => fetch(url).then(r => r.json()).then(statsRows).catch(() => null);
        const [powerPlay, penaltyKill, league, cachedObj] = await Promise.all([
            report(urls.powerPlay),
            report(urls.penaltyKill),
            report(urls.league),
            env.H2H_DATA.get(R2_KEY).then(obj => obj ? obj.json() : null).catch(() => null),
        ]);

        const splits = { ...(cachedObj?.splits ?? {}) };

        // Derive splits for games not yet cached
        const newIds = (powerPlay ?? []).map(g => g.gameId).filter(id => !splits[id]).slice(0, MAX_NEW_GAMES);
        const BATCH_SIZE = 12;
        for (let i = 0; i < newIds.length; i += BATCH_SIZE) {
            const batch = newIds.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(id =>
                    fetch(`https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`, { redirect: 'follow' })
                        .then(r => r.json())
                )
            );
            results.forEach((result, j) => {
                if (result.status === 'fulfilled' && result.value?.plays?.length) {
                    splits[batch[j]] = extractSpecialTeams(result.value);
                }
            });
        }

        const result = resolveSpecialTeams({ powerPlay, penaltyKill, league, splits, lastGood: cachedObj?.lastGood });
        if (!result) throw new Error('Stats API unavailable and nothing cached');
        const { payload, stale } = result;

        // Store new splits and the latest good response (only when something changed)
        if (!stale && (newIds.length > 0 || JSON.stringify(payload) !== JSON.stringify(cachedObj?.lastGood))) {
            context.waitUntil(
                env.H2H_DATA.put(R2_KEY, JSON.stringify({ splits, lastGood: payload, updatedAt: new Date().toISOString() }), {
                    httpMetadata: { contentType: 'application/json' },
                }).catch(() => {}) // silently ignore write errors
            );
        }

        return new Response(JSON.stringify(payload), {
            headers: { ...jsonHeaders, 'Cache-Control': `public, max-age=${stale ? 300 : 1800}` },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch special teams stats' }), {
            status: 500,
            headers: jsonHeaders,
        });
    }
}
