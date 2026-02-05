// Client-side router using History API
import { setCurrentView, getCurrentView } from './state.js';
import { trackPageView, trackNavigation, trackStandingsView } from './analytics.js';

// Route configuration
const routes = {
    '/': 'dashboard',
    '/stats': 'stats',
    '/standings': 'standings',
    '/standings/wildcard': 'standings',
    '/standings/division': 'standings',
    '/standings/conference': 'standings',
    '/standings/league': 'standings',
    '/schedule': 'schedule',
    '/media': 'media',
    '/media/highlights': 'media',
    '/media/recaps': 'media'
};

// View modules (will be set by main.js)
let viewModules = {};

// Set view modules
export function setViewModules(modules) {
    viewModules = modules;
}

// Get view name from path
function getViewFromPath(path) {
    return routes[path] || 'dashboard';
}

// Get standings sub-view from path
function getStandingsView(path) {
    if (path === '/standings') return 'wildcard';
    const match = path.match(/^\/standings\/(.+)$/);
    return match ? match[1] : 'wildcard';
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
        if ((viewName === 'standings' || viewName === 'media') && subView) {
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
    const mediaView = viewName === 'media' ? getMediaView(path) : null;
    const subView = standingsView || mediaView;

    // Update URL
    history.pushState({ path, viewName, subView }, '', path);

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
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

    if (viewName === 'standings') {
        const view = capitalize(subView || 'wildcard');
        return `Wild Hockey Hub | Standings | ${view}`;
    }

    if (viewName === 'media') {
        const mediaLabels = { all: 'All', highlights: 'Highlights', recaps: 'Game Recaps' };
        const label = mediaLabels[subView] || 'All';
        return `Wild Hockey Hub | Media | ${label}`;
    }

    const titles = {
        dashboard: 'Wild Hockey Hub | Dashboard',
        stats: 'Wild Hockey Hub | Stats',
        schedule: 'Wild Hockey Hub | Schedule'
    };
    return titles[viewName] || 'Wild Hockey Hub';
}

// Get meta description for SEO
function getMetaDescription(viewName, subView = null) {
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

    if (viewName === 'standings') {
        const view = capitalize(subView || 'wildcard');
        return `Minnesota Wild ${view.toLowerCase()} standings. View current NHL ${view.toLowerCase()} standings, points, wins, losses, and playoff positioning.`;
    }

    if (viewName === 'media') {
        const mediaDescriptions = {
            all: 'Minnesota Wild videos. Watch highlights, game recaps, interviews, and more from the Wild.',
            highlights: 'Minnesota Wild game highlights. Watch the best plays, goals, and saves from Wild games.',
            recaps: 'Minnesota Wild game recaps. Watch condensed game recaps and full game summaries.'
        };
        return mediaDescriptions[subView] || mediaDescriptions.all;
    }

    const descriptions = {
        dashboard: 'Minnesota Wild stats, standings, schedules, and news. Your hub for Wild hockey with live game updates, player statistics, and NHL standings.',
        stats: 'Minnesota Wild player statistics. View skater and goalie stats including goals, assists, points, save percentage, and more.',
        schedule: 'Minnesota Wild game schedule. See upcoming games, past results, and the full season schedule for the Wild.'
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
    const mediaView = viewName === 'media' ? getMediaView(path) : null;
    const subView = standingsView || mediaView;

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
    const mediaView = viewName === 'media' ? getMediaView(path) : null;
    const subView = standingsView || mediaView;

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
