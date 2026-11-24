// Video player modal. Only the dialog itself: the router owns the shareable URL and opens/closes
// this as the address changes.
//
// The player is Brightcove's in-page player (their script, not an iframe), so the page can tell
// when a video ends. Then an end screen inside the player offers the previous and next videos of
// the page's queue (js/videoQueue.js) and a replay button; the control bar stays usable below it.
// Being inside the player, the end screen also shows in full screen, and a picked video loads into
// the same player, so full screen carries on. If the script can't load (or the video is on
// another Brightcove account), the modal falls back to Brightcove's iframe player, with no end
// screen.
import { brightcovePlayerUrl, DEFAULT_BRIGHTCOVE_ACCOUNT } from './videoLinks.js';

const PLAYER_ID = 'EXtG1xJ7H';
const PLAYER_SCRIPT = `https://players.brightcove.net/${DEFAULT_BRIGHTCOVE_ACCOUNT}/${PLAYER_ID}_default/index.min.js`;

let onUserClose = null;
let player = null;          // Brightcove (video.js) player in the open modal, or null
let queue = [];             // videos the end screen steps through
let onPlay = null;          // (video) => void, when the end screen switches videos
let scriptPromise = null;

function openModal() {
    return document.querySelector('.video-modal:not(.closing)');
}

export function isVideoModalOpen() {
    return Boolean(openModal());
}

// The Brightcove player script, loaded once. Resolves to window.bc, or rejects.
function loadPlayerScript() {
    scriptPromise ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = PLAYER_SCRIPT;
        script.async = true;
        script.onload = () => window.bc ? resolve(window.bc) : reject(new Error('Brightcove player missing'));
        script.onerror = () => reject(new Error('Brightcove player failed to load'));
        document.head.appendChild(script);
    }).catch(error => {
        scriptPromise = null; // try again next time
        throw error;
    });
    return scriptPromise;
}

const escapeHtml = (text = '') => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Show a video. onClose runs when the viewer closes it (button, backdrop, Escape), not when
 * hideVideoModal() is called. options.queue: the page's videos for the end screen;
 * options.onPlay(video): called when the viewer picks another video from it.
 */
export function showVideoModal(video, onClose = null, options = {}) {
    hideVideoModal({ restoreFocus: false });

    const { brightcoveId, accountId } = video;
    const triggerElement = document.activeElement;
    const modal = document.createElement('div');
    modal.className = 'video-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Video player');
    modal.dataset.brightcoveId = brightcoveId;
    modal.innerHTML = `
        <div class="video-modal-backdrop"></div>
        <div class="video-modal-content">
            <button class="video-modal-close" aria-label="Close video">&times;</button>
            <div class="video-player-container"></div>
        </div>
    `;
    modal._triggerElement = triggerElement;
    onUserClose = onClose;
    queue = options.queue ?? [];
    onPlay = options.onPlay ?? null;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Fade in: read layout first so the transition runs (requestAnimationFrame can be held back
    // while a shared link's page is still loading, leaving the modal half-faded)
    void modal.offsetWidth;
    modal.classList.add('visible');
    modal.querySelector('.video-modal-close').focus();

    modal.querySelector('.video-modal-backdrop').addEventListener('click', userClose);
    modal.querySelector('.video-modal-close').addEventListener('click', userClose);
    modal.addEventListener('keydown', handleFocusTrap);
    document.addEventListener('keydown', handleEscapeKey);

    const container = modal.querySelector('.video-player-container');
    if (accountId && accountId !== DEFAULT_BRIGHTCOVE_ACCOUNT) {
        showIframe(container, video);
        return;
    }
    loadPlayerScript()
        .then(bc => { if (openModal() === modal) createPlayer(bc, container, brightcoveId); })
        .catch(() => { if (openModal() === modal) showIframe(container, video); });
}

function showIframe(container, { brightcoveId, accountId }) {
    container.innerHTML = `
        <iframe
            src="${brightcovePlayerUrl(accountId, brightcoveId, 'any')}"
            allowfullscreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            class="video-player-iframe"
            title="Video player"
        ></iframe>`;
}

function createPlayer(bc, container, brightcoveId) {
    container.innerHTML = `
        <video-js
            data-account="${DEFAULT_BRIGHTCOVE_ACCOUNT}"
            data-player="${PLAYER_ID}"
            data-embed="default"
            data-video-id="${brightcoveId}"
            controls
            playsinline
            class="video-player-js"></video-js>`;
    player = bc(container.querySelector('video-js'));
    player.ready(() => {
        playWithSound(player);
    });
    player.on('ended', showEndScreen);
    // A postroll ad hides the end screen (its play events); bring it back once the ad is over
    player.on('adend', () => {
        if (player?.ended() || player?.currentTime() >= player?.duration() - 0.5) showEndScreen();
    });
    // Replaying, seeking back or picking a video hides the end screen
    player.on(['play', 'seeking', 'loadstart'], hideEndScreen);
}

