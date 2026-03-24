// Stats view module
import { getWildStats, getLeagueLeaders, getH2HData } from '../api.js';
import { getUIState, setUIState } from '../state.js';
import { trackTableSort } from '../analytics.js';
import { NHL_TEAMS, teamBySlug } from '../teams.js';

let wildStats = null;
let h2hOutsideClickHandler = null;

function formatTimeOnIce(seconds) {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function init(subView = 'player') {
    updateSubViewButtons(subView);
    showSubView(subView);

    if (subView === 'player') {
        try {
            [wildStats] = await Promise.all([
                getWildStats(),
                getLeagueLeaders()
            ]);
            renderSkaters();
            renderGoalies();
        } catch (error) {
            console.error('Error loading stats:', error);
            document.getElementById('skaters-table').innerHTML = '<div class="loading">Error loading stats.</div>';
            document.getElementById('goalies-table').innerHTML = '<div class="loading">Error loading stats.</div>';
        }
    } else if (subView === 'head-to-head') {
        initHeadToHead();
    }
}

function updateSubViewButtons(subView) {
    document.querySelectorAll('#stats-view .view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === subView);
    });
}

function showSubView(subView) {
    document.getElementById('stats-player-view').style.display = subView === 'player' ? '' : 'none';
    document.getElementById('stats-head-to-head-view').style.display = subView === 'head-to-head' ? '' : 'none';
}

function initHeadToHead() {
    const pathMatch = window.location.pathname.match(/^\/stats\/head-to-head\/(.+)$/);
    const slug = pathMatch ? pathMatch[1] : null;
    const team = slug ? teamBySlug(slug) : NHL_TEAMS[0];

    if (!slug) {
        history.replaceState({}, '', `/stats/head-to-head/${team.slug}`);
    }

    renderH2HContent(team);
}

function renderH2HContent(team) {
    if (h2hOutsideClickHandler) {
        document.removeEventListener('click', h2hOutsideClickHandler);
        h2hOutsideClickHandler = null;
    }

    const container = document.getElementById('h2h-content');
    container.innerHTML = `
        <h2 class="sr-only">Minnesota Wild vs ${team.name} Head-to-Head Stats</h2>
        <div class="h2h-picker">
            <button class="h2h-picker-trigger" id="h2h-picker-trigger" aria-haspopup="listbox" aria-expanded="false">
                <img src="/logos/${team.abbrev}_dark.svg" alt="${team.name}" class="h2h-picker-logo">
                <span>${team.name}</span>
                <svg class="h2h-picker-arrow" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
                    <path d="M0 0l5 6 5-6z" fill="currentColor"/>
                </svg>
            </button>
            <ul class="h2h-picker-dropdown" id="h2h-picker-dropdown" role="listbox" aria-label="Select opponent team">
                ${NHL_TEAMS.map(t => `
                    <li role="option" aria-selected="${t.slug === team.slug}">
                        <a href="/stats/head-to-head/${t.slug}" data-link class="h2h-team-option${t.slug === team.slug ? ' selected' : ''}">
                            <img src="/logos/${t.abbrev}_dark.svg" alt="" class="h2h-picker-logo">
                            <span>${t.name}</span>
                        </a>
                    </li>
                `).join('')}
            </ul>
        </div>
        <div id="h2h-matchup">
            <div class="loading">Loading matchup data…</div>
        </div>
    `;

    const trigger = document.getElementById('h2h-picker-trigger');
    const dropdown = document.getElementById('h2h-picker-dropdown');

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('open');
        trigger.setAttribute('aria-expanded', String(isOpen));
    });

    h2hOutsideClickHandler = (e) => {
        if (!e.target.closest('.h2h-picker')) {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        }
    };
    document.addEventListener('click', h2hOutsideClickHandler);

    loadH2HMatchup(team);
}

// ─── H2H Data Loading ─────────────────────────────────────────────────────────

