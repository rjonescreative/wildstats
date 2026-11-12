// Catch-all Cloudflare Pages Function for SSR <head> injection
// Intercepts SPA route requests and injects page-specific title/meta tags
// so search engines see correct metadata without needing to execute JS.
import { getSeasonLabel, getPreviousSeason, getPastSeasons, seasonFromLabel, getPlayoffYear, getCurrentSeason } from '../js/seasonConfig.js';
import { findNextGame, nextGameDescription, nextGameJsonLd } from '../js/nextGame.js';
import { parseTeamRecordsPath, teamRecordsTitle, teamRecordsDescription } from '../js/teamRecordsMeta.js';
import { isKnownRoute, isPagePath, redirectTarget } from '../js/knownRoutes.js';
import { parseVideoPath, brightcovePlayerUrl, DEFAULT_BRIGHTCOVE_ACCOUNT } from '../js/videoLinks.js';
import { buildJerseyStats, REVOLVING_DOOR_NOTE } from '../js/jerseyStats.js';
import { NHL_TEAMS as TEAMS } from '../js/teams.js';
import {
    escapeHtml, renderH2HTeamContent, renderH2HHubContent, renderTeamRecordsContent, renderPointsProgressionContent,
} from '../js/searchPrerender.js';


const NHL_TEAMS = [
    { name: 'Anaheim Ducks',         slug: 'anaheim' },
    { name: 'Boston Bruins',          slug: 'boston' },
    { name: 'Buffalo Sabres',         slug: 'buffalo' },
    { name: 'Calgary Flames',         slug: 'calgary' },
    { name: 'Carolina Hurricanes',    slug: 'carolina' },
    { name: 'Chicago Blackhawks',     slug: 'chicago' },
    { name: 'Colorado Avalanche',     slug: 'colorado' },
    { name: 'Columbus Blue Jackets',  slug: 'columbus' },
    { name: 'Dallas Stars',           slug: 'dallas' },
    { name: 'Detroit Red Wings',      slug: 'detroit' },
    { name: 'Edmonton Oilers',        slug: 'edmonton' },
    { name: 'Florida Panthers',       slug: 'florida' },
    { name: 'Los Angeles Kings',      slug: 'los-angeles' },
    { name: 'Montréal Canadiens',     slug: 'montreal' },
    { name: 'Nashville Predators',    slug: 'nashville' },
    { name: 'New Jersey Devils',      slug: 'new-jersey' },
    { name: 'New York Islanders',     slug: 'ny-islanders' },
    { name: 'New York Rangers',       slug: 'ny-rangers' },
    { name: 'Ottawa Senators',        slug: 'ottawa' },
    { name: 'Philadelphia Flyers',    slug: 'philadelphia' },
    { name: 'Pittsburgh Penguins',    slug: 'pittsburgh' },
    { name: 'San Jose Sharks',        slug: 'san-jose' },
    { name: 'Seattle Kraken',         slug: 'seattle' },
    { name: 'St. Louis Blues',        slug: 'st-louis' },
    { name: 'Tampa Bay Lightning',    slug: 'tampa-bay' },
    { name: 'Toronto Maple Leafs',    slug: 'toronto' },
    { name: 'Utah Hockey Club',       slug: 'utah' },
    { name: 'Vancouver Canucks',      slug: 'vancouver' },
    { name: 'Vegas Golden Knights',   slug: 'vegas' },
    { name: 'Washington Capitals',    slug: 'washington' },
    { name: 'Winnipeg Jets',          slug: 'winnipeg' },
];

