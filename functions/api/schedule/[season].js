// Cloudflare Pages Function for Wild schedule endpoint. Cached by game window (js/wildSchedule.js):
// 5 min from 30 min before a game until it's final, otherwise until the next window (at most 1h).
import { fetchWildSchedule, wildScheduleTtl } from '../../../js/wildSchedule.js';
export async function onRequest(context) {
    const { params } = context;
    const season = params.season;

    try {
        const response = await fetchWildSchedule(season);

        if (!response.ok) throw new Error(`NHL API error: ${response.status}`);
        const data = await response.json();

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': `public, max-age=${wildScheduleTtl(data)}`
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch schedule' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
