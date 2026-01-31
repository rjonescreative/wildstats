// Main entry point for the SPA
import * as router from './router.js';
import * as dashboard from './views/dashboard.js';
import * as stats from './views/stats.js';
import * as standings from './views/standings.js';
import * as schedule from './views/schedule.js';
import * as playerCard from './playerCard.js';

// Goal horn audio
const goalHorn = new Audio('/sounds/goal-horn.mp3');
const opponentGoal = new Audio('/sounds/opponent-goal.mp3');

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Register view modules with the router
    router.setViewModules({
        dashboard,
        stats,
        standings,
        schedule
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

            // Get the header logo
            const headerLogo = document.querySelector('.header-logo');
            if (headerLogo) {
                // Store original src and dimensions
                const originalSrc = headerLogo.src;
                const originalWidth = headerLogo.offsetWidth;
                const originalStyle = headerLogo.style.cssText;

                // Set fixed width to prevent layout shift
                headerLogo.style.width = `${originalWidth}px`;
                headerLogo.style.objectFit = 'contain';

                // Swap to goal light
                headerLogo.src = '/images/goal-light.gif';

                // Reset and play the goal horn
                goalHorn.currentTime = 0;
                goalHorn.play().catch(err => {
                    console.log('Error playing goal horn:', err);
                });

                // Swap back to original logo when sound ends
                const resetLogo = () => {
                    headerLogo.src = originalSrc;
                    headerLogo.style.cssText = originalStyle;
                };

                goalHorn.onended = resetLogo;

                // Also swap back if interrupted (user presses 'g' again)
                setTimeout(() => {
                    if (!goalHorn.paused && goalHorn.currentTime > 0) {
                        // Still playing, will swap back on ended event
                    } else {
                        // Not playing anymore, swap back now
                        resetLogo();
                    }
                }, goalHorn.duration * 1000 + 100);
            }
        }

        // Opponent goal on 'o' key press
        if (e.key === 'o' || e.key === 'O') {
            // Don't trigger if user is typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Get the header logo
            const headerLogo = document.querySelector('.header-logo');
            if (headerLogo) {
                // Store original src and dimensions
                const originalSrc = headerLogo.src;
                const originalWidth = headerLogo.offsetWidth;
                const originalStyle = headerLogo.style.cssText;

                // Set fixed width to prevent layout shift
                headerLogo.style.width = `${originalWidth}px`;
                headerLogo.style.objectFit = 'contain';

                // Swap to Opa
                headerLogo.src = '/images/opa.gif';

                // Reset and play the opponent goal sound
                opponentGoal.currentTime = 0;
                opponentGoal.play().catch(err => {
                    console.log('Error playing opponent goal sound:', err);
                });

                // Swap back to original logo when sound ends
                const resetLogo = () => {
                    headerLogo.src = originalSrc;
                    headerLogo.style.cssText = originalStyle;
                };

                opponentGoal.onended = resetLogo;

                // Also swap back if interrupted
                setTimeout(() => {
                    if (!opponentGoal.paused && opponentGoal.currentTime > 0) {
                        // Still playing, will swap back on ended event
                    } else {
                        // Not playing anymore, swap back now
                        resetLogo();
                    }
                }, opponentGoal.duration * 1000 + 100);
            }
        }
    });
});