const PAGE_META = {
    '/': {
        title: `Minnesota Wild Stats, Standings & Schedule {season} | Wild Hockey Hub`,
        description: `Minnesota Wild stats, standings, schedules, and news for {season}. Your hub for Wild hockey with live game updates, player statistics, and NHL standings.`
    },
    '/stats': {
        title: `Minnesota Wild Player Stats {season} – Goals, Assists & Points | Wild Hockey Hub`,
        description: `Minnesota Wild player statistics for {season}. View skater and goalie stats including goals, assists, points, save percentage, and more.`
    },
    '/schedule': {
        title: `Minnesota Wild {season} Schedule – Upcoming Games & Results | Wild Hockey Hub`,
        description: `Minnesota Wild game schedule for {season}. See upcoming games, past results, scores, and the full season schedule.`
    },
    '/standings': {
        title: `NHL Wildcard Standings {season} | Minnesota Wild Playoff Race | Wild Hockey Hub`,
        description: `Minnesota Wild wildcard standings for {season}. View current NHL wildcard standings, points, wins, losses, and playoff positioning.`
    },
    '/standings/wildcard': {
        title: `NHL Wildcard Standings {season} | Minnesota Wild Playoff Race | Wild Hockey Hub`,
        description: `Minnesota Wild wildcard standings for {season}. View current NHL wildcard standings, points, wins, losses, and playoff positioning.`
    },
    '/standings/division': {
        title: `NHL Division Standings {season} | Minnesota Wild | Wild Hockey Hub`,
        description: `NHL division standings for {season}. View all four division standings including where the Minnesota Wild rank in the Central Division.`
    },
    '/standings/conference': {
        title: `NHL Conference Standings {season} | Minnesota Wild | Wild Hockey Hub`,
        description: `NHL conference standings for {season}. View Eastern and Western Conference standings including Minnesota Wild playoff positioning.`
    },
    '/standings/league': {
        title: `NHL League Standings {season} | Minnesota Wild | Wild Hockey Hub`,
        description: `Full NHL league standings for {season}. See where Minnesota Wild ranks across all 32 NHL teams by points and percentage.`
    },
    '/standings/points-progression': {
        title: `NHL Points Progression Chart {season} – Team Points by Game | Wild Hockey Hub`,
        description: `NHL points progression chart for {season}. Compare the Minnesota Wild's points and points percentage game by game against every team in the Central and the rest of the NHL.`
    },
    '/media': {
        title: `Minnesota Wild Videos & Highlights {season} | Wild Hockey Hub`,
        description: `Minnesota Wild videos for {season}. Watch highlights, game recaps, interviews, and more from the Wild.`
    },
    '/media/highlights': {
        title: `Minnesota Wild Game Highlights {season} | Wild Hockey Hub`,
        description: `Minnesota Wild game highlights for {season}. Watch the best plays, goals, and saves from Wild games this season.`
    },
    '/media/recaps': {
        title: `Minnesota Wild Game Recaps {season} | Wild Hockey Hub`,
        description: `Minnesota Wild game recaps for {season}. Watch condensed game recaps and full game summaries.`
    },
    '/media/condensed': {
        title: `Minnesota Wild Condensed Games {season} | Wild Hockey Hub`,
        description: `Minnesota Wild condensed games for {season}. Watch full condensed game replays for every Wild game this season.`
    },
    '/stats/milestones': {
        title: `Minnesota Wild Player Milestones {season} | Wild Hockey Hub`,
        description: `Minnesota Wild player milestones for {season}. See which Wild players are approaching franchise records and which milestones have already been achieved this season.`
    },
    '/stats/numbers': {
        title: 'Minnesota Wild Jersey Numbers – Every Number & Who Wore It | Wild Hockey Hub',
        description: 'Every jersey number worn in Minnesota Wild history, who wore it, and for how many games — regular season and playoffs since 2000-01.'
    },
    '/stats/season': {
        title: `Minnesota Wild {season} Season Stats – Splits, Records & More | Wild Hockey Hub`,
        description: `Minnesota Wild {season} season stats: home and away splits, power play and penalty kill, period-by-period scoring, situational records, and back-to-back performance.`
    },
    '/stats/team-records': {
        title: 'Minnesota Wild All-Time Team Records & Statistical Leaders | Wild Hockey Hub',
        description: 'Minnesota Wild all-time franchise records and single-season statistical leaders. Find career and season bests for goals, assists, points, wins, save percentage, GAA, and more.'
    },
    '/stats/head-to-head': {
        title: `Minnesota Wild Head-to-Head Record vs Every NHL Team {season} | Wild Hockey Hub`,
        description: `Minnesota Wild head-to-head record against all 31 NHL opponents in {season}. Win-loss records, goals for, goals against, and results broken down by opponent.`
    },
};

