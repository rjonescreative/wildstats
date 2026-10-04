// Client-side router using History API
import { setCurrentView, getCurrentView } from './state.js';
import { trackPageView, trackNavigation, trackStandingsView } from './analytics.js';
import { teamBySlug } from './teams.js';
import { getSeasonLabel, getPlayoffYear } from './seasonConfig.js';

const SEASON_LABEL = getSeasonLabel();
const PLAYOFF_YEAR = getPlayoffYear();

// ─── Team Records URL slug mappings ───────────────────────────────────────────

const RECORDS_TIME_TO_SLUG = { alltime: 'all-time', season: 'season' };
const RECORDS_STAT_TO_SLUG = {
    goals: 'goals', assists: 'assists', points: 'points',
    shootout: 'shootout', penaltyMinutes: 'penalty-minutes', gamesPlayed: 'games-played', wins: 'wins',
    evGoals: 'even-strength-goals', evAssists: 'even-strength-assists', evPoints: 'even-strength-points',
    ppGoals: 'power-play-goals', ppAssists: 'power-play-assists', ppPoints: 'power-play-points',
    shGoals: 'short-handed-goals', shAssists: 'short-handed-assists', shPoints: 'short-handed-points',
    enGoals: 'empty-net-goals', enAssists: 'empty-net-assists', enPoints: 'empty-net-points',
};
const RECORDS_POS_TO_SLUG  = { all: 'all-skaters', forwards: 'forwards', defense: 'defense', goalies: 'goalies' };

const RECORDS_SLUG_TO_TIME = Object.fromEntries(Object.entries(RECORDS_TIME_TO_SLUG).map(([k, v]) => [v, k]));
const RECORDS_SLUG_TO_STAT = {
    ...Object.fromEntries(Object.entries(RECORDS_STAT_TO_SLUG).map(([k, v]) => [v, k])),
    // Earlier power-play slugs, kept so shared links still work
    'pp-goals': 'ppGoals', 'pp-assists': 'ppAssists', 'pp-points': 'ppPoints',
};
const RECORDS_SLUG_TO_POS  = Object.fromEntries(Object.entries(RECORDS_POS_TO_SLUG).map(([k, v]) => [v, k]));

