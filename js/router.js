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
    '/schedule': 'schedule'
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

// Show a specific view
async function showView(viewName, standingsView = null) {
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
        if (viewName === 'standings' && standingsView) {
            await viewModule.init(standingsView);
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
            (href === '/schedule' && viewName === 'schedule')
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

    // Update URL
    history.pushState({ path, viewName, standingsView }, '', path);

    // Track navigation
    if (previousView && previousView !== viewName) {
        trackNavigation(previousView, viewName);
    }

    // Track standings sub-view changes
    if (viewName === 'standings' && standingsView) {
        trackStandingsView(standingsView);
    }

    // Track page view
    const pageTitle = getPageTitle(viewName, standingsView);
    trackPageView(path, pageTitle);

    // Show the view
    await showView(viewName, standingsView);
}

// Get page title for analytics
function getPageTitle(viewName, standingsView = null) {
    const titles = {
        dashboard: 'Dashboard - Wild Hockey Hub',
        stats: 'Team Stats - Wild Hockey Hub',
        standings: `Standings (${standingsView || 'wildcard'}) - Wild Hockey Hub`,
        schedule: 'Schedule - Wild Hockey Hub'
    };
    return titles[viewName] || 'Wild Hockey Hub';
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

    // Show the view without pushing to history (already in history)
    showView(viewName, standingsView);
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

    // Replace current state to set initial state
    history.replaceState({ path, viewName, standingsView }, '', path);

    // Track initial page view
    const pageTitle = getPageTitle(viewName, standingsView);
    trackPageView(path, pageTitle);

    // Show initial view
    showView(viewName, standingsView);
}
