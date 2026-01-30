// Cloudflare Pages Function for league stat leaders
export async function onRequest() {
    try {
        const [goalsRes, assistsRes, pointsRes] = await Promise.all([
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=goals&limit=100'),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=assists&limit=100'),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=points&limit=100')
        ]);

        const goals = await goalsRes.json();
        const assists = await assistsRes.json();
        const points = await pointsRes.json();

        const data = { goals, assists, points };

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300'
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch league leaders' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
