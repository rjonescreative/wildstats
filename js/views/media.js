// Media view module
import { getVideos } from '../api.js';
import { openVideo } from '../router.js';
import { hideVideoModal } from '../videoModal.js';

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

function escapeAttr(text = '') {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
    hideVideoModal();
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
        // Skip a play already shown from an earlier page (its two copies can straddle a page break)
        const shownPlays = new Set(initial ? [] : videos.map(v => v.playKey).filter(Boolean));
        const newVideos = data.videos.filter(v => !v.playKey || !shownPlays.has(v.playKey));
        videos = initial ? newVideos : [...videos, ...newVideos];
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
        <div class="video-card" tabindex="0" role="button" aria-label="Play video: ${video.title.replace(/"/g, '&quot;')}" data-brightcove-id="${video.brightcoveId}" data-account-id="${video.brightcoveAccountId}" data-slug="${video.slug || ''}" data-title="${escapeAttr(video.title)}">
            <div class="video-thumbnail-container">
                <img src="${video.thumbnail}" alt="" class="video-thumbnail" loading="lazy">
                <div class="video-play-overlay" aria-hidden="true">
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
    // Video card clicks and keyboard activation
    document.querySelectorAll('.video-card').forEach(card => {
        const handleActivation = () => {
            const { brightcoveId, accountId, slug, title } = card.dataset;
            if (brightcoveId) {
                openVideo({ brightcoveId, accountId, slug, title });
            }
        };

        card.addEventListener('click', handleActivation);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivation();
            }
        });
    });

    // Load more button
    const loadMoreBtn = document.getElementById('load-more-videos');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => loadVideos(false));
    }
}
