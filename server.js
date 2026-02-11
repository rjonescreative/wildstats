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

// Wild videos endpoint
app.get('/api/media/videos', async (req, res) => {
    try {
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 12;
        const type = req.query.type || 'all';

        // Build tags filter based on type
        let tags = 'teamid-30';
        if (type === 'highlights') {
            tags = 'highlight,teamid-30';
        } else if (type === 'recaps') {
            tags = 'game-recap,teamid-30';
        }

        // Fetch extra to account for filtered duplicates and recaps
        const fetchLimit = type === 'highlights' ? limit * 3 : limit * 2;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
            `https://forge-dapi.d3.nhle.com/v2/content/en-us/videos?tags.slug=${encodeURIComponent(tags)}&$skip=${offset}&$limit=${fetchLimit}`,
            { signal: controller.signal, redirect: 'follow' }
        );
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`NHL API error: ${response.status}`);
        }

        const data = await response.json();
        let items = data.items || [];
        const fetchedCount = items.length;

        // Filter out shorter duplicates (same title + same day, keep longer duration)
        const durationToSeconds = (d) => {
            if (!d) return 0;
            const parts = d.split(':').map(Number);
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            return 0;
        };

        const sameDayTitleMap = new Map();
        items.forEach(item => {
            const title = item.title || '';
            const date = (item.contentDate || '').split('T')[0];
            const key = `${date}|${title}`;
            const duration = durationToSeconds(item.fields?.duration);

            if (!sameDayTitleMap.has(key) || duration > sameDayTitleMap.get(key).duration) {
                sameDayTitleMap.set(key, { item, duration });
            }
        });
        const longerVersionIds = new Set([...sameDayTitleMap.values()].map(v => v.item._entityId));
        items = items.filter(item => longerVersionIds.has(item._entityId));

        // Filter out duplicates (matching duration + at least one other field)
        const seen = [];
        items = items.filter(item => {
            const duration = item.fields?.duration || '';
            const title = item.title || '';
            const description = item.fields?.description || '';
            const thumbnail = item.thumbnail?.templateUrl || '';

            const isDuplicate = seen.some(s =>
                s.duration === duration && (
                    s.title === title ||
                    s.description === description ||
                    s.thumbnail === thumbnail
                )
            );

            if (!isDuplicate) {
                seen.push({ duration, title, description, thumbnail });
                return true;
            }
            return false;
        });

        // For highlights, exclude game recaps
        if (type === 'highlights') {
            items = items.filter(item => {
                const title = (item.title || '').toLowerCase();
                const description = (item.fields?.description || '').toLowerCase();
                return !title.includes('recap') && !description.includes('recap');
            });
        }

        // Trim to requested limit
        items = items.slice(0, limit);

        const videos = items.map(item => ({
            id: item._entityId,
            title: item.title || '',
            description: item.fields?.description || '',
            duration: item.fields?.duration || '',
            brightcoveId: item.fields?.brightcoveId || '',
            brightcoveAccountId: item.fields?.brightcoveAccountId || '6415718365001',
            thumbnail: item.thumbnail?.templateUrl?.replace('{formatInstructions}', 't_ratio16_9-size40/f_auto/') || '',
            contentDate: item.contentDate || ''
        }));

        res.set('Cache-Control', 'public, max-age=300');
        res.json({
            videos,
            total: data.pagination?.total || videos.length,
            hasMore: fetchedCount === fetchLimit,
            nextOffset: offset + fetchedCount
        });
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

// Wild news endpoint (combines The Athletic RSS + NHL.com + Star Tribune)
app.get('/api/news/wild', async (req, res) => {
    try {
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 6;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // Fetch from all sources in parallel (get more items for pagination)
        const [athleticResponse, nhlResponse, stribResponse] = await Promise.all([
            fetch('https://www.nytimes.com/athletic/rss/nhl/wild/', {
                signal: controller.signal,
                redirect: 'follow'
            }).catch(() => null),
            fetch('https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-30&limit=20', {
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

        // Parse Athletic RSS (get all items)
        if (athleticResponse && athleticResponse.ok) {
            const xml = await athleticResponse.text();
            const items = xml.split('<item>').slice(1);
            items.forEach(item => {
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
                nhlData.items.forEach(item => {
                    // Skip non-news content (game day guides, etc.)
                    if (item.slug && item.slug.startsWith('min-game-day-guide')) return;
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
                        image: '/images/startribune-placeholder.png',
                        source: 'Star Tribune',
                        date: pubDate ? new Date(pubDate) : new Date(0)
                    });
                }
            });
        }

        // Sort by date (newest first)
        articles.sort((a, b) => b.date - a.date);

        // Apply pagination
        const paginatedArticles = articles.slice(offset, offset + limit).map(article => ({
            title: article.title,
            link: article.link,
            image: article.image,
            source: article.source
        }));

        res.set('Cache-Control', 'public, max-age=1800');
        res.json({
            articles: paginatedArticles,
            total: articles.length,
            hasMore: offset + limit < articles.length
        });
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
