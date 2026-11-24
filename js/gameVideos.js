// Every video for one game, from both teams — shared by server.js and the Cloudflare Function
// (/api/media/game/:gameId), shown on the Media → Game-by-Game page.
//
// Highlights, recaps and condensed games carry a gameid-… tag, so one tagged request finds them.
// Interviews (pregame, postgame) only carry the team's teamid-… tag, so each team's feed is read
// around the game: from the start of game day (ET) until noon-ish the next day, which catches
// postgame interviews from late or West Coast games posted the next morning. Untagged videos are
// matched by time and title:
//   - before puck drop: kept, unless it's a postgame interview (that belongs to the previous game)
//   - from puck drop to the end of game day (or 5 hours after puck drop, if later): kept
//   - the next morning: only postgame interviews (so a back-to-back's pregame doesn't land here)
// Videos tagged with a different game are left out. Duplicates are removed by js/videoFilters.js,
// then cut down to one clip per play (the feeds keep different-length cuts of a play; here one is
// enough).
//
// The video feed has no date filter and is newest first, so each team's feed is searched by
// offset: the date range of each page sets how far to jump (a team posts ~250 videos a month).

import { upstreamFetch } from './upstream.js';
import { filterVideos } from './videoFilters.js';

const VIDEOS = 'https://forge-dapi.d3.nhle.com/v2/content/en-us/videos';
const PAGE = 100;            // the feed's largest page
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NEXT_MORNING = 38 * HOUR; // window end: 2pm ET the day after the game
const MAX_JUMPS = 8;         // offset searches before settling for the current page
const MAX_PAGES = 6;         // pages read through one window
const POSTGAME = /post[\s-]?game/i;

const time = item => Date.parse(item.contentDate);
const tagSlugs = item => (item.tags ?? []).map(t => t.slug);
const gameIdOf = item => tagSlugs(item).find(s => s?.startsWith('gameid-'))?.slice(7) ?? null;

async function nhlJson(url, ttl) {
    const response = await upstreamFetch(url, { redirect: 'follow', ttl });
    if (!response.ok) throw new Error(`NHL API error ${response.status} for ${url}`);
    return response.json();
}

// Midnight Eastern time on a YYYY-MM-DD date, in ms
export function easternMidnight(date) {
    const [y, m, d] = date.split('-').map(Number);
    const guess = Date.UTC(y, m - 1, d, 5); // midnight EST; 1am EDT
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(guess));
    return guess - hour * HOUR;
}

const feedPage = (teamId, skip) =>
    nhlJson(`${VIDEOS}?tags.slug=teamid-${teamId}&$limit=${PAGE}&$skip=${skip}`, 300).then(d => d.items ?? []);

// A team's videos posted in [from, to). Jumps through the newest-first feed to the page holding
// `to`, then reads forward until it passes `from`.
async function teamVideosBetween(teamId, from, to) {
    let skip = 0, lo = 0, hi = Infinity;
    let page = [];
    for (let jump = 0; jump < MAX_JUMPS; jump++) {
        page = await feedPage(teamId, skip);
        if (page.length === 0) {
            if (skip === 0) return [];
            hi = skip; // past the end of the feed
            skip = Math.max(lo, Math.floor((lo + hi) / 2) - PAGE / 2);
            continue;
        }
        const newest = time(page[0]), oldest = time(page.at(-1));
        const perMs = page.length > 1 && newest > oldest ? (page.length - 1) / (newest - oldest) : 250 / (30 * DAY);
        if (oldest >= to && page.length === PAGE) {
            // The whole page is newer than the window: jump deeper by the time still to cover
            lo = skip + page.length;
            skip = Math.max(lo, Math.min(lo + Math.floor((oldest - to) * perMs), hi - PAGE));
            continue;
        }
        if (newest < to && skip > lo) {
            // Jumped past the window's newest videos: step back
            hi = skip;
            skip = Math.max(lo, skip - Math.ceil((to - newest) * perMs) - 10);
            continue;
        }
        break;
    }

    const found = [];
    for (let read = 0; read < MAX_PAGES && page.length; read++) {
        found.push(...page.filter(item => time(item) >= from && time(item) < to));
        if (time(page.at(-1)) < from || page.length < PAGE) break;
        skip += page.length;
        page = await feedPage(teamId, skip);
    }
    return found;
}

