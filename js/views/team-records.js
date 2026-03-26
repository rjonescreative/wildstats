// Team Records view module — Wild all-time franchise leaders
import { getMilestones, getWildStats } from '../api.js';

function currentSeasonId() {
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}${year + 1}`;
}

const CURRENT_SEASON = currentSeasonId();

function formatSeason(s) {
    return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
}

function shortName(fullName) {
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName;
    return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function createRow(entry, rank, isCurrent, showSeason = false) {
    const name = shortName(entry.name);
    const isCurrentSeason = showSeason && entry.season && entry.season === CURRENT_SEASON;
    const seasonBadge = showSeason && entry.season
        ? `<span class="records-season${isCurrentSeason ? ' records-season--current' : ''}">${formatSeason(entry.season)}</span>`
        : '';

    if (isCurrent) {
        return `
            <div class="leader-row player-hoverable" tabindex="0" role="button"
                 aria-label="View ${entry.name} stats" data-player-id="${entry.playerId}">
                <span class="leader-rank">${rank}</span>
                <div class="leader-player">
                    ${entry.headshot ? `<img src="${entry.headshot}" alt="" class="player-photo-small">` : ''}
                    <span class="leader-name">${name}${seasonBadge}</span>
                </div>
                <span class="leader-stat">${entry.value}</span>
            </div>`;
    }

    return `
        <div class="leader-row leader-row--former">
            <span class="leader-rank">${rank}</span>
            <div class="leader-player">
                ${entry.headshot ? `<img src="${entry.headshot}" alt="" class="player-photo-small player-photo-greyed">` : ''}
                <span class="leader-name leader-name--former">${name}${seasonBadge}</span>
            </div>
            <span class="leader-stat">${entry.value}</span>
        </div>`;
}

function createCard(entries, label, currentSet, showSeason = false, limit = 10) {
    const rows = entries.slice(0, limit).map((entry, i) =>
        createRow(entry, i + 1, currentSet.has(entry.playerId), showSeason)
    ).join('');

    return `
        <div class="stat-leader-card">
            <div class="stat-category">${label}</div>
            <div class="leader-list">${rows}</div>
        </div>`;
}

export async function init() {
    const container = document.getElementById('stats-team-records-view');
    container.innerHTML = '<div class="loading">Loading franchise records...</div>';

    try {
        const [milestones, wildStats] = await Promise.all([getMilestones(), getWildStats()]);

        const currentSet = new Set([
            ...(wildStats.skaters || []).map(p => p.playerId),
            ...(wildStats.goalies  || []).map(p => p.playerId),
        ]);

        const { skaters, goalies } = milestones;

        container.innerHTML = `
            <div class="stat-leaders-grid">
                ${createCard(skaters.careerLeaders.goals,         'All-Time Goals',          currentSet)}
                ${createCard(skaters.careerLeaders.assists,       'All-Time Assists',        currentSet)}
                ${createCard(skaters.careerLeaders.points,        'All-Time Points',         currentSet)}
                ${createCard(skaters.singleSeasonRecords.goals,   'Goals in a Season',       currentSet, true)}
                ${createCard(skaters.singleSeasonRecords.assists, 'Assists in a Season',     currentSet, true)}
                ${createCard(skaters.singleSeasonRecords.points,  'Points in a Season',      currentSet, true)}
                ${createCard(skaters.careerLeaders.gamesPlayed,   'Games Played',            currentSet)}
                ${createCard(skaters.careerLeaders.penaltyMinutes,'Penalty Minutes',         currentSet)}
                ${createCard(goalies.careerLeaders.wins,          'Goalie Wins',             currentSet)}
            </div>`;
    } catch (err) {
        console.error('Error loading team records:', err);
        container.innerHTML = '<div class="loading">Error loading franchise records.</div>';
    }
}