// Autoplay with sound when the browser allows it, else muted
function playWithSound(p) {
    const attempt = p.play();
    if (attempt?.catch) {
        attempt.catch(() => {
            p.muted(true);
            p.play()?.catch?.(() => {});
        });
    }
}

// ─── End screen ──────────────────────────────────────────────────────────────

function currentIndex() {
    const id = openModal()?.dataset.brightcoveId;
    return queue.findIndex(v => v.brightcoveId === id);
}

function endCard(video, dir) {
    if (!video) return '';
    const label = dir === 'prev' ? 'Previous' : 'Up next';
    return `
        <button class="video-end-card video-end-card--${dir}" data-dir="${dir}" aria-label="${label}: ${escapeHtml(video.title)}">
            <span class="video-end-label">${label}</span>
            <span class="video-end-thumb">
                ${video.thumbnail ? `<img src="${escapeHtml(video.thumbnail)}" alt="">` : ''}
                <svg class="video-end-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            </span>
            <span class="video-end-title">${escapeHtml(video.title)}</span>
        </button>`;
}

function showEndScreen() {
    if (!player || player.ads?.inAdBreak?.()) return;
    hideEndScreen();
    const index = currentIndex();
    const prev = index > 0 ? queue[index - 1] : null;
    const next = index >= 0 && index < queue.length - 1 ? queue[index + 1] : null;

    const screen = document.createElement('div');
    screen.className = 'video-end-screen';
    screen.setAttribute('role', 'group');
    screen.setAttribute('aria-label', 'Video ended');
    screen.innerHTML = `
        <div class="video-end-cards${prev && next ? '' : ' video-end-cards--single'}">
            ${endCard(prev, 'prev')}
            ${endCard(next, 'next')}
        </div>
        <button class="video-end-replay">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" fill="currentColor"/></svg>
            Replay
        </button>`;
    screen.querySelectorAll('.video-end-card').forEach(card => {
        card.addEventListener('click', () => playVideo(card.dataset.dir === 'prev' ? prev : next));
    });
    screen.querySelector('.video-end-replay').addEventListener('click', () => {
        player.currentTime(0);
        player.play();
    });
    player.el().appendChild(screen);
    player.addClass('video-ended-with-screen');
    (screen.querySelector('.video-end-card--next') || screen.querySelector('.video-end-card, .video-end-replay'))?.focus({ preventScroll: true });
}

function hideEndScreen() {
    if (!player) return;
    player.el().querySelector('.video-end-screen')?.remove();
    player.removeClass('video-ended-with-screen');
}

// Load another video into the same player (keeps full screen)
function playVideo(video) {
    const modal = openModal();
    if (!video || !player || !modal) return;
    hideEndScreen();
    modal.dataset.brightcoveId = video.brightcoveId;
    player.catalog.getVideo(video.brightcoveId, (error, media) => {
        if (error || !player) return;
        player.catalog.load(media);
        playWithSound(player);
    });
    if (onPlay) onPlay(video);
}

// ─── Open / close ────────────────────────────────────────────────────────────

// The Brightcove ID of the open video, or null
export function openVideoId() {
    return openModal()?.dataset.brightcoveId ?? null;
}

function userClose() {
    const callback = onUserClose;
    hideVideoModal();
    if (callback) callback();
}

export function hideVideoModal({ restoreFocus = true } = {}) {
    onUserClose = null;
    onPlay = null;
    queue = [];
    document.removeEventListener('keydown', handleEscapeKey);
    const modal = openModal();
    if (!modal) return;

    if (player) {
        if (player.isFullscreen?.()) player.exitFullscreen();
        const closing = player;
        player = null;
        setTimeout(() => closing.dispose(), 200);
    }

    const triggerElement = modal._triggerElement;
    modal.classList.add('closing');
    modal.classList.remove('visible');
    setTimeout(() => {
        modal.remove();
        if (!openModal()) document.body.style.overflow = '';
        if (restoreFocus && triggerElement?.focus && document.contains(triggerElement)) {
            triggerElement.focus();
        }
    }, 200);
}

function handleEscapeKey(e) {
    if (e.key !== 'Escape') return;
    // Escape in full screen only leaves full screen
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    userClose();
}

function handleFocusTrap(e) {
    if (e.key !== 'Tab') return;
    const modal = openModal();
    if (!modal) return;

    const focusable = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), iframe')]
        .filter(el => el.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
    }
}
