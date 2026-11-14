// Cloudflare Pages Function for NHL playoff bracket
import { upstreamFetch } from '../../../js/upstream.js';
export async function onRequest(context) {
    const season = context.params.season;
    try {
        const response = await upstreamFetch(`https://api-web.nhle.com/v1/playoff-bracket/${season}`, { ttl: 300 });
        if (!response.ok) throw new Error(`NHL API error: ${response.status}`);
        const data = await response.json();

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300'
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch playoff bracket' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
