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

        const [goals, assists, points, plusMinus, wins, savePctg, goalsAgainstAverage, shutouts] = await Promise.all([
            goalsRes.json(),
            assistsRes.json(),
            pointsRes.json(),
            plusMinusRes.json(),
            winsRes.json(),
            savePctgRes.json(),
            gaaRes.json(),
            shutoutsRes.json()
        ]);

        const data = { goals, assists, points, plusMinus, wins, savePctg, goalsAgainstAverage, shutouts };

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300'
            }
        });
    } catch (error) {
        console.error('League leaders error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch league leaders', details: error.message }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
