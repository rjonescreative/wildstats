// Cloudflare Pages Function — Wild power play / penalty kill (official stats + R2-cached PBP splits)
// Official per-game numbers come from the NHL stats API on every request; period / score-state
// splits are derived from play-by-play once per game and stored in R2.

import { getCurrentSeason } from '../../../js/seasonConfig.js';
import { specialTeamsStatsUrls, extractSpecialTeams, buildSpecialTeamsPayload } from '../../../js/specialTeams.js';

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
        const [ppRes, pkRes, leagueRes, cachedObj] = await Promise.all([
            fetch(urls.powerPlay).then(r => r.json()),
            fetch(urls.penaltyKill).then(r => r.json()),
            fetch(urls.league).then(r => r.json()).catch(() => ({ data: [] })),
            env.H2H_DATA.get(R2_KEY).then(obj => obj ? obj.json() : null).catch(() => null),
        ]);

        const splits = { ...(cachedObj?.splits ?? {}) };

        // Derive splits for games not yet cached
        const newIds = (ppRes.data ?? []).map(g => g.gameId).filter(id => !splits[id]).slice(0, MAX_NEW_GAMES);
        if (newIds.length > 0) {
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

            context.waitUntil(
                env.H2H_DATA.put(R2_KEY, JSON.stringify({ splits, updatedAt: new Date().toISOString() }), {
                    httpMetadata: { contentType: 'application/json' },
                }).catch(() => {}) // silently ignore write errors
            );
        }

        const payload = buildSpecialTeamsPayload({
            powerPlay: ppRes.data,
            penaltyKill: pkRes.data,
            league: leagueRes.data,
            splits,
        });

        return new Response(JSON.stringify(payload), {
            headers: { ...jsonHeaders, 'Cache-Control': 'public, max-age=1800' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch special teams stats' }), {
            status: 500,
            headers: jsonHeaders,
        });
    }
}