// Whether an untagged team video posted at `t` belongs to this game (see top of file)
function belongsToGame(item, { dayStart, start }) {
    const t = time(item);
    const postgame = POSTGAME.test(item.title ?? '');
    if (t < start) return !postgame && t >= dayStart;
    if (t < Math.max(dayStart + DAY, start + 5 * HOUR)) return true;
    return postgame && t < dayStart + NEXT_MORNING;
}

const isNhlCopy = item => tagSlugs(item).some(s => s === 'nhl' || s === 'real-time-highlight');
const seconds = item => (item.fields?.duration ?? '').split(':').reduce((sum, part) => sum * 60 + Number(part || 0), 0);

// One clip per play (same game event): the NHL's copy, else the longest
function onePerPlay(items) {
    const best = new Map();
    const better = (a, b) => isNhlCopy(a) !== isNhlCopy(b) ? isNhlCopy(a) : seconds(a) > seconds(b);
    for (const item of items) {
        const event = item.fields?.statsEventId;
        if (!event) continue;
        const key = `${gameIdOf(item)}|${event}`;
        if (!best.has(key) || better(item, best.get(key))) best.set(key, item);
    }
    return items.filter(item => !item.fields?.statsEventId || best.get(`${gameIdOf(item)}|${item.fields.statsEventId}`) === item);
}

function toVideo(item, teamIds) {
    const slugs = tagSlugs(item);
    return {
        id: item._entityId,
        title: item.title || '',
        duration: item.fields?.duration || '',
        brightcoveId: item.fields?.brightcoveId || '',
        brightcoveAccountId: item.fields?.brightcoveAccountId || '6415718365001',
        thumbnail: item.thumbnail?.templateUrl?.replace('{formatInstructions}', 't_ratio16_9-size40/f_auto/') || '',
        contentDate: item.contentDate || '',
        slug: item.slug || '',
        // Which of the two teams the video is tagged with (both for national recaps / condensed games)
        teams: teamIds.filter(id => slugs.includes(`teamid-${id}`)),
    };
}

/**
 * → { gameId, gameDate, homeTeam: { id, abbrev }, awayTeam: { id, abbrev }, videos: [...] },
 * videos oldest first. `final` says whether the game is over (callers cache finished games longer).
 */
export async function buildGameVideos(gameId) {
    const game = await nhlJson(`https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`, 600);
    const start = Date.parse(game.startTimeUTC);
    const dayStart = easternMidnight(game.gameDate);
    const window = { dayStart, start };
    const teamIds = [game.homeTeam.id, game.awayTeam.id];

    const [tagged, ...teamFeeds] = await Promise.all([
        nhlJson(`${VIDEOS}?tags.slug=gameid-${gameId}&$limit=${PAGE}`, 300).then(d => d.items ?? []),
        ...teamIds.map(id => teamVideosBetween(id, dayStart, dayStart + NEXT_MORNING)),
    ]);

    const byId = new Map(tagged.map(item => [item._entityId, item]));
    for (const item of teamFeeds.flat()) {
        if (byId.has(item._entityId)) continue;
        const taggedGame = gameIdOf(item);
        if (taggedGame ? taggedGame === String(gameId) : belongsToGame(item, window)) byId.set(item._entityId, item);
    }

    const items = [...byId.values()].sort((a, b) => time(a) - time(b));
    return {
        gameId: String(gameId),
        gameDate: game.gameDate,
        final: ['OFF', 'FINAL'].includes(game.gameState),
        homeTeam: { id: game.homeTeam.id, abbrev: game.homeTeam.abbrev },
        awayTeam: { id: game.awayTeam.id, abbrev: game.awayTeam.abbrev },
        videos: onePerPlay(filterVideos(items, 'all')).map(item => toVideo(item, teamIds)),
    };
}

// Browser cache seconds: games still collecting videos (through the next afternoon) refresh often
export function gameVideosMaxAge(result, now = Date.now()) {
    const settled = result.final && now >= easternMidnight(result.gameDate) + NEXT_MORNING + 2 * HOUR;
    return settled ? 86400 : 600;
}
