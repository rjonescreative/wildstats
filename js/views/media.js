// Media view module
import { getVideos } from '../api.js';

let videos = [];
let hasMore = false;
let offset = 0;
let isLoading = false;
let currentView = 'all';

function formatDuration(duration) {
    if (!duration) return '';
    // Duration comes as HH:MM:SS, convert to M:SS or H:MM:SS
    const parts = duration.split(':');
    if (parts.length === 3) {
        const hours = parseInt(parts[0]);
        const mins = parseInt(parts[1]);
        const secs = parts[2];
        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs}`;
        }
        return `${mins}:${secs}`;
    }
    return duration;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function init(view = 'all') {
    // Reset state on init
    videos = [];
    hasMore = false;
    offset = 0;
    isLoading = false;
    currentView = view;

    // Update active state of view buttons
    updateViewButtons(view);

    await loadVideos(true);
}

function updateViewButtons(view) {
    document.querySelectorAll('#media-view .view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });
}

export function render() {
    renderVideos();
}

export function cleanup() {
    closeVideoModal();
}

async function loadVideos(initial = false) {
    if (isLoading) return;

    const container = document.getElementById('media-container');
    const limit = 12;

    if (initial) {
        container.innerHTML = '<div class="loading">Loading videos...</div>';
        offset = 0;
        videos = [];
    }

    isLoading = true;

    try {
        const data = await getVideos(offset, limit, currentView);
        videos = initial ? data.videos : [...videos, ...data.videos];
        hasMore = data.hasMore;
        offset = data.nextOffset;
        renderVideos();
    } catch (error) {
        console.error('Error loading videos:', error);
        if (initial) {
            container.innerHTML = '<div class="loading">Error loading videos.</div>';
        }
    } finally {
        isLoading = false;
    }
}

function renderVideos() {
    const container = document.getElementById('media-container');

    if (videos.length === 0) {
        container.innerHTML = '<div class="loading">No videos available.</div>';
        return;
    }

    const videoCards = videos.map(video => `
        <div class="video-card" data-brightcove-id="${video.brightcoveId}" data-account-id="${video.brightcoveAccountId}">
            <div class="video-thumbnail-container">
                <img src="${video.thumbnail}" alt="${video.title}" class="video-thumbnail" loading="lazy">
                <div class="video-play-overlay">
                    <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </div>
                ${video.duration ? `<span class="video-duration">${formatDuration(video.duration)}</span>` : ''}
            </div>
            <div class="video-info">
                <h3 class="video-title">${video.title}</h3>
                <span class="video-date">${formatDate(video.contentDate)}</span>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="video-grid">
            ${videoCards}
        </div>
        ${hasMore ? `
            <div class="video-more-container">
                <button class="video-more-btn" id="load-more-videos">More</button>
            </div>
        ` : ''}
    `;

    setupEventListeners();
}

function setupEventListeners() {
    // Video card clicks
    document.querySelectorAll('.video-card').forEach(card => {
        card.addEventListener('click', () => {
            const brightcoveId = card.dataset.brightcoveId;
            const accountId = card.dataset.accountId;
            if (brightcoveId) {
                openVideoModal(brightcoveId, accountId);
            }
        });
    });

    // Load more button
    const loadMoreBtn = document.getElementById('load-more-videos');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => loadVideos(false));
    }
}

function openVideoModal(brightcoveId, accountId) {
    // Remove existing modal if any
    closeVideoModal();

    const modal = document.createElement('div');
    modal.className = 'video-modal';
    modal.innerHTML = `
        <div class="video-modal-backdrop"></div>
        <div class="video-modal-content">
            <button class="video-modal-close">&times;</button>
            <div class="video-player-container">
                <iframe
                    src="https://players.brightcove.net/${accountId}/EXtG1xJ7H_default/index.html?videoId=${brightcoveId}"
                    allowfullscreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    class="video-player-iframe"
                ></iframe>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Trigger animation
    requestAnimationFrame(() => {
        modal.classList.add('visible');
    });

    // Close handlers
    modal.querySelector('.video-modal-backdrop').addEventListener('click', closeVideoModal);
    modal.querySelector('.video-modal-close').addEventListener('click', closeVideoModal);

    // Escape key handler
    document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e) {
    if (e.key === 'Escape') {
        closeVideoModal();
    }
}

function closeVideoModal() {
    const modal = document.querySelector('.video-modal');
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 200);
    }
    document.removeEventListener('keydown', handleEscapeKey);
}