async function loadH2HMatchup(team) {
    const el = document.getElementById('h2h-matchup');
    if (!el) return;
    try {
        const data = await getH2HData(team.abbrev);
        el.innerHTML = buildH2HMatchup(team, data);
    } catch {
        el.innerHTML = '<div class="loading">Failed to load head-to-head data. Please try again.</div>';
    }
}

// ─── H2H Rendering ───────────────────────────────────────────────────────────

function buildH2HMatchup(team, data) {
    const sections = [
        { title: 'THIS SEASON',    agg: data.thisSeason   },
        { title: 'LAST SEASON',    agg: data.lastSeason   },
        { title: 'LAST 5 SEASONS', agg: data.last5Seasons },
        { title: 'ALL TIME',       agg: data.allTime      },
    ].filter(s => s.agg && s.agg.gamesPlayed > 0);

    return `
        <div class="h2h-matchup-header">
            <div class="h2h-matchup-team h2h-matchup-opp">
                <img src="/logos/${team.abbrev}_dark.svg" alt="${team.name}" class="h2h-matchup-logo">
                <span class="h2h-matchup-name">${team.name}</span>
            </div>
            <div class="h2h-matchup-vs">VS</div>
            <div class="h2h-matchup-team h2h-matchup-wild">
                <img src="/logos/MIN_dark.svg" alt="Minnesota Wild" class="h2h-matchup-logo">
                <span class="h2h-matchup-name">Minnesota Wild</span>
            </div>
        </div>
        ${sections.map(s => buildH2HTable(s.title, s.agg, team)).join('')}
        ${sections.length === 0 ? '<div class="loading">No games found between these teams.</div>' : ''}
    `;
}

// ─── Table builder ────────────────────────────────────────────────────────────

function buildH2HTable(title, agg, team) {
    if (!agg || agg.gamesPlayed === 0) return '';

    const { min, opp, gamesPlayed } = agg;
    const hasDetailedStats = min.statsGamesCount > 0;
    const isAllTime = title === 'ALL TIME';
    const na = '--';

    // Helpers
    const rec   = (s) => `${s.wins}-${s.regLosses}-${s.otLosses}`;
    const otRec = (s) => `${s.otWins}-${s.otGameLosses}`;
    const soRec = (s) => `${s.soWins}-${s.soLosses}`;

    const avgGp = (total, gp) =>
        gp > 0 ? `<span class="h2h-sub">${(total / gp).toFixed(1)}/gm</span>` : '';

    const goals = (s) =>
        `${s.goalsFor} ${avgGp(s.goalsFor, gamesPlayed)}`;

    const statVal = (s, field) => {
        if (!hasDetailedStats || s[field] == null) return na;
        return `${s[field]} ${avgGp(s[field], s.statsGamesCount)}`;
    };

    const ppVal = (s) => {
        if (!hasDetailedStats || s.ppGoals == null || s.ppOpportunities == null) return na;
        const pct = s.ppOpportunities > 0
            ? ((s.ppGoals / s.ppOpportunities) * 100).toFixed(1)
            : '0.0';
        return `${s.ppGoals}/${s.ppOpportunities} <span class="h2h-sub">${pct}%</span>`;
    };

    const foVal = (s) => {
        if (!hasDetailedStats || s.faceoffWins == null || !s.faceoffTotal) return na;
        const pct = ((s.faceoffWins / s.faceoffTotal) * 100).toFixed(1);
        return `${s.faceoffWins}/${s.faceoffTotal} <span class="h2h-sub">${pct}%</span>`;
    };

    const row = (oppVal, label, minVal) => `
        <tr>
            <td class="h2h-opp-val">${oppVal}</td>
            <td class="h2h-cat">${label}</td>
            <td class="h2h-min-val">${minVal}</td>
        </tr>`;

    const otGames = min.otWins + min.otGameLosses;
    const soGames = min.soWins + min.soLosses;

    return `
        <div class="h2h-section">
            <h2 class="h2h-section-title">${title}</h2>
            <div class="stats-table-container">
                <table class="h2h-table">
                    <tbody>
                        ${row(rec(opp),  'RECORD', rec(min))}
                        ${otGames > 0 ? row(otRec(opp), 'OVERTIME', otRec(min)) : ''}
                        ${soGames > 0 ? row(soRec(opp), 'SHOOTOUT', soRec(min)) : ''}
                        <tr class="h2h-divider"><td colspan="3"></td></tr>
                        ${row(goals(opp), 'GOALS', goals(min))}
                        ${!isAllTime ? row(statVal(opp, 'sog'),          'SHOTS ON GOAL',  statVal(min, 'sog'))          : ''}
                        ${!isAllTime ? row(ppVal(opp),                   'POWER PLAY',     ppVal(min))                   : ''}
                        ${!isAllTime ? row(foVal(opp),                   'FACEOFFS',       foVal(min))                   : ''}
                        ${!isAllTime ? row(statVal(opp, 'hits'),         'HITS',           statVal(min, 'hits'))         : ''}
                        ${!isAllTime ? row(statVal(opp, 'pim'),          'PENALTY MINUTES',statVal(min, 'pim'))          : ''}
                        ${!isAllTime ? row(statVal(opp, 'blockedShots'), 'BLOCKED SHOTS',  statVal(min, 'blockedShots')) : ''}
                        ${!isAllTime ? row(statVal(opp, 'giveaways'),    'GIVEAWAYS',      statVal(min, 'giveaways'))    : ''}
                        ${!isAllTime ? row(statVal(opp, 'takeaways'),    'TAKEAWAYS',      statVal(min, 'takeaways'))    : ''}
                    </tbody>
                </table>
                ${!isAllTime && !hasDetailedStats ? `<div class="h2h-no-stats-note">Detailed game stats unavailable for this period</div>` : ''}
            </div>
        </div>
    `;
}

