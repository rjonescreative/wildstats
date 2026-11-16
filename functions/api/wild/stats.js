// Cloudflare Pages Function for Wild team stats.
// Rebuilt only after Wild games finish (js/gameTriggered.js); the last build is shared via R2.
import { getCurrentSeason } from '../../../js/seasonConfig.js';
import { loadDataset } from '../../../js/gameTriggeredData.js';

export async function onRequest({ env }) {
    try {
        const { data } = await loadDataset('wildStats', { season: getCurrentSeason(), bucket: env?.H2H_DATA });
        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                // Each data center checks for a newly finished game at most every 5 min
                'Cache-Control': 'public, max-age=300'
            }
        });
    } catch (error) {
        console.error('Wild team stats error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch Wild stats' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