// Parse /stats/team-records/[playoffs|combined/]{time}/{stat}/{pos} → { gameType, timeMode, statMode, posMode } or null
// Regular season has no type segment, so existing links keep working.
export function parseTeamRecordsPath(path) {
    const m = path.match(/^\/stats\/team-records\/(?:(playoffs|combined)\/)?([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!m) return null;
    const gameType = m[1] ?? 'regular';
    const timeMode = RECORDS_SLUG_TO_TIME[m[2]];
    const statMode = RECORDS_SLUG_TO_STAT[m[3]];
    const posMode  = RECORDS_SLUG_TO_POS[m[4]];
    if (!timeMode || !statMode || !posMode) return null;
    return { gameType, timeMode, statMode, posMode };
}

// Build /stats/team-records/{time}/{stat}/{pos} from state values
export function buildTeamRecordsPath(timeMode, statMode, posMode, gameType = 'regular') {
    const type = gameType === 'regular' ? '' : `${gameType}/`;
    return `/stats/team-records/${type}${RECORDS_TIME_TO_SLUG[timeMode]}/${RECORDS_STAT_TO_SLUG[statMode]}/${RECORDS_POS_TO_SLUG[posMode]}`;
}

// Push a new records URL, update title + meta tags, track page view
export function updateTeamRecordsURL(timeMode, statMode, posMode, gameType = 'regular') {
    const path  = buildTeamRecordsPath(timeMode, statMode, posMode, gameType);
    const title = _teamRecordsTitle(timeMode, statMode, posMode, gameType);
    history.pushState({ path, viewName: 'stats', subView: 'team-records' }, '', path);
    document.title = title;
    updateMetaTags(path, 'stats', 'team-records');
    trackPageView(path, title);
}

// Route configuration
const routes = {
    '/': 'dashboard',
    '/stats': 'stats',
    '/stats/head-to-head': 'stats',
    '/stats/team-records': 'stats',
    '/stats/milestones': 'stats',
    '/stats/numbers': 'stats',
    '/stats/season': 'stats',
    '/standings': 'standings',
    '/standings/wildcard': 'standings',
    '/standings/division': 'standings',
    '/standings/conference': 'standings',
    '/standings/league': 'standings',
    '/standings/playoffs': 'standings',
    '/schedule': 'schedule',
    '/media': 'media',
    '/media/highlights': 'media',
    '/media/recaps': 'media',
    '/media/condensed': 'media'
};

// View modules (will be set by main.js)
let viewModules = {};

// Set view modules
export function setViewModules(modules) {
    viewModules = modules;
}

// Get view name from path
function getViewFromPath(path) {
    if (routes[path]) return routes[path];
    if (path.startsWith('/stats/')) return 'stats';
    return 'dashboard';
}

// Get standings sub-view from path
function getStandingsView(path) {
    if (path === '/standings') return 'wildcard';
    const match = path.match(/^\/standings\/(.+)$/);
    return match ? match[1] : 'wildcard';
}

// Get stats sub-view from path
function getStatsView(path) {
    if (path === '/stats') return 'player';
    if (path.startsWith('/stats/head-to-head')) return 'head-to-head';
    if (path.startsWith('/stats/team-records')) return 'team-records';
    if (path.startsWith('/stats/milestones')) return 'milestones';
    if (path.startsWith('/stats/numbers')) return 'numbers';
    if (path.startsWith('/stats/season')) return 'season';
    return 'player';
}

// Get media sub-view from path
function getMediaView(path) {
    if (path === '/media') return 'all';
    const match = path.match(/^\/media\/(.+)$/);
    return match ? match[1] : 'all';
}

// Show a specific view
async function showView(viewName, subView = null) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    // Show target view
    const viewElement = document.getElementById(`${viewName}-view`);
    if (viewElement) {
        viewElement.classList.add('active');
    }

    // Update navigation active states
    updateNavStates(viewName);

    // Update current view in state
    setCurrentView(viewName);

    // Initialize/render the view
    const viewModule = viewModules[viewName];
    if (viewModule) {
        if ((viewName === 'standings' || viewName === 'media' || viewName === 'stats') && subView) {
            await viewModule.init(subView);
        } else {
            await viewModule.init();
        }
    }
}

// Update navigation link active states
function updateNavStates(viewName) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (
            (href === '/' && viewName === 'dashboard') ||
            (href === '/stats' && viewName === 'stats') ||
            (href === '/standings' && viewName === 'standings') ||
            (href === '/schedule' && viewName === 'schedule') ||
            (href === '/media' && viewName === 'media')
        ) {
            link.classList.add('active');
        }
    });
}

// Navigate to a path
export async function navigateTo(path) {
    const previousView = getCurrentView();
    const viewName = getViewFromPath(path);
    const standingsView = viewName === 'standings' ? getStandingsView(path) : null;
    const statsView = viewName === 'stats' ? getStatsView(path) : null;
    const mediaView = viewName === 'media' ? getMediaView(path) : null;
    const subView = standingsView || statsView || mediaView;

    // Update URL
    history.pushState({ path, viewName, subView }, '', path);

    // Scroll to top of page
    window.scrollTo(0, 0);

    // Track navigation
    if (previousView && previousView !== viewName) {
        trackNavigation(previousView, viewName);
    }

    // Track standings sub-view changes
    if (viewName === 'standings' && standingsView) {
        trackStandingsView(standingsView);
    }

    // Update page title, meta tags, and track page view
    const pageTitle = getPageTitle(viewName, subView);
    document.title = pageTitle;
    updateMetaTags(path, viewName, subView);
    trackPageView(path, pageTitle);

    // Show the view
    await showView(viewName, subView);
}

// ─── Team Records per-page SEO helpers ───────────────────────────────────────

const _RECORDS_STAT_LABEL = {
    goals: 'Goals', assists: 'Assists', points: 'Points',
    evGoals: 'Even-Strength Goals', evAssists: 'Even-Strength Assists', evPoints: 'Even-Strength Points',
    ppGoals: 'Power Play Goals', ppAssists: 'Power Play Assists', ppPoints: 'Power Play Points',
    shGoals: 'Short-Handed Goals', shAssists: 'Short-Handed Assists', shPoints: 'Short-Handed Points',
    enGoals: 'Empty-Net Goals', enAssists: 'Empty-Net Assists', enPoints: 'Empty-Net Points',
    shootout: 'Shootout Goals', penaltyMinutes: 'Penalty Minutes',
    gamesPlayed: 'Games Played', wins: 'Wins',
};
const _RECORDS_POS_PREFIX = {
    all: '', forwards: 'Forward ', defense: 'Defense ', goalies: 'Goalie ',
};
const _RECORDS_POS_NOUN = {
    all: 'skaters', forwards: 'forwards', defense: 'defensemen', goalies: 'goalies',
};