export function render() {
    // Re-render with current state
    renderSkaters();
    renderGoalies();
}

export function cleanup() {
    // Clean up event listeners if needed
}

function setupSkaterSortListeners() {
    document.querySelectorAll('#skaters-table .sortable').forEach(header => {
        header.addEventListener('click', (e) => {
            const field = e.target.dataset.sort;
            const state = getUIState('stats');

            if (state.skaterSort === field) {
                state.skaterSortDirection = state.skaterSortDirection === 'desc' ? 'asc' : 'desc';
            } else {
                state.skaterSort = field;
                state.skaterSortDirection = 'desc';
            }

            trackTableSort('skaters', field);
            setUIState('stats', state);
            renderSkaters();
        });
    });
}

function setupGoalieSortListeners() {
    document.querySelectorAll('#goalies-table .sortable').forEach(header => {
        header.addEventListener('click', (e) => {
            const field = e.target.dataset.sort;
            const state = getUIState('stats');

            if (state.goalieSort === field) {
                state.goalieSortDirection = state.goalieSortDirection === 'desc' ? 'asc' : 'desc';
            } else {
                state.goalieSort = field;
                state.goalieSortDirection = field === 'goalsAgainstAverage' ? 'asc' : 'desc';
            }

            trackTableSort('goalies', field);
            setUIState('stats', state);
            renderGoalies();
        });
    });
}

function getSkaterBestValues(skaters) {
    const best = {};
    const fields = ['goals', 'assists', 'points', 'plusMinus', 'powerPlayGoals', 'shorthandedGoals', 'shots', 'shootingPctg', 'faceoffWinPctg', 'avgTimeOnIcePerGame'];

    fields.forEach(field => {
        const values = skaters
            .map(p => p[field])
            .filter(v => v != null && v > 0);
        if (values.length > 0) {
            best[field] = Math.max(...values);
        }
    });

    // Points per game (calculated field)
    const ppgValues = skaters
        .filter(p => p.gamesPlayed > 0)
        .map(p => p.points / p.gamesPlayed);
    if (ppgValues.length > 0) {
        best.pointsPerGame = Math.max(...ppgValues);
    }

    return best;
}

