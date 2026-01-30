// Main entry point for the SPA
import * as router from './router.js';
import * as dashboard from './views/dashboard.js';
import * as stats from './views/stats.js';
import * as standings from './views/standings.js';
import * as playerCard from './playerCard.js';

// Goal horn audio
const goalHorn = new Audio('/sounds/goal-horn.mp3');

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

    // Initialize player card hover functionality
    playerCard.init();

    // Goal horn on 'g' key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'g' || e.key === 'G') {
            // Don't trigger if user is typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Reset and play the goal horn
            goalHorn.currentTime = 0;
            goalHorn.play().catch(err => {
                console.log('Error playing goal horn:', err);
            });
        }
    });
});
