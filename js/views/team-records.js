// Team Records view module — Wild all-time franchise leaders
import { getMilestones, getWildStats } from '../api.js';

function currentSeasonId() {
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}${year + 1}`;
}

const CURRENT_SEASON = currentSeasonId();
const DISPLAY_LIMIT = 20;

function formatSeason(s) {
    return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
}

// ─── State ────────────────────────────────────────────────────────────────────

let timeMode = 'alltime';   // 'alltime' | 'season'
let statMode = 'goals';     // 'goals' | 'assists' | 'points' | 'shootout' | 'wins' | 'penaltyMinutes' | 'gamesPlayed'
let posMode  = 'all';       // 'all' | 'forwards' | 'defense' | 'goalies'

let milestones = null;
let currentSet = null;

// ─── Data selection ───────────────────────────────────────────────────────────

const FORWARDS = new Set(['L', 'R', 'C']);

function getEntries() {
    const { skaters, goalies } = milestones;
    const src = timeMode === 'alltime';

    // Wins always uses goalies pool regardless of posMode
    if (statMode === 'wins') {
        const entries = src
            ? (goalies.careerLeaders.wins ?? [])
            : (goalies.singleSeasonRecords.wins ?? []);
        return { entries, showSeason: !src };
    }

    // All goalie-position stats route to goalies pool
    if (posMode === 'goalies') {
        const pool = src ? goalies.careerLeaders : goalies.singleSeasonRecords;
        // gamesPlayed is all-time only (constraint enforced, but guard here too)
        const entries = statMode === 'gamesPlayed'
            ? (goalies.careerLeaders.gamesPlayed ?? [])
            : (pool[statMode] ?? []);
        return { entries: entries.slice(0, DISPLAY_LIMIT), showSeason: !src && statMode !== 'gamesPlayed' };
    }

    // Shootout (position-aware, skaters only)
    if (statMode === 'shootout') {
        const posKey = posMode === 'forwards' ? 'forwards' : posMode === 'defense' ? 'defense' : 'all';
        const pool = src ? skaters.careerLeaders : skaters.singleSeasonRecords;
        const entries = pool[posKey]?.shootoutGoals ?? [];
        return { entries: entries.slice(0, DISPLAY_LIMIT), showSeason: !src };
    }

    // All skater stats — position-specific pools
    const posKey = posMode === 'forwards' ? 'forwards' : posMode === 'defense' ? 'defense' : 'all';
    const pool = src ? skaters.careerLeaders : skaters.singleSeasonRecords;
    const entries = pool[posKey]?.[statMode] ?? [];
    return { entries: entries.slice(0, DISPLAY_LIMIT), showSeason: !src };
}

function tableLabel() {
    const time = timeMode === 'alltime' ? 'All-Time' : 'Single Season';
    const stat = { goals: 'Goals', assists: 'Assists', points: 'Points', shootout: 'Shootout Goals', wins: 'Wins', penaltyMinutes: 'Penalty Minutes', gamesPlayed: 'Games Played' }[statMode];
    const pos  = { all: '', forwards: ' — Forwards', defense: ' — Defense', goalies: '' }[posMode];
    return `${time} ${stat}${pos}`;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderRow(entry, rank, showSeason) {
    const isCurrent = currentSet.has(entry.playerId);
    const seasonBadge = showSeason && entry.season
        ? `<span class="records-season${entry.season === CURRENT_SEASON ? ' records-season--current' : ''}">${formatSeason(entry.season)}</span>`
        : '';

    const photoEl = entry.headshot
        ? `<img src="${entry.headshot}" alt="" class="records-big-photo${isCurrent ? '' : ' records-big-photo--former'}">`
        : `<span class="records-big-photo records-big-photo--placeholder"></span>`;

    const nameClass = isCurrent ? 'records-big-name' : 'records-big-name records-big-name--former';
    const rowClass  = isCurrent
        ? 'records-big-row player-hoverable'
        : 'records-big-row records-big-row--former';
    const interactAttrs = isCurrent
        ? `tabindex="0" role="button" aria-label="View ${entry.name} stats" data-player-id="${entry.playerId}"`
        : '';

    return `
        <div class="${rowClass}" ${interactAttrs}>
            <span class="records-big-rank">${rank}</span>
            <div class="records-big-player">
                ${photoEl}
                <span class="${nameClass}">${entry.name}${seasonBadge}</span>
            </div>
            <span class="records-big-stat">${entry.value}</span>
        </div>`;
}

function renderTable() {
    const { entries, showSeason } = getEntries();
    const tableEl = document.getElementById('records-table');
    const labelEl = document.getElementById('records-table-label');
    if (!tableEl || !labelEl) return;

    labelEl.textContent = tableLabel();

    if (!entries || entries.length === 0) {
        tableEl.innerHTML = '<div class="records-empty">No data available for this selection.</div>';
        return;
    }

    tableEl.innerHTML = entries.slice(0, DISPLAY_LIMIT).map((entry, i) =>
        renderRow(entry, i + 1, showSeason)
    ).join('');

    // Re-attach player card click handlers
    tableEl.querySelectorAll('[data-player-id]').forEach(el => {
        el.addEventListener('click', () => {
            const event = new CustomEvent('show-player-card', { detail: { playerId: Number(el.dataset.playerId) }, bubbles: true });
            el.dispatchEvent(event);
        });
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') el.click();
        });
    });
}

// ─── Selector state enforcement ───────────────────────────────────────────────

function applyConstraints() {
    // Wins → force goalies
    if (statMode === 'wins') posMode = 'goalies';
    // gamesPlayed → force all-time
    if (statMode === 'gamesPlayed') timeMode = 'alltime';
    // Shootout → can't be goalies
    if (statMode === 'shootout' && posMode === 'goalies') posMode = 'all';
    // Goalies → shootout not valid
    if (posMode === 'goalies' && statMode === 'shootout') statMode = 'goals';
}

function updateSelectorUI() {
    // Time buttons — Season disabled when gamesPlayed selected
    document.querySelectorAll('[data-time]').forEach(btn => {
        const t = btn.dataset.time;
        btn.disabled = (t === 'season' && statMode === 'gamesPlayed');
        btn.classList.toggle('active', t === timeMode);
    });

    // Stat buttons — only shootout is disabled for goalies
    document.querySelectorAll('[data-stat]').forEach(btn => {
        const s = btn.dataset.stat;
        btn.disabled = (s === 'shootout' && posMode === 'goalies');
        btn.classList.toggle('active', s === statMode);
    });

    // Position buttons — disable/enable based on constraints
    document.querySelectorAll('[data-pos]').forEach(btn => {
        const p = btn.dataset.pos;
        let disabled = false;
        if (statMode === 'wins' && p !== 'goalies') disabled = true;
        if (statMode === 'shootout' && p === 'goalies') disabled = true;
        btn.disabled = disabled;
        btn.classList.toggle('active', p === posMode);
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function init() {
    const container = document.getElementById('stats-team-records-view');
    container.innerHTML = '<div class="loading">Loading franchise records...</div>';

    try {
        const [data, wildStats] = await Promise.all([getMilestones(), getWildStats()]);
        milestones = data;
        currentSet = new Set([
            ...(wildStats.skaters || []).map(p => p.playerId),
            ...(wildStats.goalies  || []).map(p => p.playerId),
        ]);

        container.innerHTML = `
            <div class="records-layout">
                <div class="records-selectors">
                    <div class="records-selector-group">
                        <span class="records-selector-label">Time</span>
                        <div class="records-selector-btns">
                            <button class="division-toggle active" data-time="alltime">All-Time</button>
                            <button class="division-toggle" data-time="season">Season</button>
                        </div>
                    </div>
                    <div class="records-selector-group">
                        <span class="records-selector-label">Stat</span>
                        <div class="records-selector-btns">
                            <button class="division-toggle active" data-stat="goals">Goals</button>
                            <button class="division-toggle" data-stat="assists">Assists</button>
                            <button class="division-toggle" data-stat="points">Points</button>
                            <button class="division-toggle" data-stat="shootout">Shootout</button>
                            <button class="division-toggle" data-stat="wins">Wins</button>
                            <button class="division-toggle" data-stat="penaltyMinutes">Penalty Min</button>
                            <button class="division-toggle" data-stat="gamesPlayed">Games Played</button>
                        </div>
                    </div>
                    <div class="records-selector-group">
                        <span class="records-selector-label">Position</span>
                        <div class="records-selector-btns">
                            <button class="division-toggle active" data-pos="all">All Skaters</button>
                            <button class="division-toggle" data-pos="forwards">Forwards</button>
                            <button class="division-toggle" data-pos="defense">Defense</button>
                            <button class="division-toggle" data-pos="goalies">Goalies</button>
                        </div>
                    </div>
                </div>
                <div class="records-table-wrap">
                    <div class="records-table-header" id="records-table-label">All-Time Goals</div>
                    <div class="records-big-list" id="records-table"></div>
                </div>
            </div>`;

        // Wire up selector events
        container.addEventListener('click', e => {
            const btn = e.target.closest('[data-time],[data-stat],[data-pos]');
            if (!btn || btn.disabled) return;

            if (btn.dataset.time) timeMode = btn.dataset.time;
            if (btn.dataset.stat) statMode = btn.dataset.stat;
            if (btn.dataset.pos)  posMode  = btn.dataset.pos;

            applyConstraints();
            updateSelectorUI();
            renderTable();
        });

        renderTable();

    } catch (err) {
        console.error('Error loading team records:', err);
        container.innerHTML = '<div class="loading">Error loading franchise records.</div>';
    }
}