// Fill in the {season} placeholder. Must run per request: Workers freeze the clock
// at the Unix epoch during module initialization, so the date isn't valid at load time.
function withSeason(meta) {
    const label = getSeasonLabel();
    return {
        title: meta.title.replace('{season}', label),
        description: meta.description.replace('{season}', label),
    };
}

// Resolve meta for a given path, including dynamic head-to-head team routes
function resolveMeta(path) {
    if (PAGE_META[path]) return PAGE_META[path];

    const h2hMatch = path.match(/^\/stats\/head-to-head\/(.+)$/);
    if (h2hMatch) {
        const team = NHL_TEAMS.find(t => t.slug === h2hMatch[1]);
        if (team) {
            return {
                title: `Minnesota Wild vs ${team.name} Head-to-Head {season} – Record, Goals & Results | Wild Hockey Hub`,
                description: `Minnesota Wild vs ${team.name} head-to-head results for {season}. Win-loss record, goals scored, goals against, home and away splits, and game-by-game results.`
            };
        }
    }

    // Playoff bracket — named for the year the current season ends (matches js/router.js)
    if (path === '/standings/playoffs') {
        const year = getPlayoffYear();
        return {
            title: `NHL Playoff Bracket ${year} – Stanley Cup Playoffs Matchups & Series Scores | Wild Hockey Hub`,
            description: `Live ${year} NHL playoff bracket with Stanley Cup Playoffs matchups, series scores, and bracket progression. Track the Minnesota Wild through every round from first round to the Stanley Cup Final.`
        };
    }

    // Team records views: /stats/team-records/[playoffs|combined/]{time}/{stat}/{pos}
    const records = parseTeamRecordsPath(path);
    if (records) {
        const { timeMode, statMode, posMode, gameType } = records;
        return {
            title: teamRecordsTitle(timeMode, statMode, posMode, gameType),
            description: teamRecordsDescription(timeMode, statMode, posMode, gameType),
        };
    }

    // Past seasons' schedules: /schedule/past (last season) or /schedule/past/YYYY-YY
    const pastMatch = path.match(/^\/schedule\/past(?:\/(\d{4}-\d{2}))?$/);
    if (pastMatch) {
        const label = pastMatch[1] && getPastSeasons().includes(seasonFromLabel(pastMatch[1])) ? pastMatch[1] : getSeasonLabel(getPreviousSeason());
        return {
            title: `Minnesota Wild ${label} Schedule & Results | Wild Hockey Hub`,
            description: `Minnesota Wild ${label} schedule and results: every regular season and playoff game with scores and game recaps.`
        };
    }

    return PAGE_META['/'];
}

// ─── Jersey numbers: crawlable content + breadcrumbs ──────────────────────────
// The numbers page is drawn in the browser; pre-render a plain list (number → who wore it,
// seasons, games) into the page so search engines get the content in the initial HTML.
// The page script replaces it with the full layout once it loads.

function formatSeasonLabel(s) {
    return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
}

