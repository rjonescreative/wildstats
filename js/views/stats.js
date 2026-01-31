// Stats view module
import { getWildStats, getLeagueLeaders } from '../api.js';
import { getUIState, setUIState } from '../state.js';

let wildStats = null;

function formatTimeOnIce(seconds) {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function init() {
    try {
        // Fetch wild stats and league leaders (cached if available)
        [wildStats] = await Promise.all([
            getWildStats(),
            getLeagueLeaders()
        ]);

        // Render both tables
        renderSkaters();
        renderGoalies();
    } catch (error) {
        console.error('Error loading stats:', error);
        document.getElementById('skaters-table').innerHTML = '<div class="loading">Error loading stats.</div>';
        document.getElementById('goalies-table').innerHTML = '<div class="loading">Error loading stats.</div>';
    }
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

            setUIState('stats', state);
            renderGoalies();
        });
    });
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
                    <th class="center" data-tooltip="Position">POS</th>
                    <th class="center sortable ${state.skaterSort === 'gamesPlayed' ? 'sorted' : ''}" data-sort="gamesPlayed" data-tooltip="Games Played">GP${getSortIcon('gamesPlayed')}</th>
                    <th class="center sortable ${state.skaterSort === 'goals' ? 'sorted' : ''}" data-sort="goals" data-tooltip="Goals">G${getSortIcon('goals')}</th>
                    <th class="center sortable ${state.skaterSort === 'assists' ? 'sorted' : ''}" data-sort="assists" data-tooltip="Assists">A${getSortIcon('assists')}</th>
                    <th class="center sortable ${state.skaterSort === 'points' ? 'sorted' : ''}" data-sort="points" data-tooltip="Points">PTS${getSortIcon('points')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'pointsPerGame' ? 'sorted' : ''}" data-sort="pointsPerGame" data-tooltip="Average Points Per Game">P/G${getSortIcon('pointsPerGame')}</th>
                    <th class="center sortable ${state.skaterSort === 'plusMinus' ? 'sorted' : ''}" data-sort="plusMinus" data-tooltip="Plus/Minus">+/-${getSortIcon('plusMinus')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'powerPlayGoals' ? 'sorted' : ''}" data-sort="powerPlayGoals" data-tooltip="Power Play Goals">PPG${getSortIcon('powerPlayGoals')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'shorthandedGoals' ? 'sorted' : ''}" data-sort="shorthandedGoals" data-tooltip="Shorthanded Goals">SHG${getSortIcon('shorthandedGoals')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'shots' ? 'sorted' : ''}" data-sort="shots" data-tooltip="Shots on Goal">SOG${getSortIcon('shots')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'shootingPctg' ? 'sorted' : ''}" data-sort="shootingPctg" data-tooltip="Shooting Percentage">S%${getSortIcon('shootingPctg')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'faceoffWinPctg' ? 'sorted' : ''}" data-sort="faceoffWinPctg" data-tooltip="Faceoff Win Percentage">FOW%${getSortIcon('faceoffWinPctg')}</th>
                    <th class="center hide-mobile sortable ${state.skaterSort === 'avgTimeOnIcePerGame' ? 'sorted' : ''}" data-sort="avgTimeOnIcePerGame" data-tooltip="Time on Ice per Game">TOI/G${getSortIcon('avgTimeOnIcePerGame')}</th>
                </tr>
            </thead>
            <tbody>
                ${skaters.map((player, index) => `
                    <tr class="player-hoverable" data-player-id="${player.playerId}">
                        <td class="player-name">
                            <img src="${player.headshot}" alt="${player.firstName.default} ${player.lastName.default}" class="player-photo-small">
                            <span class="player-full-name">${player.firstName.default} ${player.lastName.default}</span>
                            <span class="player-abbrev-text">${player.firstName.default.charAt(0)}. ${player.lastName.default}</span>
                        </td>
                        <td class="center">${player.positionCode}</td>
                        <td class="center">${player.gamesPlayed}</td>
                        <td class="center">${player.goals}</td>
                        <td class="center">${player.assists}</td>
                        <td class="center"><strong>${player.points}</strong></td>
                        <td class="center hide-mobile">${player.gamesPlayed > 0 ? (player.points / player.gamesPlayed).toFixed(2) : '0.00'}</td>
                        <td class="center">${player.plusMinus > 0 ? '+' : ''}${player.plusMinus ?? '--'}</td>
                        <td class="center hide-mobile">${player.powerPlayGoals ?? '--'}</td>
                        <td class="center hide-mobile">${player.shorthandedGoals ?? '--'}</td>
                        <td class="center hide-mobile">${player.shots ?? '--'}</td>
                        <td class="center hide-mobile">${player.shootingPctg != null ? (player.shootingPctg * 100).toFixed(1) : '--'}</td>
                        <td class="center hide-mobile">${player.faceoffWinPctg != null && player.faceoffWinPctg > 0 ? (player.faceoffWinPctg * 100).toFixed(1) : '--'}</td>
                        <td class="center hide-mobile">${player.avgTimeOnIcePerGame ? formatTimeOnIce(player.avgTimeOnIcePerGame) : '--'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('skaters-table').innerHTML = table;
    setupSkaterSortListeners();
}

function renderGoalies() {
    const state = getUIState('stats');
    const goalies = [...wildStats.goalies].sort((a, b) => {
        const aVal = a[state.goalieSort] || 0;
        const bVal = b[state.goalieSort] || 0;
        return state.goalieSortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });

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
                    <th class="center sortable ${state.goalieSort === 'gamesPlayed' ? 'sorted' : ''}" data-sort="gamesPlayed" data-tooltip="Games Played">GP${getSortIcon('gamesPlayed')}</th>
                    <th class="center sortable ${state.goalieSort === 'gamesStarted' ? 'sorted' : ''}" data-sort="gamesStarted" data-tooltip="Games Started">GS${getSortIcon('gamesStarted')}</th>
                    <th class="center sortable ${state.goalieSort === 'wins' ? 'sorted' : ''}" data-sort="wins" data-tooltip="Wins">W${getSortIcon('wins')}</th>
                    <th class="center sortable ${state.goalieSort === 'losses' ? 'sorted' : ''}" data-sort="losses" data-tooltip="Losses">L${getSortIcon('losses')}</th>
                    <th class="center sortable ${state.goalieSort === 'goalsAgainstAverage' ? 'sorted' : ''}" data-sort="goalsAgainstAverage" data-tooltip="Goals Against Average">GAA${getSortIcon('goalsAgainstAverage')}</th>
                    <th class="center sortable ${state.goalieSort === 'savePercentage' ? 'sorted' : ''}" data-sort="savePercentage" data-tooltip="Save Percentage">SV%${getSortIcon('savePercentage')}</th>
                    <th class="center hide-mobile" data-tooltip="Shots Against">SA</th>
                    <th class="center hide-mobile" data-tooltip="Saves">SVS</th>
                    <th class="center hide-mobile" data-tooltip="Goals Against">GA</th>
                    <th class="center hide-mobile" data-tooltip="Shutouts">SO</th>
                </tr>
            </thead>
            <tbody>
                ${goalies.map((player, index) => `
                    <tr class="player-hoverable" data-player-id="${player.playerId}">
                        <td class="player-name">
                            <img src="${player.headshot}" alt="${player.firstName.default} ${player.lastName.default}" class="player-photo-small">
                            <span class="player-full-name">${player.firstName.default} ${player.lastName.default}</span>
                            <span class="player-abbrev-text">${player.firstName.default.charAt(0)}. ${player.lastName.default}</span>
                        </td>
                        <td class="center">${player.gamesPlayed ?? '--'}</td>
                        <td class="center">${player.gamesStarted ?? '--'}</td>
                        <td class="center">${player.wins ?? '--'}</td>
                        <td class="center">${player.losses ?? '--'}</td>
                        <td class="center"><strong>${player.goalsAgainstAverage != null ? player.goalsAgainstAverage.toFixed(2) : '--'}</strong></td>
                        <td class="center"><strong>${player.savePercentage != null ? player.savePercentage.toFixed(3) : '--'}</strong></td>
                        <td class="center hide-mobile">${player.shotsAgainst ?? '--'}</td>
                        <td class="center hide-mobile">${player.saves ?? '--'}</td>
                        <td class="center hide-mobile">${player.goalsAgainst ?? '--'}</td>
                        <td class="center hide-mobile">${player.shutouts ?? '--'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('goalies-table').innerHTML = table;
    setupGoalieSortListeners();
}
