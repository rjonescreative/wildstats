import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setDefaultResultOrder } from 'dns';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// Force IPv4 for DNS resolution (IPv6 seems to hang on this system)
setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// R2 client for local dev (credentials from .env)
const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

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

// Any-team schedule endpoint — used for the multi-team points chart
app.get('/api/team-schedule/:team/:season', async (req, res) => {
    const { team, season } = req.params;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
            `https://api-web.nhle.com/v1/club-schedule-season/${team.toUpperCase()}/${season}`,
            { signal: controller.signal, redirect: 'follow' }
        );
        clearTimeout(timeout);

        const data = await response.json();
        res.set('Cache-Control', 'public, max-age=300');
        res.json(data);
    } catch (error) {
        console.error(`Error fetching schedule for ${team}:`, error);
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
        } else if (type === 'condensed') {
            tags = 'condensed-game,teamid-30';
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
                        title: item.headline || item.title || '',
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

// Milestones data endpoint — reads pre-aggregated JSON from R2
app.get('/api/milestones/leaders', async (req, res) => {
    try {
        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: 'milestones/franchise-leaders.json',
        });
        const response = await r2.send(command);
        const data = await response.Body.transformToString();
        res.set('Content-Type', 'application/json');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(data);
    } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
            res.status(404).json({ error: 'Milestones data not available yet. Run the seed script first.' });
        } else {
            console.error('R2 error:', err.message);
            res.status(500).json({ error: 'Failed to fetch milestones data.' });
        }
    }
});