// Jersey Stats as plain lists (the page script draws them as cards)
function renderJerseyStatsContent(list) {
    const stats = buildJerseyStats(list);
    const ranked = (title, rows, describe, note = '') => `<h3>${title}</h3>${note ? `<p>${note}</p>` : ''}<ul>`
        + rows.map(r => `<li>${r.rank}. #${r.number}${r.name ? ` ${escapeHtml(r.name)}` : ''}: ${describe(r)}</li>`).join('')
        + `</ul>`;
    return `<h2>Jersey Stats</h2>`
        + `<h3>Jersey numbers never worn</h3><p>${stats.neverWorn.join(', ')}</p>`
        + ranked('Most worn – players', stats.mostPlayers, r => `${r.value} players`)
        + ranked('Most worn – games', stats.mostGames, r => `${r.value} games`)
        + ranked('Most games by one player', stats.mostBySinglePlayer, r => `${r.value} games`)
        + ranked('Revolving door', stats.revolvingDoor, r => `${r.players} players, ${r.value.toFixed(1)} games each`, REVOLVING_DOOR_NOTE)
        + `<h3>One and done</h3><p>${stats.oneAndDone.length} players wore a number for a single game.</p><ul>`
        + stats.oneAndDone.map(r => `<li>#${r.number} ${escapeHtml(r.name)}, ${formatSeasonLabel(r.season)}</li>`).join('')
        + `</ul>`;
}

async function renderNumbersContent(env) {
    try {
        const object = await env.H2H_DATA.get('numbers/sweater-numbers.json');
        if (!object) return null;
        const { players = {}, numbers = {} } = JSON.parse(await object.text());

        const list = Object.entries(numbers)
            .map(([number, byPlayer]) => ({
                number: Number(number),
                wearers: Object.entries(byPlayer)
                    .map(([playerId, s]) => ({ name: players[playerId]?.name || 'Unknown player', ...s, games: s.regular + s.playoffs }))
                    .sort((a, b) => b.games - a.games),
            }))
            .sort((a, b) => a.number - b.number);

        const sections = list.map(({ number, wearers }) => {
                const items = wearers.map(w => {
                    const span = w.firstSeason === w.lastSeason
                        ? formatSeasonLabel(w.firstSeason)
                        : `${formatSeasonLabel(w.firstSeason)} – ${formatSeasonLabel(w.lastSeason)}`;
                    const playoffs = w.playoffs > 0 ? ` (${w.regular} regular season, ${w.playoffs} playoffs)` : '';
                    return `<li>${escapeHtml(w.name)}, ${span}: ${w.games} games${playoffs}</li>`;
                }).join('');
                return `<section id="number-${number}"><h3>Minnesota Wild #${number}</h3><ul>${items}</ul></section>`;
            });

        const wearerCount = new Set(Object.values(numbers).flatMap(byPlayer => Object.keys(byPlayer))).size;
        return `<div class="numbers-prerender"><h2>Jersey Numbers</h2>`
            + `<p>${sections.length} numbers worn by ${wearerCount} players since 2000-01. Games played include the regular season and playoffs.</p>`
            + sections.join('')
            + renderJerseyStatsContent(list)
            + `</div>`;
    } catch {
        return null; // The page still loads the data in the browser
    }
}

// ─── Other data-driven pages: crawlable content ───────────────────────────────
// Head-to-head, Team Records and the Points Progression chart are drawn in the browser, so
// without this every one of them reaches search engines as the same "Loading…" app shell.

async function readR2Json(env, key) {
    const object = await env.H2H_DATA.get(key);
    return object ? JSON.parse(await object.text()) : null;
}

