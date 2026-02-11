// Main entry point for the SPA
import * as router from './router.js';
import * as dashboard from './views/dashboard.js';
import * as stats from './views/stats.js';
import * as standings from './views/standings.js';
import * as schedule from './views/schedule.js';
import * as media from './views/media.js';
import * as playerCard from './playerCard.js';
import * as analytics from './analytics.js';

// Goal horn audio
const goalHorn = new Audio('/sounds/goal-horn.mp3');
const opa = new Audio('/sounds/opa.mp3');

// Set random background image on site load
const backgrounds = [
    '/backgrounds/background_boldy_kaprizov.jpg',
    '/backgrounds/background_boldy.jpg',
    '/backgrounds/background_hughes.jpg',
    '/backgrounds/background_kaprizov.jpg',
    '/backgrounds/background_wallstedt.jpg',
    '/backgrounds/background_boldy_hughes_kaprizov_ek.jpg',
];
const randomBackground = backgrounds[Math.floor(Math.random() * backgrounds.length)];
document.body.style.backgroundImage = `url('${randomBackground}')`;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Register view modules with the router
    router.setViewModules({
        dashboard,
        stats,
        standings,
        schedule,
        media
    });

    // Initialize the router
    router.init();

    // Initialize player card hover functionality
    playerCard.init();

    // Initialize analytics (outbound link tracking)
    analytics.init();

    // About modal
    const aboutModal = document.getElementById('about-modal');
    const openAboutBtn = document.getElementById('open-about-modal');
    const closeAboutBtn = document.getElementById('about-modal-close');
    const aboutBackdrop = document.getElementById('about-modal-backdrop');

    function openAboutModal() {
        aboutModal.classList.add('visible');
    }

    function closeAboutModal() {
        aboutModal.classList.remove('visible');
    }

    openAboutBtn.addEventListener('click', (e) => { e.preventDefault(); openAboutModal(); });
    closeAboutBtn.addEventListener('click', closeAboutModal);
    aboutBackdrop.addEventListener('click', closeAboutModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && aboutModal.classList.contains('visible')) {
            closeAboutModal();
        }
    });

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

                // Track easter egg usage
                analytics.trackEasterEgg('goal_horn');

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

                // Track easter egg usage
                analytics.trackEasterEgg('opa');

                opa.currentTime = 0;
                opa.play().catch(err => {
                    console.log('Error playing opa sound:', err);
                });

                opa.onended = () => resetLogo(headerLogo);

                setTimeout(() => {
                    if (!opa.paused && opa.currentTime > 0) {
                        // Still playing, will swap back on ended event
                    } else {
                        resetLogo(headerLogo);
                    }
                }, opa.duration * 1000 + 100);
            }
        }
    });
});
