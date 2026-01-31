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

    // Original logo state, captured once before any swap
    let originalLogoSrc = null;
    let originalLogoStyle = null;

    function captureOriginalLogo(headerLogo) {
        if (originalLogoSrc === null) {
            originalLogoSrc = headerLogo.src;
            originalLogoStyle = headerLogo.style.cssText;
        }
    }

    function resetLogo(headerLogo) {
        headerLogo.src = originalLogoSrc;
        headerLogo.style.cssText = originalLogoStyle;
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'g' || e.key === 'G') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            const headerLogo = document.querySelector('.header-logo');
            if (headerLogo) {
                captureOriginalLogo(headerLogo);
                headerLogo.src = '/images/goal-light.gif';

                goalHorn.currentTime = 0;
                goalHorn.play().catch(err => {
                    console.log('Error playing goal horn:', err);
                });

                goalHorn.onended = () => resetLogo(headerLogo);

                setTimeout(() => {
                    if (!goalHorn.paused && goalHorn.currentTime > 0) {
                        // Still playing, will swap back on ended event
                    } else {
                        resetLogo(headerLogo);
                    }
                }, goalHorn.duration * 1000 + 100);
            }
        }

        if (e.key === 'o' || e.key === 'O') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            const headerLogo = document.querySelector('.header-logo');
            if (headerLogo) {
                captureOriginalLogo(headerLogo);
                headerLogo.src = '/images/opa.gif';

                opponentGoal.currentTime = 0;
                opponentGoal.play().catch(err => {
                    console.log('Error playing opponent goal sound:', err);
                });

                opponentGoal.onended = () => resetLogo(headerLogo);

                setTimeout(() => {
                    if (!opponentGoal.paused && opponentGoal.currentTime > 0) {
                        // Still playing, will swap back on ended event
                    } else {
                        resetLogo(headerLogo);
                    }
                }, opponentGoal.duration * 1000 + 100);
            }
        }
    });
});
