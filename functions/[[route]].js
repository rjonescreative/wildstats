// Catch-all Cloudflare Pages Function for SSR <head> injection
// Intercepts SPA route requests and injects page-specific title/meta tags
// so search engines see correct metadata without needing to execute JS.

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
        title: 'Minnesota Wild Stats, Standings & Schedule 2025-26 | Wild Hockey Hub',
        description: 'Minnesota Wild stats, standings, schedules, and news for 2025-26. Your hub for Wild hockey with live game updates, player statistics, and NHL standings.'
    },
    '/stats': {
        title: 'Minnesota Wild Player Stats 2025-26 – Goals, Assists & Points | Wild Hockey Hub',
        description: 'Minnesota Wild player statistics for 2025-26. View skater and goalie stats including goals, assists, points, save percentage, and more.'
    },
    '/schedule': {
        title: 'Minnesota Wild 2025-26 Schedule – Upcoming Games & Results | Wild Hockey Hub',
        description: 'Minnesota Wild game schedule for 2025-26. See upcoming games, past results, scores, and the full season schedule.'
    },
    '/standings': {
        title: 'NHL Wildcard Standings 2025-26 | Minnesota Wild Playoff Race | Wild Hockey Hub',
        description: 'Minnesota Wild wildcard standings for 2025-26. View current NHL wildcard standings, points, wins, losses, and playoff positioning.'
    },
    '/standings/wildcard': {
        title: 'NHL Wildcard Standings 2025-26 | Minnesota Wild Playoff Race | Wild Hockey Hub',
        description: 'Minnesota Wild wildcard standings for 2025-26. View current NHL wildcard standings, points, wins, losses, and playoff positioning.'
    },
    '/standings/division': {
        title: 'NHL Division Standings 2025-26 | Minnesota Wild | Wild Hockey Hub',
        description: 'NHL division standings for 2025-26. View all four division standings including where the Minnesota Wild rank in the Central Division.'
    },
    '/standings/conference': {
        title: 'NHL Conference Standings 2025-26 | Minnesota Wild | Wild Hockey Hub',
        description: 'NHL conference standings for 2025-26. View Eastern and Western Conference standings including Minnesota Wild playoff positioning.'
    },
    '/standings/league': {
        title: 'NHL League Standings 2025-26 | Minnesota Wild | Wild Hockey Hub',
        description: 'Full NHL league standings for 2025-26. See where Minnesota Wild ranks across all 32 NHL teams by points and percentage.'
    },
    '/media': {
        title: 'Minnesota Wild Videos & Highlights 2025-26 | Wild Hockey Hub',
        description: 'Minnesota Wild videos for 2025-26. Watch highlights, game recaps, interviews, and more from the Wild.'
    },
    '/media/highlights': {
        title: 'Minnesota Wild Game Highlights 2025-26 | Wild Hockey Hub',
        description: 'Minnesota Wild game highlights for 2025-26. Watch the best plays, goals, and saves from Wild games this season.'
    },
    '/media/recaps': {
        title: 'Minnesota Wild Game Recaps 2025-26 | Wild Hockey Hub',
        description: 'Minnesota Wild game recaps for 2025-26. Watch condensed game recaps and full game summaries.'
    },
    '/media/condensed': {
        title: 'Minnesota Wild Condensed Games 2025-26 | Wild Hockey Hub',
        description: 'Minnesota Wild condensed games for 2025-26. Watch full condensed game replays for every Wild game this season.'
    },
    '/stats/milestones': {
        title: 'Minnesota Wild Player Milestones 2025-26 | Wild Hockey Hub',
        description: 'Minnesota Wild player milestones for 2025-26. See which Wild players are approaching franchise records and which milestones have already been achieved this season.'
    },
    '/stats/season': {
        title: 'Minnesota Wild Current Season Stats 2025-26 | Wild Hockey Hub',
        description: 'Minnesota Wild current season stats for 2025-26. Track team points progression, standings trends, and season-long statistics.'
    },
    '/stats/team-records': {
        title: 'Minnesota Wild All-Time Team Records & Statistical Leaders | Wild Hockey Hub',
        description: 'Minnesota Wild all-time franchise records and single-season statistical leaders. Find career and season bests for goals, assists, points, wins, save percentage, GAA, and more.'
    },
    '/stats/head-to-head': {
        title: 'Minnesota Wild Head-to-Head Record vs Every NHL Team 2025-26 | Wild Hockey Hub',
        description: 'Minnesota Wild head-to-head record against all 31 NHL opponents in 2025-26. Win-loss records, goals for, goals against, and results broken down by opponent.'
    },
};

// Pre-build a Set of all known static routes for fast lookup
const STATIC_ROUTES = new Set(Object.keys(PAGE_META));

// Check if a path is a known SPA route (static or dynamic head-to-head)
function isSpaRoute(path) {
    if (STATIC_ROUTES.has(path)) return true;
    if (/^\/stats\/head-to-head\/[^/]+$/.test(path)) return true;
    return false;
}

// Resolve meta for a given path, including dynamic head-to-head team routes
function resolveMeta(path) {
    if (PAGE_META[path]) return PAGE_META[path];

    const h2hMatch = path.match(/^\/stats\/head-to-head\/(.+)$/);
    if (h2hMatch) {
        const team = NHL_TEAMS.find(t => t.slug === h2hMatch[1]);
        if (team) {
            return {
                title: `Minnesota Wild vs ${team.name} Head-to-Head 2025-26 – Record, Goals & Results | Wild Hockey Hub`,
                description: `Minnesota Wild vs ${team.name} head-to-head results for 2025-26. Win-loss record, goals scored, goals against, home and away splits, and game-by-game results.`
            };
        }
    }

    return PAGE_META['/'];
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // Only intercept known SPA routes — pass everything else (static assets, API routes) straight through
    if (!isSpaRoute(path)) {
        return env.ASSETS.fetch(request);
    }

    // Fetch index.html from static assets
    const assetRequest = new Request(new URL('/', url).href, request);
    const response = await env.ASSETS.fetch(assetRequest);

    const meta = resolveMeta(path);
    const canonicalUrl = `https://wildhockey.win${path}`;

    return new HTMLRewriter()
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
