import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setDefaultResultOrder } from 'dns';

// Force IPv4 for DNS resolution (IPv6 seems to hang on this system)
setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// Serve static files (CSS, JS, logos, etc.)
app.use(express.static(__dirname));

// Proxy endpoint for NHL API
app.get('/api/standings/now', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('https://api-web.nhle.com/v1/standings/now', {
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeout);

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching standings:', error);
        res.status(500).json({ error: 'Failed to fetch standings' });
    }
});

// Wild team stats endpoint
app.get('/api/wild/stats', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('https://api-web.nhle.com/v1/club-stats/MIN/20252026/2', {
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeout);

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching Wild stats:', error);
        res.status(500).json({ error: 'Failed to fetch Wild stats' });
    }
});

// League stat leaders endpoint
app.get('/api/league/leaders', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const [goalsRes, assistsRes, pointsRes, plusMinusRes, winsRes, savePctgRes, gaaRes, shutoutsRes] = await Promise.all([
            // Skater stats
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=goals&limit=100', {
                signal: controller.signal,
                redirect: 'follow'
            }),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=assists&limit=100', {
                signal: controller.signal,
                redirect: 'follow'
            }),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=points&limit=100', {
                signal: controller.signal,
                redirect: 'follow'
            }),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=plusMinus&limit=100', {
                signal: controller.signal,
                redirect: 'follow'
            }),
            // Goalie stats
            fetch('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=wins&limit=100', {
                signal: controller.signal,
                redirect: 'follow'
            }),
            fetch('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=savePctg&limit=100', {
                signal: controller.signal,
                redirect: 'follow'
            }),
            fetch('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=goalsAgainstAverage&limit=100', {
                signal: controller.signal,
                redirect: 'follow'
            }),
            fetch('https://api-web.nhle.com/v1/goalie-stats-leaders/20252026/2?categories=shutouts&limit=100', {
                signal: controller.signal,
                redirect: 'follow'
            })
        ]);
        clearTimeout(timeout);

        const goals = await goalsRes.json();
        const assists = await assistsRes.json();
        const points = await pointsRes.json();
        const plusMinus = await plusMinusRes.json();
        const wins = await winsRes.json();
        const savePctg = await savePctgRes.json();
        const goalsAgainstAverage = await gaaRes.json();
        const shutouts = await shutoutsRes.json();

        res.json({ goals, assists, points, plusMinus, wins, savePctg, goalsAgainstAverage, shutouts });
    } catch (error) {
        console.error('Error fetching league leaders:', error);
        res.status(500).json({ error: 'Failed to fetch league leaders' });
    }
});

// Player details endpoint
app.get('/api/player/:id/details', async (req, res) => {
    const playerId = req.params.id;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/landing`, {
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeout);

        const data = await response.json();
        res.set('Cache-Control', 'public, max-age=900'); // 15 min
        res.json(data);
    } catch (error) {
        console.error('Error fetching player details:', error);
        res.status(500).json({ error: 'Failed to fetch player details' });
    }
});

// Player game log endpoint
app.get('/api/player/:id/game-log', async (req, res) => {
    const playerId = req.params.id;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/game-log/20252026/2`, {
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeout);

        const data = await response.json();
        res.set('Cache-Control', 'public, max-age=300'); // 5 min
        res.json(data);
    } catch (error) {
        console.error('Error fetching game log:', error);
        res.status(500).json({ error: 'Failed to fetch game log' });
    }
});

// Wild schedule endpoint
app.get('/api/schedule/:season', async (req, res) => {
    const season = req.params.season;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
            `https://api-web.nhle.com/v1/club-schedule-season/MIN/${season}`,
            { signal: controller.signal, redirect: 'follow' }
        );
        clearTimeout(timeout);

        const data = await response.json();
        res.set('Cache-Control', 'public, max-age=300');
        res.json(data);
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});