function _teamRecordsTitle(timeMode, statMode, posMode, gameType = 'regular') {
    const time  = timeMode === 'alltime' ? 'Career' : 'Single-Season';
    const type  = { playoffs: 'Playoff ', combined: 'Regular Season & Playoff ' }[gameType] ?? '';
    const pos   = _RECORDS_POS_PREFIX[posMode] ?? '';
    const stat  = _RECORDS_STAT_LABEL[statMode] ?? statMode;
    const sfx   = timeMode === 'alltime' ? 'Leaders' : 'Records';
    return `Minnesota Wild ${time} ${type}${pos}${stat} ${sfx} | Wild Hockey Hub`;
}

function _teamRecordsDescription(timeMode, statMode, posMode, gameType = 'regular') {
    const stat    = (_RECORDS_STAT_LABEL[statMode] ?? statMode).toLowerCase();
    const pos     = _RECORDS_POS_NOUN[posMode] ?? 'players';
    if (gameType === 'combined') {
        return timeMode === 'alltime'
            ? `Minnesota Wild all-time ${stat} leaders for ${pos}, regular season and playoffs combined. Complete franchise history ranked from 2000-01.`
            : `Top single-season ${stat} totals by Minnesota Wild ${pos}, counting regular season and playoffs together. The best full seasons in franchise history, ranked.`;
    }
    if (gameType === 'playoffs') {
        return timeMode === 'alltime'
            ? `Minnesota Wild all-time playoff ${stat} leaders for ${pos}. Every Stanley Cup Playoffs run in franchise history, ranked.`
            : `Top single-postseason playoff ${stat} performances by Minnesota Wild ${pos}. The best individual playoff runs in franchise history, ranked.`;
    }
    if (timeMode === 'alltime') {
        return `Minnesota Wild all-time career ${stat} leaders for ${pos}. Complete franchise history ranked from 2000-01 through the current season.`;
    }
    return `Top single-season ${stat} performances by Minnesota Wild ${pos}. The best individual seasons in franchise history, ranked.`;
}