// { selector, html } to fill into the page for search engines, or null (the page still loads in the browser)
async function prerenderFor(path, env, meta) {
    try {
        if (path === '/stats/numbers') {
            const html = await renderNumbersContent(env);
            return html && { selector: '#stats-numbers-view', html };
        }
        if (path === '/stats/head-to-head') {
            return { selector: '#h2h-content', html: renderH2HHubContent(TEAMS) };
        }
        const h2hMatch = path.match(/^\/stats\/head-to-head\/([^/]+)$/);
        if (h2hMatch) {
            const team = TEAMS.find(t => t.slug === h2hMatch[1]);
            const data = team && await readR2Json(env, `h2h/MIN-${team.abbrev}.json`);
            return data && { selector: '#h2h-content', html: renderH2HTeamContent(team, data, TEAMS) };
        }
        const records = path === '/stats/team-records'
            ? { gameType: 'regular', timeMode: 'alltime', statMode: 'goals', posMode: 'all' }
            : parseTeamRecordsPath(path);
        if (records) {
            const data = await readR2Json(env, 'milestones/franchise-leaders.json');
            const heading = meta.title.replace(/ \| Wild Hockey Hub$/, '');
            const html = data && renderTeamRecordsContent(data, records, heading);
            return html && { selector: '#stats-team-records-view', html };
        }
        if (path === '/standings/points-progression') {
            const res = await fetch('https://api-web.nhle.com/v1/standings/now', {
                redirect: 'follow',
                signal: AbortSignal.timeout(2500),
                cf: { cacheTtl: 300, cacheEverything: true },
            });
            if (!res.ok) return null;
            const { standings = [] } = await res.json();
            return standings.length
                ? { selector: '#standings-container', html: renderPointsProgressionContent(standings, getSeasonLabel()) }
                : null;
        }
    } catch {
        // Fall through: the page still loads its data in the browser
    }
    return null;
}

// Home page: answer "are the Minnesota Wild playing tonight?" in the meta description and add
// SportsEvent structured data for the next game. Null (static description kept) if the schedule
// can't be fetched or there's no game left this season.
async function nextGameSearchData() {
    try {
        const res = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/MIN/${getCurrentSeason()}`, {
            redirect: 'follow',
            signal: AbortSignal.timeout(2500),
            cf: { cacheTtl: 300, cacheEverything: true },
        });
        if (!res.ok) return null;
        const game = findNextGame((await res.json()).games);
        if (!game) return null;
        const description = nextGameDescription(game);
        return { description, jsonLd: nextGameJsonLd(game, description) };
    } catch {
        return null;
    }
}

// ─── Shared video links: /media/video/{slug} ──────────────────────────────────
// Link previews (Reddit, Discord, Slack, iMessage, X…) read these tags without running the page
// script: the video's title, description and 16:9 thumbnail, plus the Brightcove player page as
// og:video / twitter:player for sites that embed playable video from page tags.

// "00:08:30" → "PT8M30S"
function isoDuration(duration) {
    const [h, m, s] = (duration || '').split(':').map(Number);
    if ([h, m, s].some(n => !Number.isFinite(n))) return null;
    return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s || (!h && !m) ? `${s}S` : ''}`;
}

async function videoSearchData(video) {
    let item = null;
    try {
        const res = await fetch(`https://forge-dapi.d3.nhle.com/v2/content/en-us/videos/${encodeURIComponent(video.slug)}`, {
            redirect: 'follow',
            signal: AbortSignal.timeout(2500),
            cf: { cacheTtl: 3600, cacheEverything: true },
        });
        if (res.ok) item = await res.json();
        if (item?.fields?.brightcoveId !== video.brightcoveId) item = null;
    } catch {
        item = null; // Still embed the player (the ID is in the URL), with the default title and image
    }

    const accountId = item?.fields?.brightcoveAccountId || DEFAULT_BRIGHTCOVE_ACCOUNT;
    const playerUrl = brightcovePlayerUrl(accountId, video.brightcoveId);
    const image = item?.thumbnail?.templateUrl?.replace('{formatInstructions}', 't_ratio16_9-size50') || null; // 1280×720 JPEG
    const title = item?.title ? `${item.title} | Wild Hockey Hub` : 'Minnesota Wild Video | Wild Hockey Hub';
    const description = item?.fields?.longDescription || item?.fields?.description || item?.title || 'Watch this Minnesota Wild video on Wild Hockey Hub.';

    const jsonLd = item && image ? JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: item.title,
        description,
        thumbnailUrl: image,
        uploadDate: item.contentDate,
        ...(isoDuration(item.fields?.duration) && { duration: isoDuration(item.fields.duration) }),
        embedUrl: playerUrl,
    }).replace(/</g, '\\u003c') : null;

    return { title, description, image, playerUrl, jsonLd, found: Boolean(item) };
}

