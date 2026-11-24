// Media view module
import { getVideos, getSchedule, getGameVideos } from '../api.js';
import { openVideo } from '../router.js';
import { videoQueueFrom } from '../videoQueue.js';
import { hideVideoModal } from '../videoModal.js';

const SECTION_TITLES = {
    all: 'Latest Videos',
    highlights: 'Highlights',
    recaps: 'Game Recaps',
    condensed: 'Condensed Games',
    games: 'Game-by-Game',
};

const WILD_ID = 30;

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

    // Update active state of view buttons and the section heading
    updateViewButtons(view);
    const heading = document.getElementById('media-heading');
    if (heading) heading.textContent = SECTION_TITLES[view] || SECTION_TITLES.all;

    if (view === 'games') {
        await loadGames();
        return;
    }
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
    if (currentView === 'games') return; // the game list keeps its open games
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

    const videoCards = videos.map(videoCard).join('');

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

function videoCard(video) {
    return `
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
                <p class="video-title">${video.title}</p>
                <span class="video-date">${formatDate(video.contentDate)}</span>
            </div>
        </div>
    `;
}

function setupEventListeners() {
    setupVideoCards(document);

    // Load more button
    const loadMoreBtn = document.getElementById('load-more-videos');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => loadVideos(false));
    }
}

// Video card clicks and keyboard activation, for the cards inside `root`
function setupVideoCards(root) {
    root.querySelectorAll('.video-card').forEach(card => {
        const handleActivation = () => {
            const { brightcoveId, accountId, slug, title } = card.dataset;
            if (brightcoveId) {
                openVideo({ brightcoveId, accountId, slug, title }, videoQueueFrom(card));
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
}

// ─── Game-by-Game ────────────────────────────────────────────────────────────
// Every game played this season, newest first. Opening a game loads its videos from both teams
// (/api/media/game/:gameId): the Wild's, then the opponent's, each in the order they were posted.

const PLAYED = new Set(['LIVE', 'CRIT', 'OFF', 'FINAL']);

const teamLogo = team => team.abbrev === 'MIN' ? '/logos/MIN_dark.svg' : (team.darkLogo || `/logos/${team.abbrev}_dark.svg`);
const teamName = team => [team.placeName?.default, team.commonName?.default].filter(Boolean).join(' ') || team.abbrev;

function gameResult(game) {
    if (game.gameState === 'LIVE' || game.gameState === 'CRIT') return { text: 'Live', cls: '' };
    const wild = game.homeTeam.abbrev === 'MIN' ? game.homeTeam : game.awayTeam;
    const opp = wild === game.homeTeam ? game.awayTeam : game.homeTeam;
    if (wild.score === undefined) return { text: '', cls: '' };
    const extra = { OT: ' (OT)', SO: ' (SO)' }[game.periodDescriptor?.periodType] ?? '';
    return wild.score > opp.score
        ? { text: `W${extra}`, cls: 'game-win' }
        : { text: `L${extra}`, cls: 'game-loss' };
}

function gameRow(game) {
    const { awayTeam: away, homeTeam: home } = game;
    const date = new Date(game.gameDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const result = gameResult(game);
    const label = `${date}: ${away.abbrev} ${away.score ?? ''} at ${home.abbrev} ${home.score ?? ''}${result.text ? `, ${result.text}` : ''}. Show videos`;
    return `
        <div class="gbg-game" data-game-id="${game.id}">
            <button class="gbg-row" aria-expanded="false" aria-controls="gbg-panel-${game.id}" aria-label="${escapeAttr(label)}">
                <span class="gbg-date">${date}${game.gameType === 3 ? '<span class="gbg-playoff">Playoffs</span>' : ''}</span>
                <span class="gbg-matchup">
                    <img src="${teamLogo(away)}" alt="" class="team-logo">
                    <span class="gbg-team">${away.abbrev}</span>
                    <span class="gbg-score">${away.score ?? ''}</span>
                    <span class="gbg-at">@</span>
                    <span class="gbg-score">${home.score ?? ''}</span>
                    <span class="gbg-team">${home.abbrev}</span>
                    <img src="${teamLogo(home)}" alt="" class="team-logo">
                </span>
                <span class="gbg-result ${result.cls}">${result.text}</span>
                <svg class="gbg-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="gbg-panel" id="gbg-panel-${game.id}" hidden></div>
        </div>`;
}

async function loadGames() {
    const container = document.getElementById('media-container');
    container.innerHTML = '<div class="loading">Loading games...</div>';
    try {
        const schedule = await getSchedule();
        const games = (schedule.games ?? [])
            .filter(g => (g.gameType === 2 || g.gameType === 3) && PLAYED.has(g.gameState))
            .sort((a, b) => b.startTimeUTC.localeCompare(a.startTimeUTC));
        if (currentView !== 'games') return;
        if (games.length === 0) {
            container.innerHTML = '<div class="loading">No games played yet this season.</div>';
            return;
        }
        const byId = new Map(games.map(g => [String(g.id), g]));
        container.innerHTML = `<div class="gbg-list">${games.map(gameRow).join('')}</div>`;
        container.querySelectorAll('.gbg-row').forEach(row => {
            row.addEventListener('click', () => toggleGame(row, byId.get(row.closest('.gbg-game').dataset.gameId)));
        });
    } catch (error) {
        console.error('Error loading games:', error);
        container.innerHTML = '<div class="loading">Error loading games.</div>';
    }
}

function toggleGame(row, game) {
    const panel = row.nextElementSibling;
    const open = row.getAttribute('aria-expanded') !== 'true';
    row.setAttribute('aria-expanded', String(open));
    row.setAttribute('aria-label', row.getAttribute('aria-label').replace(open ? 'Show videos' : 'Hide videos', open ? 'Hide videos' : 'Show videos'));
    panel.hidden = !open;
    if (open && !panel.dataset.loaded) loadGamePanel(panel, game);
}

async function loadGamePanel(panel, game) {
    panel.dataset.loaded = 'loading';
    panel.innerHTML = '<div class="loading">Loading videos...</div>';
    try {
        const data = await getGameVideos(game.id);
        const opp = game.homeTeam.abbrev === 'MIN' ? game.awayTeam : game.homeTeam;
        const wild = game.homeTeam.abbrev === 'MIN' ? game.homeTeam : game.awayTeam;
        // National copies (tagged with both teams) sit with the Wild's
        const wildVideos = data.videos.filter(v => v.teams.includes(WILD_ID));
        const oppVideos = data.videos.filter(v => !v.teams.includes(WILD_ID));
        const section = (team, list) => list.length === 0 ? '' : `
            <section class="gbg-section">
                <h3 class="gbg-section-title"><img src="${teamLogo(team)}" alt="" class="team-logo">${teamName(team)}<span class="gbg-count">${list.length} ${list.length === 1 ? 'video' : 'videos'}</span></h3>
                <div class="video-grid">${list.map(videoCard).join('')}</div>
            </section>`;
        panel.innerHTML = data.videos.length
            ? section(wild, wildVideos) + section(opp, oppVideos)
            : '<div class="loading">No videos for this game yet.</div>';
        panel.dataset.loaded = 'true';
        setupVideoCards(panel);
    } catch (error) {
        console.error(`Error loading videos for game ${game.id}:`, error);
        panel.innerHTML = '<div class="loading">Error loading videos. Close and reopen the game to try again.</div>';
        delete panel.dataset.loaded;
    }
}
