// Video player modal (Brightcove iframe). Only the dialog itself: the router owns the
// shareable URL and opens/closes this as the address changes.
import { brightcovePlayerUrl } from './videoLinks.js';

let onUserClose = null;

function openModal() {
    return document.querySelector('.video-modal:not(.closing)');
}

export function isVideoModalOpen() {
    return Boolean(openModal());
}

// Show a video. onClose runs when the viewer closes it (button, backdrop, Escape),
// not when hideVideoModal() is called.
export function showVideoModal({ brightcoveId, accountId }, onClose = null) {
    hideVideoModal({ restoreFocus: false });

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
            <div class="video-player-container">
                <iframe
                    src="${brightcovePlayerUrl(accountId, brightcoveId, 'any')}"
                    allowfullscreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    class="video-player-iframe"
                    title="Video player"
                ></iframe>
            </div>
        </div>
    `;
    modal._triggerElement = triggerElement;
    onUserClose = onClose;

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
}

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
    document.removeEventListener('keydown', handleEscapeKey);
    const modal = openModal();
    if (!modal) return;

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
    if (e.key === 'Escape') userClose();
}

function handleFocusTrap(e) {
    if (e.key !== 'Tab') return;
    const modal = openModal();
    if (!modal) return;

    const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), iframe');
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
