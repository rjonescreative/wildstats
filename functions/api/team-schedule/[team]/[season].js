// Cloudflare Pages Function — any-team schedule endpoint
import { upstreamFetch } from '../../../../js/upstream.js';
import { fetchWildSchedule, wildScheduleTtl } from '../../../../js/wildSchedule.js';
export async function onRequest(context) {
    const { params } = context;
    const team   = params.team.toUpperCase();
    const season = params.season;

    try {
        // The Wild's schedule shares the game-window cache with every other caller of that URL
        const response = team === 'MIN'
            ? await fetchWildSchedule(season)
            : await upstreamFetch(`https://api-web.nhle.com/v1/club-schedule-season/${team}/${season}`, { redirect: 'follow' });

        if (!response.ok) {
            return new Response(
                JSON.stringify({ error: `NHL API error: ${response.status}` }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        let data;
        try {
            data = await response.json();
        } catch {
            return new Response(
                JSON.stringify({ error: 'Invalid response from NHL API' }),
                { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': `public, max-age=${team === 'MIN' ? wildScheduleTtl(data) : 300}`,
            },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch schedule' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
