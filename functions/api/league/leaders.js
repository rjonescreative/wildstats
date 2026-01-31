// Cloudflare Pages Function for league stat leaders
export async function onRequest() {
    const fetchCategory = async (url, category) => {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.error(`Failed to fetch ${category}: ${res.status}`);
                return null;
            }
            return await res.json();
        } catch (error) {
            console.error(`Error fetching ${category}:`, error);
            return null;
        }
    };

    try {
        const [goals, assists, points, plusMinus, wins, savePctg, goalsAgainstAverage, shutouts] = await Promise.all([
            // Skater stats
            fetchCategory('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=goals&limit=100', 'goals'),
            fetchCategory('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=assists&limit=100', 'assists'),
            fetchCategory('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=points&limit=100', 'points'),
            fetchCategory('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=plusMinus&limit=100', 'plusMinus'),
            // Goalie stats
            fetchCategory('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=wins&limit=100', 'wins'),
            fetchCategory('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=savePctg&limit=100', 'savePctg'),
            fetchCategory('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=goalsAgainstAverage&limit=100', 'goalsAgainstAverage'),
            fetchCategory('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=shutouts&limit=100', 'shutouts')
        ]);

        // Filter out null values and build response
        const data = {};
        if (goals) data.goals = goals;
        if (assists) data.assists = assists;
        if (points) data.points = points;
        if (plusMinus) data.plusMinus = plusMinus;
        if (wins) data.wins = wins;
        if (savePctg) data.savePctg = savePctg;
        if (goalsAgainstAverage) data.goalsAgainstAverage = goalsAgainstAverage;
        if (shutouts) data.shutouts = shutouts;

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
