// Client-side router using History API
import { setCurrentView, getCurrentView } from './state.js';
import { trackPageView, trackNavigation, trackStandingsView } from './analytics.js';
import { teamBySlug } from './teams.js';

// Route configuration
const routes = {
    '/': 'dashboard',
    '/stats': 'stats',
    '/stats/head-to-head': 'stats',
    '/stats/team-records': 'stats',
    '/stats/milestones': 'stats',
    '/standings': 'standings',
    '/standings/wildcard': 'standings',
    '/standings/division': 'standings',
    '/standings/conference': 'standings',
    '/standings/league': 'standings',
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

// Get page title for browser and analytics
function getPageTitle(viewName, subView = null) {
    if (viewName === 'standings') {
        const standingsTitles = {
            wildcard: 'NHL Wildcard Standings 2025-26 | Minnesota Wild Playoff Race | Wild Hockey Hub',
            division: 'NHL Division Standings 2025-26 | Minnesota Wild | Wild Hockey Hub',
            conference: 'NHL Conference Standings 2025-26 | Minnesota Wild | Wild Hockey Hub',
            league: 'NHL League Standings 2025-26 | Minnesota Wild | Wild Hockey Hub'
        };
        return standingsTitles[subView] || standingsTitles.wildcard;
    }

    if (viewName === 'media') {
        const mediaTitles = {
            all: 'Minnesota Wild Videos & Highlights 2025-26 | Wild Hockey Hub',
            highlights: 'Minnesota Wild Game Highlights 2025-26 | Wild Hockey Hub',
            recaps: 'Minnesota Wild Game Recaps 2025-26 | Wild Hockey Hub',
            condensed: 'Minnesota Wild Condensed Games 2025-26 | Wild Hockey Hub'
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
                ? `Minnesota Wild vs ${team.name} Head-to-Head Stats | Wild Hockey Hub`
                : 'Minnesota Wild Head-to-Head Stats | Wild Hockey Hub';
        }
        if (subView === 'team-records') {
            return 'Minnesota Wild All-Time Franchise Records & Leaders | Wild Hockey Hub';
        }
        if (subView === 'milestones') {
            return 'Minnesota Wild Player Milestones 2025-26 | Wild Hockey Hub';
        }
        return 'Minnesota Wild Player Stats 2025-26 – Goals, Assists & Points | Wild Hockey Hub';
    }

    const titles = {
        dashboard: 'Minnesota Wild Stats, Standings & Schedule 2025-26 | Wild Hockey Hub',
        schedule: 'Minnesota Wild 2025-26 Schedule – Upcoming Games & Results | Wild Hockey Hub'
    };
    return titles[viewName] || 'Minnesota Wild Stats, Standings & Schedule 2025-26 | Wild Hockey Hub';
}

// Get meta description for SEO
function getMetaDescription(viewName, subView = null) {
    if (viewName === 'standings') {
        const standingsDescriptions = {
            wildcard: 'Minnesota Wild wildcard standings for 2025-26. View current NHL wildcard standings, points, wins, losses, and playoff positioning.',
            division: 'NHL division standings for 2025-26. View all four division standings including where the Minnesota Wild rank in the Central Division.',
            conference: 'NHL conference standings for 2025-26. View Eastern and Western Conference standings including Minnesota Wild playoff positioning.',
            league: 'Full NHL league standings for 2025-26. See where Minnesota Wild ranks across all 32 NHL teams by points and percentage.'
        };
        return standingsDescriptions[subView] || standingsDescriptions.wildcard;
    }

    if (viewName === 'media') {
        const mediaDescriptions = {
            all: 'Minnesota Wild videos for 2025-26. Watch highlights, game recaps, interviews, and more from the Wild.',
            highlights: 'Minnesota Wild game highlights for 2025-26. Watch the best plays, goals, and saves from Wild games this season.',
            recaps: 'Minnesota Wild game recaps for 2025-26. Watch condensed game recaps and full game summaries.',
            condensed: 'Minnesota Wild condensed games for 2025-26. Watch full condensed game replays for every Wild game this season.'
        };
        return mediaDescriptions[subView] || mediaDescriptions.all;
    }

    if (viewName === 'stats' && subView === 'milestones') {
        return 'Minnesota Wild player milestones for 2025-26. See which Wild players are approaching franchise records and which milestones have already been achieved this season.';
    }

    const descriptions = {
        dashboard: 'Minnesota Wild stats, standings, schedules, and news for 2025-26. Your hub for Wild hockey with live game updates, player statistics, and NHL standings.',
        stats: 'Minnesota Wild player statistics for 2025-26. View skater and goalie stats including goals, assists, points, save percentage, and more.',
        schedule: 'Minnesota Wild game schedule for 2025-26. See upcoming games, past results, scores, and the full season schedule.'
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