// Career totals endpoint — fetches all-team career stats for current Wild roster
// Returns: { playerId: { gamesPlayed, goals, assists, points } }
app.get('/api/milestones/career-totals', async (req, res) => {
    try {
        // Step 1: get current Wild roster
        const rosterController = new AbortController();
        const rosterTimeout = setTimeout(() => rosterController.abort(), 10000);
        const rosterRes = await fetch('https://api-web.nhle.com/v1/club-stats/MIN/20252026/2', {
            signal: rosterController.signal,
            redirect: 'follow',
        });
        clearTimeout(rosterTimeout);
        const rosterData = await rosterRes.json();

        const players = [
            ...(rosterData.skaters || []).map(p => p.playerId),
            ...(rosterData.goalies  || []).map(p => p.playerId),
        ];

        // Step 2: fetch each player's landing page in parallel for career totals
        const results = await Promise.allSettled(
            players.map(async playerId => {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 8000);
                try {
                    const r = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/landing`, {
                        signal: ctrl.signal,
                        redirect: 'follow',
                    });
                    clearTimeout(t);
                    const d = await r.json();
                    const rs = d.careerTotals?.regularSeason ?? {};
                    return {
                        playerId,
                        gamesPlayed: rs.gamesPlayed ?? 0,
                        goals:       rs.goals       ?? 0,
                        assists:     rs.assists     ?? 0,
                        points:      rs.points      ?? 0,
                    };
                } catch {
                    clearTimeout(t);
                    return { playerId, gamesPlayed: 0, goals: 0, assists: 0, points: 0 };
                }
            })
        );

        const careerTotals = {};
        results.forEach(r => {
            if (r.status === 'fulfilled') {
                const { playerId, ...stats } = r.value;
                careerTotals[playerId] = stats;
            }
        });

        res.set('Cache-Control', 'public, max-age=3600'); // 1 hour
        res.json(careerTotals);
    } catch (error) {
        console.error('Error fetching career totals:', error);
        res.status(500).json({ error: 'Failed to fetch career totals data' });
    }
});

// H2H data endpoint — reads pre-aggregated JSON from R2
app.get('/api/h2h/:opponent', async (req, res) => {
    const opponent = req.params.opponent.toUpperCase();
    try {
        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: `h2h/MIN-${opponent}.json`,
        });
        const response = await r2.send(command);
        const data = await response.Body.transformToString();
        res.set('Content-Type', 'application/json');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(data);
    } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
            res.status(404).json({ error: 'No H2H data available for this opponent yet. Run the seed script first.' });
        } else {
            console.error('R2 error:', err.message);
            res.status(500).json({ error: 'Failed to fetch H2H data.' });
        }
    }
});

// ─── Shared helper: extract period + SO data from a play-by-play response ──
function extractGameData(pbp) {
    const homeId = pbp.homeTeam?.id;
    const awayId = pbp.awayTeam?.id;
    const isMinHome = pbp.homeTeam?.abbrev === 'MIN';
    const minTeamId = isMinHome ? homeId : awayId;
    const periodMap = {};
    const newSoScorers = {};
    const goalieEvents = {}; // MIN goalie id → shot/goal event count (to find primary)
    const goalieGA = {};     // MIN goalie id → { P1, P2, P3, OT, SO } goals against

    (pbp.plays ?? []).forEach(play => {
        const pd = play.periodDescriptor ?? {};
        const teamId = play.details?.eventOwnerTeamId;
        const goalieId = play.details?.goalieInNetId;

        // Period scoring: only count goals
        if (play.typeDescKey === 'goal') {
            const key = `${pd.number}|${pd.periodType}`;
            if (!periodMap[key]) {
                periodMap[key] = { period: pd.number, periodType: pd.periodType, home: 0, away: 0 };
            }
            if (teamId === homeId)      periodMap[key].home++;
            else if (teamId === awayId) periodMap[key].away++;
        }

        // SO shooter tracking: goals + shots + misses for MIN players
        if (pd.periodType === 'SO' && teamId === minTeamId) {
            const isGoal    = play.typeDescKey === 'goal';
            const isAttempt = isGoal || play.typeDescKey === 'shot-on-goal' || play.typeDescKey === 'missed-shot';
            if (isAttempt) {
                const id = isGoal ? play.details?.scoringPlayerId : play.details?.shootingPlayerId;
                if (id) {
                    if (!newSoScorers[id]) newSoScorers[id] = { goals: 0, attempts: 0 };
                    newSoScorers[id].attempts++;
                    if (isGoal) newSoScorers[id].goals++;
                }
            }
        }

        // Goalie tracking: shots/goals by the opposing team identify which MIN goalie is in net
        if (goalieId && teamId && teamId !== minTeamId) {
            const gid = String(goalieId);
            goalieEvents[gid] = (goalieEvents[gid] ?? 0) + 1;
            if (play.typeDescKey === 'goal') {
                const pk = pd.periodType === 'REG' ? `P${pd.number}` : pd.periodType;
                if (!goalieGA[gid]) goalieGA[gid] = {};
                goalieGA[gid][pk] = (goalieGA[gid][pk] ?? 0) + 1;
            }
        }
    });

    // Primary MIN goalie = one who faced the most events (shots + goals against)
    const primaryGoalieId = Object.entries(goalieEvents).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
        periods: Object.values(periodMap).sort((a, b) => a.period - b.period),
        soScorers: newSoScorers,
        isMinHome,
        primaryGoalieId,
        goalieGA,
    };
}

// Wild season breakdown — incremental R2 cache of per-game period scores
app.get('/api/wild/season-breakdown', async (req, res) => {
    const R2_KEY = 'wild/season-breakdown-20252026-v5.json';

    try {
        // 1. Read cached data from R2
        let cached = { processedGameIds: [], periodScores: {}, soScorers: {}, goalieSeasonGA: {}, goalieDecisions: {} };
        try {
            const obj = await r2.send(new GetObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: R2_KEY,
            }));
            cached = JSON.parse(await obj.Body.transformToString());
        } catch (e) {
            if (e.name !== 'NoSuchKey' && e.$metadata?.httpStatusCode !== 404) {
                console.warn('R2 read warning:', e.message);
            }
            // Cache miss or error → start fresh, will populate below
        }

        const processedSet = new Set(cached.processedGameIds ?? []);

        // 2. Fetch MIN schedule to find all completed games
        const schedResponse = await fetch(
            'https://api-web.nhle.com/v1/club-schedule-season/MIN/20252026',
            { redirect: 'follow' }
        );
        if (!schedResponse.ok || !schedResponse.headers.get('content-type')?.includes('json')) {
            // Schedule unavailable — return whatever we have cached
            return res.set('Cache-Control', 'public, max-age=300').json({
                periodScores:    cached.periodScores,
                soScorers:       cached.soScorers,
                goalieSeasonGA:  cached.goalieSeasonGA,
                goalieDecisions: cached.goalieDecisions,
            });
        }
        const schedData = await schedResponse.json();
        const completedGames = (schedData.games ?? []).filter(
            g => g.gameType === 2 && (g.gameState === 'FINAL' || g.gameState === 'OFF')
        );

        // 3. Identify games not yet in cache
        const newGames = completedGames.filter(g => !processedSet.has(g.id));

        if (newGames.length === 0) {
            // Everything cached — fast path
            return res.set('Cache-Control', 'public, max-age=3600').json({
                periodScores:    cached.periodScores,
                soScorers:       cached.soScorers,
                goalieSeasonGA:  cached.goalieSeasonGA,
                goalieDecisions: cached.goalieDecisions,
            });
        }

        console.log(`Season breakdown: fetching ${newGames.length} new game(s)`);

        // 4. Fetch PBP for new games only, in batches
        const BATCH_SIZE = 12;
        const pbpResults = [];
        for (let i = 0; i < newGames.length; i += BATCH_SIZE) {
            const batch = newGames.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(
                batch.map(game => {
                    const ctrl = new AbortController();
                    const t = setTimeout(() => ctrl.abort(), 10000);
                    return fetch(`https://api-web.nhle.com/v1/gamecenter/${game.id}/play-by-play`, {
                        signal: ctrl.signal, redirect: 'follow'
                    }).then(r => { clearTimeout(t); return r.json(); })
                    .catch(err => { clearTimeout(t); throw err; });
                })
            );
            pbpResults.push(...batchResults);
        }

        // 5. Merge new data into cached data
        const periodScores    = { ...cached.periodScores };
        const soScorers       = { ...cached.soScorers };
        const goalieSeasonGA  = { ...cached.goalieSeasonGA };
        const goalieDecisions = { ...cached.goalieDecisions };

        newGames.forEach((game, i) => {
            const result = pbpResults[i];
            if (result.status !== 'fulfilled') return;
            const { periods, soScorers: newSO, isMinHome, primaryGoalieId, goalieGA } = extractGameData(result.value);
            if (periods.length > 0) {
                periodScores[game.id] = periods;
                processedSet.add(game.id);
            }
            Object.entries(newSO).forEach(([id, { goals, attempts }]) => {
                if (!soScorers[id]) soScorers[id] = { goals: 0, attempts: 0 };
                soScorers[id].goals   += goals;
                soScorers[id].attempts += attempts;
            });
            // Merge per-goalie GA by period
            Object.entries(goalieGA).forEach(([gid, ga]) => {
                if (!goalieSeasonGA[gid]) goalieSeasonGA[gid] = {};
                Object.entries(ga).forEach(([pk, count]) => {
                    goalieSeasonGA[gid][pk] = (goalieSeasonGA[gid][pk] ?? 0) + count;
                });
            });
            // Merge goalie home/away decision
            if (primaryGoalieId) {
                if (!goalieDecisions[primaryGoalieId]) {
                    goalieDecisions[primaryGoalieId] = { homeW: 0, homeL: 0, homeOT: 0, awayW: 0, awayL: 0, awayOT: 0 };
                }
                const myScore  = isMinHome ? game.homeTeam?.score : game.awayTeam?.score;
                const oppScore = isMinHome ? game.awayTeam?.score : game.homeTeam?.score;
                const last = game.gameOutcome?.lastPeriodType ?? 'REG';
                const outcome = myScore > oppScore ? 'W' : (last === 'OT' || last === 'SO') ? 'OT' : 'L';
                const prefix = isMinHome ? 'home' : 'away';
                goalieDecisions[primaryGoalieId][`${prefix}${outcome}`]++;
            }
        });

        // 6. Write updated cache back to R2 (non-blocking — don't await)
        const updated = {
            processedGameIds: [...processedSet],
            periodScores,
            soScorers,
            goalieSeasonGA,
            goalieDecisions,
            updatedAt: new Date().toISOString(),
        };
        r2.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: R2_KEY,
            Body: JSON.stringify(updated),
            ContentType: 'application/json',
        })).catch(e => console.warn('R2 write warning:', e.message));

        res.set('Cache-Control', 'public, max-age=3600');
        res.json({ periodScores, soScorers, goalieSeasonGA, goalieDecisions });
    } catch (error) {
        console.error('Error fetching season breakdown:', error);
        res.status(500).json({ error: 'Failed to fetch season breakdown' });
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
