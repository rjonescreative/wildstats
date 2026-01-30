// Main entry point for the SPA
import * as router from './router.js';
import * as dashboard from './views/dashboard.js';
import * as stats from './views/stats.js';
import * as standings from './views/standings.js';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Register view modules with the router
    router.setViewModules({
        dashboard,
        stats,
        standings
    });

    // Initialize the router
    router.init();
});
