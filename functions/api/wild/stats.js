// Cloudflare Pages Function for Wild team stats
import { getCurrentSeason } from '../../../js/seasonConfig.js';
import { addFaceoffCounts, fetchFaceoffReport } from '../../../js/faceoffs.js';

export async function onRequest() {
    try {
        const [response, faceoffs] = await Promise.all([
            fetch(`https://api-web.nhle.com/v1/club-stats/MIN/${getCurrentSeason()}/2`),
            fetchFaceoffReport(getCurrentSeason())
        ]);
        if (!response.ok) throw new Error(`NHL API error: ${response.status}`);
        const data = addFaceoffCounts(await response.json(), faceoffs);

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