// Video tags added to <head> (the shell's own og:image / twitter:card are rewritten in place)
function videoHeadTags(data) {
    const attr = v => escapeHtml(String(v));
    return [
        `<meta property="og:video" content="${attr(data.playerUrl)}">`,
        `<meta property="og:video:secure_url" content="${attr(data.playerUrl)}">`,
        `<meta property="og:video:type" content="text/html">`,
        `<meta property="og:video:width" content="1280">`,
        `<meta property="og:video:height" content="720">`,
        ...(data.image ? [
            `<meta property="og:image:width" content="1280">`,
            `<meta property="og:image:height" content="720">`,
        ] : []),
        `<meta name="twitter:player" content="${attr(data.playerUrl)}">`,
        `<meta name="twitter:player:width" content="1280">`,
        `<meta name="twitter:player:height" content="720">`,
        ...(data.jsonLd ? [`<script type="application/ld+json">${data.jsonLd}</script>`] : []),
    ].join('');
}

// BreadcrumbList structured data for pages deeper than one level (null for other pages)
function breadcrumbsFor(path, meta) {
    const trail = [['Home', '/']];
    // Page name for the last crumb: the title without the site prefix/suffix
    const pageName = meta.title.replace(/^Minnesota Wild /, '').replace(/ \| Wild Hockey Hub$/, '');

    if (path === '/stats/numbers') {
        trail.push(['Stats', '/stats'], ['Jersey Numbers', path]);
    } else if (path === '/standings/points-progression') {
        trail.push(['Standings', '/standings'], ['Points Progression Chart', path]);
    } else if (path === '/stats/team-records' || parseTeamRecordsPath(path)) {
        trail.push(['Stats', '/stats'], ['Team Records', '/stats/team-records']);
        if (path !== '/stats/team-records') trail.push([pageName, path]);
    } else if (path.startsWith('/schedule/past')) {
        trail.push(['Schedule', '/schedule'], ['Past Seasons', '/schedule/past']);
        if (path !== '/schedule/past') trail.push([pageName.replace(/ & Results$/, ''), path]);
    } else {
        return null;
    }

    return JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map(([name, url], i) => ({
            '@type': 'ListItem', position: i + 1, name, item: `https://wildhockey.win${url}`,
        })),
    });
}

