// Cloudflare Pages Function for league stat leaders
import { getCurrentSeason } from '../../../js/seasonConfig.js';

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
            fetchCategory(`https://api-web.nhle.com/v1/skater-stats-leaders/${getCurrentSeason()}/2?categories=goals&limit=100`, 'goals'),
            fetchCategory(`https://api-web.nhle.com/v1/skater-stats-leaders/${getCurrentSeason()}/2?categories=assists&limit=100`, 'assists'),
            fetchCategory(`https://api-web.nhle.com/v1/skater-stats-leaders/${getCurrentSeason()}/2?categories=points&limit=100`, 'points'),
            fetchCategory(`https://api-web.nhle.com/v1/skater-stats-leaders/${getCurrentSeason()}/2?categories=plusMinus&limit=100`, 'plusMinus'),
            // Goalie stats
            fetchCategory(`https://api-web.nhle.com/v1/goalie-stats-leaders/${getCurrentSeason()}/2?categories=wins&limit=100`, 'wins'),
            fetchCategory(`https://api-web.nhle.com/v1/goalie-stats-leaders/${getCurrentSeason()}/2?categories=savePctg&limit=100`, 'savePctg'),
            fetchCategory(`https://api-web.nhle.com/v1/goalie-stats-leaders/${getCurrentSeason()}/2?categories=goalsAgainstAverage&limit=100`, 'goalsAgainstAverage'),
            fetchCategory(`https://api-web.nhle.com/v1/goalie-stats-leaders/${getCurrentSeason()}/2?categories=shutouts&limit=100`, 'shutouts')
        ]);

        // Fail if any category is missing, so the /api middleware serves the last complete copy
        const data = { goals, assists, points, plusMinus, wins, savePctg, goalsAgainstAverage, shutouts };
        const missing = Object.keys(data).filter(k => !data[k]);
        if (missing.length) throw new Error(`Missing categories: ${missing.join(', ')}`);

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