// Get page title for browser and analytics
function getPageTitle(viewName, subView = null) {
    if (viewName === 'standings') {
        const standingsTitles = {
            wildcard: `NHL Wildcard Standings ${SEASON_LABEL} | Minnesota Wild Playoff Race | Wild Hockey Hub`,
            division: `NHL Division Standings ${SEASON_LABEL} | Minnesota Wild | Wild Hockey Hub`,
            conference: `NHL Conference Standings ${SEASON_LABEL} | Minnesota Wild | Wild Hockey Hub`,
            league: `NHL League Standings ${SEASON_LABEL} | Minnesota Wild | Wild Hockey Hub`,
            playoffs: `NHL Playoff Bracket ${PLAYOFF_YEAR} – Stanley Cup Playoffs Matchups & Series Scores | Wild Hockey Hub`
        };
        return standingsTitles[subView] || standingsTitles.wildcard;
    }

    if (viewName === 'media') {
        const mediaTitles = {
            all: `Minnesota Wild Videos & Highlights ${SEASON_LABEL} | Wild Hockey Hub`,
            highlights: `Minnesota Wild Game Highlights ${SEASON_LABEL} | Wild Hockey Hub`,
            recaps: `Minnesota Wild Game Recaps ${SEASON_LABEL} | Wild Hockey Hub`,
            condensed: `Minnesota Wild Condensed Games ${SEASON_LABEL} | Wild Hockey Hub`
        };
        return mediaTitles[subView] || mediaTitles.all;
    }

    if (viewName === 'stats') {
        if (subView === 'head-to-head') {
            const slug = typeof window !== 'undefined'
                ? (window.location.pathname.match(/^\/stats\/head-to-head\/(.+)$/) || [])[1]
                : null;
            const team = slug ? teamBySlug(slug) : null;
            return team
                ? `Minnesota Wild vs ${team.name} Head-to-Head ${SEASON_LABEL} – Record, Goals & Results | Wild Hockey Hub`
                : `Minnesota Wild Head-to-Head Record vs Every NHL Team ${SEASON_LABEL} | Wild Hockey Hub`;
        }
        if (subView === 'team-records') {
            const rp = parseTeamRecordsPath(window.location.pathname);
            return rp
                ? _teamRecordsTitle(rp.timeMode, rp.statMode, rp.posMode, rp.gameType)
                : 'Minnesota Wild All-Time Team Records & Statistical Leaders | Wild Hockey Hub';
        }
        if (subView === 'milestones') {
            return `Minnesota Wild Player Milestones ${SEASON_LABEL} – Upcoming & Achieved | Wild Hockey Hub`;
        }
        if (subView === 'numbers') {
            return 'Minnesota Wild Jersey Numbers – Every Number & Who Wore It | Wild Hockey Hub';
        }
        if (subView === 'season') {
            return `Minnesota Wild ${SEASON_LABEL} Season Stats – Points Progression, Splits & More | Wild Hockey Hub`;
        }
        return `Minnesota Wild Player Stats ${SEASON_LABEL} – Goals, Assists & Points | Wild Hockey Hub`;
    }

    const titles = {
        dashboard: `Minnesota Wild Stats, Standings & Schedule ${SEASON_LABEL} | Wild Hockey Hub`,
        schedule: `Minnesota Wild ${SEASON_LABEL} Schedule – Upcoming Games & Results | Wild Hockey Hub`
    };
    return titles[viewName] || `Minnesota Wild Stats, Standings & Schedule ${SEASON_LABEL} | Wild Hockey Hub`;
}

// Get meta description for SEO
function getMetaDescription(viewName, subView = null) {
    if (viewName === 'standings') {
        const standingsDescriptions = {
            wildcard: `Minnesota Wild wildcard standings for ${SEASON_LABEL}. View current NHL wildcard standings, points, wins, losses, and playoff positioning.`,
            division: `NHL division standings for ${SEASON_LABEL}. View all four division standings including where the Minnesota Wild rank in the Central Division.`,
            conference: `NHL conference standings for ${SEASON_LABEL}. View Eastern and Western Conference standings including Minnesota Wild playoff positioning.`,
            league: `Full NHL league standings for ${SEASON_LABEL}. See where Minnesota Wild ranks across all 32 NHL teams by points and percentage.`,
            playoffs: `Live ${PLAYOFF_YEAR} NHL playoff bracket with Stanley Cup Playoffs matchups, series scores, and bracket progression. Track the Minnesota Wild through every round from first round to the Stanley Cup Final.`
        };
        return standingsDescriptions[subView] || standingsDescriptions.wildcard;
    }

    if (viewName === 'media') {
        const mediaDescriptions = {
            all: `Minnesota Wild videos for ${SEASON_LABEL}. Watch highlights, game recaps, interviews, and more from the Wild.`,
            highlights: `Minnesota Wild game highlights for ${SEASON_LABEL}. Watch the best plays, goals, and saves from Wild games this season.`,
            recaps: `Minnesota Wild game recaps for ${SEASON_LABEL}. Watch condensed game recaps and full game summaries.`,
            condensed: `Minnesota Wild condensed games for ${SEASON_LABEL}. Watch full condensed game replays for every Wild game this season.`
        };
        return mediaDescriptions[subView] || mediaDescriptions.all;
    }

    if (viewName === 'stats' && subView === 'numbers') {
        return 'Every jersey number worn in Minnesota Wild history, who wore it, and for how many games — regular season and playoffs since 2000-01.';
    }
    if (viewName === 'stats' && subView === 'milestones') {
        return `Minnesota Wild player milestones for ${SEASON_LABEL}. Track which Wild players are approaching goals, assists, points, games played, and wins records — and which milestones have already been hit this season.`;
    }
    if (viewName === 'stats' && subView === 'season') {
        return `Minnesota Wild ${SEASON_LABEL} season stats. Track points progression against every NHL team, home and away splits, period-by-period scoring, situational records, and back-to-back performance.`;
    }
    if (viewName === 'stats' && subView === 'head-to-head') {
        const slug = typeof window !== 'undefined'
            ? (window.location.pathname.match(/^\/stats\/head-to-head\/(.+)$/) || [])[1]
            : null;
        const team = slug ? teamBySlug(slug) : null;
        return team
            ? `Minnesota Wild vs ${team.name} head-to-head results for ${SEASON_LABEL}. Win-loss record, goals scored, goals against, home and away splits, and game-by-game results.`
            : `Minnesota Wild head-to-head record against all 31 NHL opponents in ${SEASON_LABEL}. Win-loss records, goals for, goals against, and results broken down by opponent.`;
    }
    if (viewName === 'stats' && subView === 'team-records') {
        const rp = parseTeamRecordsPath(window.location.pathname);
        return rp
            ? _teamRecordsDescription(rp.timeMode, rp.statMode, rp.posMode, rp.gameType)
            : 'Minnesota Wild all-time franchise records and single-season statistical leaders. Career and season bests for goals, assists, points, wins, penalty minutes, games played, and more.';
    }

    const descriptions = {
        dashboard: `Minnesota Wild stats, standings, schedules, and news for ${SEASON_LABEL}. Your hub for Wild hockey with live game updates, player statistics, and NHL standings.`,
        stats: `Minnesota Wild player statistics for ${SEASON_LABEL}. View skater and goalie stats including goals, assists, points, save percentage, and more.`,
        schedule: `Minnesota Wild game schedule for ${SEASON_LABEL}. See upcoming games, past results, scores, and the full season schedule.`
    };
    return descriptions[viewName] || descriptions.dashboard;
}