// Live game data endpoint
app.get('/api/game/:id/live', async (req, res) => {
    const gameId = req.params.id;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`, {
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeout);

        const data = await response.json();
        // Return only the fields needed for live score display
        res.set('Cache-Control', 'public, max-age=10'); // Short cache for live data
        res.json({
            gameState: data.gameState,
            period: data.periodDescriptor,
            clock: data.clock,
            awayTeam: {
                abbrev: data.awayTeam?.abbrev,
                score: data.awayTeam?.score
            },
            homeTeam: {
                abbrev: data.homeTeam?.abbrev,
                score: data.homeTeam?.score
            }
        });
    } catch (error) {
        console.error('Error fetching live game:', error);
        res.status(500).json({ error: 'Failed to fetch live game data' });
    }
});

// Wild news endpoint (combines The Athletic RSS + NHL.com + Star Tribune)
app.get('/api/news/wild', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // Fetch from all sources in parallel
        const [athleticResponse, nhlResponse, stribResponse] = await Promise.all([
            fetch('https://www.nytimes.com/athletic/rss/nhl/wild/', {
                signal: controller.signal,
                redirect: 'follow'
            }).catch(() => null),
            fetch('https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-30&limit=5', {
                signal: controller.signal,
                redirect: 'follow'
            }).catch(() => null),
            fetch('https://www.startribune.com/sports/index.rss2', {
                signal: controller.signal,
                redirect: 'follow'
            }).catch(() => null)
        ]);
        clearTimeout(timeout);

        const articles = [];

        // Parse Athletic RSS
        if (athleticResponse && athleticResponse.ok) {
            const xml = await athleticResponse.text();
            const items = xml.split('<item>').slice(1);
            items.slice(0, 5).forEach(item => {
                const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || [])[1] || '';
                const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
                const image = (item.match(/<media:content url="([^"]*)"/) || [])[1] || '';
                const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
                if (title && link) {
                    articles.push({
                        title,
                        link,
                        image,
                        source: 'The Athletic',
                        date: pubDate ? new Date(pubDate) : new Date(0)
                    });
                }
            });
        }

        // Parse NHL.com Forge API
        if (nhlResponse && nhlResponse.ok) {
            const nhlData = await nhlResponse.json();
            if (nhlData.items && Array.isArray(nhlData.items)) {
                nhlData.items.slice(0, 5).forEach(item => {
                    // Get the thumbnail image
                    const thumbnail = item.thumbnail?.templateUrl?.replace('{formatInstructions}', 't_ratio16_9-size40/f_auto/') || '';
                    articles.push({
                        title: item.title || '',
                        link: `https://www.nhl.com/wild/news/${item.slug}`,
                        image: thumbnail,
                        source: 'NHL.com',
                        date: item.contentDate ? new Date(item.contentDate) : new Date(0)
                    });
                });
            }
        }

        // Parse Star Tribune RSS (only Wild articles)
        if (stribResponse && stribResponse.ok) {
            const xml = await stribResponse.text();
            const items = xml.split('<item>').slice(1);
            items.forEach(item => {
                // Only include items with Wild category
                if (!item.includes('domain="/sports/wild"')) return;

                const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || [])[1] || '';
                const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
                const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
                // Star Tribune doesn't include images in RSS, use placeholder
                if (title && link) {
                    articles.push({
                        title,
                        link,
                        image: '/images/startribune-placeholder.gif',
                        source: 'Star Tribune',
                        date: pubDate ? new Date(pubDate) : new Date(0)
                    });
                }
            });
        }

        // Sort by date (newest first) and take top 6, max 3 per source
        articles.sort((a, b) => b.date - a.date);
        const sourceCounts = {};
        const topArticles = [];
        for (const article of articles) {
            const count = sourceCounts[article.source] || 0;
            if (count < 3) {
                topArticles.push({
                    title: article.title,
                    link: article.link,
                    image: article.image,
                    source: article.source
                });
                sourceCounts[article.source] = count + 1;
            }
            if (topArticles.length >= 6) break;
        }

        res.set('Cache-Control', 'public, max-age=1800');
        res.json(topArticles);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});

// SPA catch-all route - serve index.html for all non-API routes
app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Wild Stats server running at http://localhost:${PORT}`);
    console.log(`Open your browser to http://localhost:${PORT}`);
});