function renderSkaters() {
    const state = getUIState('stats');
    const skaters = [...wildStats.skaters].sort((a, b) => {
        let aVal = a[state.skaterSort];
        let bVal = b[state.skaterSort];

        // Calculate points per game if sorting by that field
        if (state.skaterSort === 'pointsPerGame') {
            aVal = a.gamesPlayed > 0 ? a.points / a.gamesPlayed : 0;
            bVal = b.gamesPlayed > 0 ? b.points / b.gamesPlayed : 0;
        }

        return state.skaterSortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });

    const best = getSkaterBestValues(wildStats.skaters);

    const isBest = (value, field) => value != null && value > 0 && best[field] > 0 && value === best[field] ? 'stat-best' : '';
    const isPPGBest = (player) => {
        if (player.gamesPlayed === 0) return '';
        const ppg = player.points / player.gamesPlayed;
        return best.pointsPerGame && Math.abs(ppg - best.pointsPerGame) < 0.001 ? 'stat-best' : '';
    };

    const getSortIcon = (field) => {
        if (state.skaterSort !== field) return '<span class="sort-arrow"> </span>';
        const arrow = state.skaterSortDirection === 'desc' ? '↓' : '↑';
        return `<span class="sort-arrow">${arrow}</span>`;
    };

    const table = `
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th class="center" data-tooltip="Position" aria-label="Position">POS</th>
                    <th class="center sortable ${state.skaterSort === 'gamesPlayed' ? 'sorted' : ''}" data-sort="gamesPlayed" data-tooltip="Games Played" aria-label="Games Played">GP${getSortIcon('gamesPlayed')}</th>
                    <th class="center sortable ${state.skaterSort === 'goals' ? 'sorted' : ''}" data-sort="goals" data-tooltip="Goals" aria-label="Goals">G${getSortIcon('goals')}</th>
                    <th class="center sortable ${state.skaterSort === 'assists' ? 'sorted' : ''}" data-sort="assists" data-tooltip="Assists" aria-label="Assists">A${getSortIcon('assists')}</th>
                    <th class="center sortable ${state.skaterSort === 'points' ? 'sorted' : ''}" data-sort="points" data-tooltip="Points" aria-label="Points">PTS${getSortIcon('points')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'pointsPerGame' ? 'sorted' : ''}" data-sort="pointsPerGame" data-tooltip="Average Points Per Game" aria-label="Average Points Per Game">P/G${getSortIcon('pointsPerGame')}</th>
                    <th class="center sortable ${state.skaterSort === 'plusMinus' ? 'sorted' : ''}" data-sort="plusMinus" data-tooltip="Plus/Minus" aria-label="Plus/Minus">+/-${getSortIcon('plusMinus')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'powerPlayGoals' ? 'sorted' : ''}" data-sort="powerPlayGoals" data-tooltip="Power Play Goals" aria-label="Power Play Goals">PPG${getSortIcon('powerPlayGoals')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'shorthandedGoals' ? 'sorted' : ''}" data-sort="shorthandedGoals" data-tooltip="Shorthanded Goals" aria-label="Shorthanded Goals">SHG${getSortIcon('shorthandedGoals')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'shots' ? 'sorted' : ''}" data-sort="shots" data-tooltip="Shots on Goal" aria-label="Shots on Goal">SOG${getSortIcon('shots')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'shootingPctg' ? 'sorted' : ''}" data-sort="shootingPctg" data-tooltip="Shooting Percentage" aria-label="Shooting Percentage">S%${getSortIcon('shootingPctg')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'faceoffWinPctg' ? 'sorted' : ''}" data-sort="faceoffWinPctg" data-tooltip="Faceoff Win Percentage" aria-label="Faceoff Win Percentage">FOW%${getSortIcon('faceoffWinPctg')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'avgTimeOnIcePerGame' ? 'sorted' : ''}" data-sort="avgTimeOnIcePerGame" data-tooltip="Time on Ice per Game" aria-label="Time on Ice per Game">TOI/G${getSortIcon('avgTimeOnIcePerGame')}</th>
                </tr>
            </thead>
            <tbody>
                ${skaters.map((player, index) => `
                    <tr class="player-hoverable" tabindex="0" role="button" aria-label="View ${player.firstName.default} ${player.lastName.default} stats" data-player-id="${player.playerId}">
                        <td class="player-name">
                            <img src="${player.headshot}" alt="" class="player-photo-small">
                            <span class="player-full-name">${player.firstName.default} ${player.lastName.default}</span>
                            <span class="player-abbrev-text">${player.firstName.default.charAt(0)}. ${player.lastName.default}</span>
                        </td>
                        <td class="center">${player.positionCode}</td>
                        <td class="center">${player.gamesPlayed}</td>
                        <td class="center ${isBest(player.goals, 'goals')}">${player.goals}</td>
                        <td class="center ${isBest(player.assists, 'assists')}">${player.assists}</td>
                        <td class="center ${isBest(player.points, 'points')}"><strong>${player.points}</strong></td>
                        <td class="center hide-mobile ${isPPGBest(player)}">${player.gamesPlayed > 0 ? (player.points / player.gamesPlayed).toFixed(2) : '0.00'}</td>
                        <td class="center ${isBest(player.plusMinus, 'plusMinus')}">${player.plusMinus > 0 ? '+' : ''}${player.plusMinus ?? '--'}</td>
                        <td class="center hide-mobile ${isBest(player.powerPlayGoals, 'powerPlayGoals')}">${player.powerPlayGoals ?? '--'}</td>
                        <td class="center hide-mobile ${isBest(player.shorthandedGoals, 'shorthandedGoals')}">${player.shorthandedGoals ?? '--'}</td>
                        <td class="center hide-mobile ${isBest(player.shots, 'shots')}">${player.shots ?? '--'}</td>
                        <td class="center hide-mobile ${isBest(player.shootingPctg, 'shootingPctg')}">${player.shootingPctg != null ? (player.shootingPctg * 100).toFixed(1) : '--'}</td>
                        <td class="center hide-mobile ${isBest(player.faceoffWinPctg, 'faceoffWinPctg')}">${player.faceoffWinPctg != null && player.faceoffWinPctg > 0 ? (player.faceoffWinPctg * 100).toFixed(1) : '--'}</td>
                        <td class="center hide-mobile ${isBest(player.avgTimeOnIcePerGame, 'avgTimeOnIcePerGame')}">${player.avgTimeOnIcePerGame ? formatTimeOnIce(player.avgTimeOnIcePerGame) : '--'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('skaters-table').innerHTML = table;
    setupSkaterSortListeners();
}

function getGoalieBestValues(goalies) {
    const best = {};
    // Fields where highest is best (only SV% and SO)
    const highestFields = ['savePercentage', 'shutouts'];
    // Fields where lowest is best (only GAA)
    const lowestFields = ['goalsAgainstAverage'];

    highestFields.forEach(field => {
        const values = goalies
            .map(p => p[field])
            .filter(v => v != null && v > 0);
        if (values.length > 0) {
            best[field] = { value: Math.max(...values), type: 'max' };
        }
    });

    lowestFields.forEach(field => {
        const values = goalies
            .map(p => p[field])
            .filter(v => v != null && v > 0);
        if (values.length > 0) {
            best[field] = { value: Math.min(...values), type: 'min' };
        }
    });

    return best;
}

function renderGoalies() {
    const state = getUIState('stats');
    const goalies = [...wildStats.goalies].sort((a, b) => {
        const aVal = a[state.goalieSort] || 0;
        const bVal = b[state.goalieSort] || 0;
        return state.goalieSortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });

    const best = getGoalieBestValues(wildStats.goalies);

    const isBest = (value, field) => {
        if (value == null || !best[field]) return '';
        const bestInfo = best[field];
        if (bestInfo.type === 'min') {
            return value > 0 && value === bestInfo.value ? 'stat-best' : '';
        }
        return value > 0 && value === bestInfo.value ? 'stat-best' : '';
    };

    const getSortIcon = (field) => {
        if (state.goalieSort !== field) return '<span class="sort-arrow"> </span>';
        const arrow = state.goalieSortDirection === 'desc' ? '↓' : '↑';
        return `<span class="sort-arrow">${arrow}</span>`;
    };

    const table = `
        <table>
            <thead>
                <tr>
                    <th>Player</th>
                    <th class="center sortable ${state.goalieSort === 'gamesPlayed' ? 'sorted' : ''}" data-sort="gamesPlayed" data-tooltip="Games Played" aria-label="Games Played">GP${getSortIcon('gamesPlayed')}</th>
                    <th class="center sortable ${state.goalieSort === 'gamesStarted' ? 'sorted' : ''}" data-sort="gamesStarted" data-tooltip="Games Started" aria-label="Games Started">GS${getSortIcon('gamesStarted')}</th>
                    <th class="center sortable ${state.goalieSort === 'wins' ? 'sorted' : ''}" data-sort="wins" data-tooltip="Wins" aria-label="Wins">W${getSortIcon('wins')}</th>
                    <th class="center sortable ${state.goalieSort === 'losses' ? 'sorted' : ''}" data-sort="losses" data-tooltip="Losses" aria-label="Losses">L${getSortIcon('losses')}</th>
                    <th class="center sortable ${state.goalieSort === 'goalsAgainstAverage' ? 'sorted' : ''}" data-sort="goalsAgainstAverage" data-tooltip="Goals Against Average" aria-label="Goals Against Average">GAA${getSortIcon('goalsAgainstAverage')}</th>
                    <th class="center sortable ${state.goalieSort === 'savePercentage' ? 'sorted' : ''}" data-sort="savePercentage" data-tooltip="Save Percentage" aria-label="Save Percentage">SV%${getSortIcon('savePercentage')}</th>
                    <th class="center hide-mobile" data-tooltip="Shots Against" aria-label="Shots Against">SA</th>
                    <th class="center hide-mobile" data-tooltip="Saves" aria-label="Saves">SVS</th>
                    <th class="center hide-mobile" data-tooltip="Goals Against" aria-label="Goals Against">GA</th>
                    <th class="center hide-mobile" data-tooltip="Shutouts" aria-label="Shutouts">SO</th>
                </tr>
            </thead>
            <tbody>
                ${goalies.map((player, index) => `
                    <tr class="player-hoverable" tabindex="0" role="button" aria-label="View ${player.firstName.default} ${player.lastName.default} stats" data-player-id="${player.playerId}">
                        <td class="player-name">
                            <img src="${player.headshot}" alt="" class="player-photo-small">
                            <span class="player-full-name">${player.firstName.default} ${player.lastName.default}</span>
                            <span class="player-abbrev-text">${player.firstName.default.charAt(0)}. ${player.lastName.default}</span>
                        </td>
                        <td class="center">${player.gamesPlayed ?? '--'}</td>
                        <td class="center">${player.gamesStarted ?? '--'}</td>
                        <td class="center">${player.wins ?? '--'}</td>
                        <td class="center">${player.losses ?? '--'}</td>
                        <td class="center ${isBest(player.goalsAgainstAverage, 'goalsAgainstAverage')}"><strong>${player.goalsAgainstAverage != null ? player.goalsAgainstAverage.toFixed(2) : '--'}</strong></td>
                        <td class="center ${isBest(player.savePercentage, 'savePercentage')}"><strong>${player.savePercentage != null ? player.savePercentage.toFixed(3) : '--'}</strong></td>
                        <td class="center hide-mobile">${player.shotsAgainst ?? '--'}</td>
                        <td class="center hide-mobile">${player.saves ?? '--'}</td>
                        <td class="center hide-mobile">${player.goalsAgainst ?? '--'}</td>
                        <td class="center hide-mobile ${isBest(player.shutouts, 'shutouts')}">${player.shutouts ?? '--'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('goalies-table').innerHTML = table;
    setupGoalieSortListeners();
}
