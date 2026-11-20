// Cloudflare Pages Function — scoring first and time leading/trailing for every NHL team.
// Rebuilt only after league games finish (js/gameTriggered.js, js/gameFlow.js); the last build is
// shared via R2. Response: { teams: { [abbrev]: totals }, through } (see teamGameFlow).
import { getCurrentSeason } from '../../../js/seasonConfig.js';
import { loadDataset } from '../../../js/gameTriggeredData.js';
import { gameFlowResponse } from '../../../js/gameFlow.js';

export async function onRequest({ env }) {
    try {
        const { data } = await loadDataset('gameFlow', { season: getCurrentSeason(), bucket: env?.H2H_DATA });
        return new Response(JSON.stringify(gameFlowResponse(data)), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                // Each data center checks for newly finished games at most every 5 min
                'Cache-Control': 'public, max-age=300'
            }
        });
    } catch (error) {
        console.error('game flow error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch game flow' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
