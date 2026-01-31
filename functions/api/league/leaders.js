// Cloudflare Pages Function for league stat leaders
export async function onRequest() {
    try {
        const [goalsRes, assistsRes, pointsRes, plusMinusRes, winsRes, savePctgRes, gaaRes, shutoutsRes] = await Promise.all([
            // Skater stats
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=goals&limit=100'),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=assists&limit=100'),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=points&limit=100'),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=plusMinus&limit=100'),
            // Goalie stats
            fetch('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=wins&limit=100'),
            fetch('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=savePctg&limit=100'),
            fetch('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=goalsAgainstAverage&limit=100'),
            fetch('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=shutouts&limit=100')
        ]);

        const goals = await goalsRes.json();
        const assists = await assistsRes.json();
        const points = await pointsRes.json();
        const plusMinus = await plusMinusRes.json();
        const wins = await winsRes.json();
        const savePctg = await savePctgRes.json();
        const goalsAgainstAverage = await gaaRes.json();
        const shutouts = await shutoutsRes.json();

        const data = { goals, assists, points, plusMinus, wins, savePctg, goalsAgainstAverage, shutouts };

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
