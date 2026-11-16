// Cloudflare Pages Function for all-team career totals of the current Wild roster.
// Rebuilt only after Wild games finish (js/gameTriggered.js); the last build is shared via R2.
import { getCurrentSeason } from '../../../js/seasonConfig.js';
import { loadDataset } from '../../../js/gameTriggeredData.js';

export async function onRequest({ env }) {
    try {
        // Landing pages uncached: per-call caching would exceed the Worker subrequest limit
        const { data } = await loadDataset('careerTotals', { season: getCurrentSeason(), bucket: env?.H2H_DATA, landingTtl: 0 });
        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                // The /api middleware reuses this for up to an hour per data center (FRESH_CAPS)
                'Cache-Control': 'public, max-age=3600'
            }
        });
    } catch (error) {
        console.error('Career totals error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch career totals.' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