// Unknown page: the app shell with a real 404 status, kept out of search results.
// The browser router shows the not-found view.
function notFound(shell) {
    const response = new HTMLRewriter()
        .on('title', {
            element(el) {
                el.setInnerContent('Page Not Found | Wild Hockey Hub');
            }
        })
        .on('meta[name="robots"]', {
            element(el) {
                el.setAttribute('content', 'noindex');
            }
        })
        .on('link[rel="canonical"]', {
            element(el) {
                el.remove();
            }
        })
        .transform(shell);
    return new Response(response.body, { status: 404, headers: response.headers });
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // Static files and API routes pass straight through
    if (!isPagePath(path) || path.startsWith('/api/')) {
        const asset = await env.ASSETS.fetch(request);
        // A missing file gets the SPA fallback (index.html) from _redirects; answer 404 instead
        const isFallback = (asset.headers.get('content-type') || '').startsWith('text/html') && !path.endsWith('.html');
        return isFallback && !path.startsWith('/api/') ? new Response('Not found', { status: 404 }) : asset;
    }

    // Fetch index.html from static assets
    const assetRequest = new Request(new URL('/', url).href, request);

    const redirect = redirectTarget(path);
    if (redirect) {
        return Response.redirect(new URL(redirect + url.search, url).href, 301);
    }
    if (!isKnownRoute(path)) {
        return notFound(await env.ASSETS.fetch(assetRequest));
    }

    const response = await env.ASSETS.fetch(assetRequest);

    const video = parseVideoPath(path);
    if (video) return renderVideoPage(response, path, await videoSearchData(video));

    const meta = withSeason(resolveMeta(path));
    // /schedule/past shows last season, so point it at that season's own URL (avoids duplicate pages)
    const canonicalPath = path === '/schedule/past' ? `/schedule/past/${getSeasonLabel(getPreviousSeason())}` : path;
    const canonicalUrl = `https://wildhockey.win${canonicalPath}`;
    const [prerender, nextGame] = await Promise.all([
        prerenderFor(path, env, meta),
        path === '/' ? nextGameSearchData() : null,
    ]);
    if (nextGame) meta.description = nextGame.description;

    let rewriter = new HTMLRewriter();
    if (nextGame) {
        rewriter = rewriter.on('head', {
            element(el) {
                el.append(`<script type="application/ld+json" id="next-game-ld">${nextGame.jsonLd}</script>`, { html: true });
            }
        });
    }
    const breadcrumbs = breadcrumbsFor(path, meta);
    if (breadcrumbs) {
        rewriter = rewriter.on('head', {
            element(el) {
                el.append(`<script type="application/ld+json">${breadcrumbs}</script>`, { html: true });
            }
        });
    }
    if (prerender) {
        rewriter = rewriter.on(prerender.selector, {
            element(el) {
                el.setInnerContent(prerender.html, { html: true });
            }
        });
    }

    return rewriter
        .on('title', {
            element(el) {
                el.setInnerContent(meta.title);
            }
        })
        .on('meta[name="description"]', {
            element(el) {
                el.setAttribute('content', meta.description);
            }
        })
        .on('meta[property="og:title"]', {
            element(el) {
                el.setAttribute('content', meta.title);
            }
        })
        .on('meta[property="og:description"]', {
            element(el) {
                el.setAttribute('content', meta.description);
            }
        })
        .on('meta[property="og:url"]', {
            element(el) {
                el.setAttribute('content', canonicalUrl);
            }
        })
        .on('meta[name="twitter:title"]', {
            element(el) {
                el.setAttribute('content', meta.title);
            }
        })
        .on('meta[name="twitter:description"]', {
            element(el) {
                el.setAttribute('content', meta.description);
            }
        })
        .on('link[rel="canonical"]', {
            element(el) {
                el.setAttribute('href', canonicalUrl);
            }
        })
        .transform(response);
}

// The app shell for a shared video link, with the video's preview and player tags
function renderVideoPage(response, path, data) {
    const url = `https://wildhockey.win${path}`;
    const setContent = value => ({ element(el) { el.setAttribute('content', value); } });
    let rewriter = new HTMLRewriter()
        .on('head', { element(el) { el.append(videoHeadTags(data), { html: true }); } })
        .on('title', { element(el) { el.setInnerContent(data.title); } })
        .on('meta[name="description"]', setContent(data.description))
        .on('meta[property="og:type"]', setContent('video.other'))
        .on('meta[property="og:title"]', setContent(data.title))
        .on('meta[property="og:description"]', setContent(data.description))
        .on('meta[property="og:url"]', setContent(url))
        .on('meta[name="twitter:card"]', setContent('player'))
        .on('meta[name="twitter:title"]', setContent(data.title))
        .on('meta[name="twitter:description"]', setContent(data.description))
        .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', url); } });
    // A link the NHL doesn't know (or couldn't confirm) still plays, but stays out of search results
    if (!data.found) rewriter = rewriter.on('meta[name="robots"]', setContent('noindex'));
    if (data.image) {
        rewriter = rewriter
            .on('meta[property="og:image"]', setContent(data.image))
            .on('meta[name="twitter:image"]', setContent(data.image));
    }
    return rewriter.transform(response);
}