// Update SEO meta tags
function updateMetaTags(path, viewName, standingsView = null) {
    const description = getMetaDescription(viewName, standingsView);
    const title = getPageTitle(viewName, standingsView);
    const url = `https://wildhockey.win${path}`;

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', description);

    // Update canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', url);

    // Update Open Graph tags
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', url);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);

    // Update Twitter tags
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute('content', title);

    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    if (twitterDesc) twitterDesc.setAttribute('content', description);
}

// Handle navigation link clicks
function handleNavClick(e) {
    // Only handle links with data-link attribute
    const link = e.target.closest('[data-link]');
    if (!link) {
        return;
    }

    e.preventDefault();
    const path = link.getAttribute('href');

    // If this is a standings view button, update the state
    if (link.classList.contains('view-btn')) {
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => btn.classList.remove('active'));
        link.classList.add('active');
    }

    navigateTo(path);
}

// Handle browser back/forward buttons
function handlePopState(e) {
    const path = window.location.pathname;
    const viewName = getViewFromPath(path);
    const standingsView = viewName === 'standings' ? getStandingsView(path) : null;
    const statsView = viewName === 'stats' ? getStatsView(path) : null;
    const mediaView = viewName === 'media' ? getMediaView(path) : null;
    const subView = standingsView || statsView || mediaView;

    // Scroll to top of page
    window.scrollTo(0, 0);

    // Update page title, meta tags, and track page view
    const pageTitle = getPageTitle(viewName, subView);
    document.title = pageTitle;
    updateMetaTags(path, viewName, subView);
    trackPageView(path, pageTitle);

    // Show the view without pushing to history (already in history)
    showView(viewName, subView);
}

// Initialize router
export function init() {
    // Set up event listeners
    document.addEventListener('click', handleNavClick);
    window.addEventListener('popstate', handlePopState);

    // Handle initial page load
    const path = window.location.pathname;
    const viewName = getViewFromPath(path);
    const standingsView = viewName === 'standings' ? getStandingsView(path) : null;
    const statsView = viewName === 'stats' ? getStatsView(path) : null;
    const mediaView = viewName === 'media' ? getMediaView(path) : null;
    const subView = standingsView || statsView || mediaView;

    // Replace current state to set initial state
    history.replaceState({ path, viewName, subView }, '', path);

    // Update page title, meta tags, and track initial page view
    const pageTitle = getPageTitle(viewName, subView);
    document.title = pageTitle;
    updateMetaTags(path, viewName, subView);
    trackPageView(path, pageTitle);

    // Show initial view
    showView(viewName, subView);
}
