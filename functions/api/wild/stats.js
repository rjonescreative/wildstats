// Cloudflare Pages Function for Wild team stats
import { getCurrentSeason } from '../../../js/seasonConfig.js';
import { addFaceoffCounts, fetchFaceoffReport } from '../../../js/faceoffs.js';
import { addGoalieShootoutLosses, fetchGoalieShootoutReport } from '../../../js/goalieShootouts.js';

export async function onRequest() {
    try {
        const [response, faceoffs, shootouts] = await Promise.all([
            fetch(`https://api-web.nhle.com/v1/club-stats/MIN/${getCurrentSeason()}/2`),
            fetchFaceoffReport(getCurrentSeason()),
            fetchGoalieShootoutReport(getCurrentSeason())
        ]);
        if (!response.ok) throw new Error(`NHL API error: ${response.status}`);
        const data = addGoalieShootoutLosses(addFaceoffCounts(await response.json(), faceoffs), shootouts);

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300'
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch Wild stats' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
