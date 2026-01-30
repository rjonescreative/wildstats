// Dashboard view module
import { getStandings, getWildStats, getLeagueLeaders } from '../api.js';
import { getUIState, setUIState } from '../state.js';

let standingsData = null;
let leagueLeaders = null;

export async function init() {
    try {
        // Fetch data (cached if available)
        const [standings, wildData, leaders] = await Promise.all([
            getStandings(),
            getWildStats(),
            getLeagueLeaders()
        ]);

        standingsData = standings;
        leagueLeaders = leaders;

        // Render views
        renderStatLeaders(wildData);
        renderCentralDivision();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        document.getElementById('stat-leaders').innerHTML =
            '<div class="loading">Error loading dashboard data.</div>';
        document.getElementById('central-standings').innerHTML =
            '<div class="loading">Error loading standings.</div>';
    }
}

export function render() {
    // Re-render with current state (for sort updates)
    renderCentralDivision();
}

export function cleanup() {
    // Clean up event listeners if needed
}

function setupSortListeners() {
    document.querySelectorAll('#central-standings .sortable').forEach(header => {
        header.addEventListener('click', (e) => {
            const field = e.target.dataset.sort;
            const state = getUIState('dashboard');

            if (state.sortBy === field) {
                state.sortDirection = state.sortDirection === 'desc' ? 'asc' : 'desc';
            } else {
                state.sortBy = field;
                state.sortDirection = 'desc';
            }

            setUIState('dashboard', state);
            renderCentralDivision();
        });
    });
}

function renderCentralDivision() {
    const state = getUIState('dashboard');
    const centralTeams = standingsData.standings.filter(team => team.divisionName === 'Central');

    // Sort teams
    const sortedTeams = [...centralTeams].sort((a, b) => {
        const aVal = a[state.sortBy];
        const bVal = b[state.sortBy];
        return state.sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });

    document.getElementById('central-standings').innerHTML = createStandingsTable(sortedTeams, state);
    setupSortListeners();
}

function createStandingsTable(teams, state) {
    const getSortIcon = (field) => {
        if (state.sortBy !== field) return '<span class="sort-arrow"> </span>';
        const arrow = state.sortDirection === 'desc' ? '↓' : '↑';
        return `<span class="sort-arrow">${arrow}</span>`;
    };

    return `
        <table>
            <thead>
                <tr>
                    <th class="center">#</th>
                    <th>Team</th>
                    <th class="center" data-tooltip="Games Played">GP</th>
                    <th class="center" data-tooltip="Wins">W</th>
                    <th class="center" data-tooltip="Losses">L</th>
                    <th class="center" data-tooltip="Overtime Losses">OT</th>
                    <th class="center sortable ${state.sortBy === 'points' ? 'sorted' : ''}" data-sort="points" data-tooltip="Points">PTS${getSortIcon('points')}</th>
                    <th class="center sortable ${state.sortBy === 'pointPctg' ? 'sorted' : ''}" data-sort="pointPctg" data-tooltip="Points Percentage">P%${getSortIcon('pointPctg')}</th>
                    <th class="center hide-mobile" data-tooltip="Regulation Wins">RW</th>
                    <th class="center hide-mobile" data-tooltip="Regulation + Overtime Wins">ROW</th>
                    <th class="center hide-mobile" data-tooltip="Goals For">GF</th>
                    <th class="center hide-mobile" data-tooltip="Goals Against">GA</th>
                    <th class="center hide-mobile" data-tooltip="Goal Differential">DIFF</th>
                    <th class="center" data-tooltip="Last 10 Games">L10</th>
                    <th class="center" data-tooltip="Streak">STRK</th>
                </tr>
            </thead>
            <tbody>
                ${teams.map((team, index) => {
                    const isWild = team.teamAbbrev.default === 'MIN';
                    const rank = index + 1;
                    const streakClass = team.streakCode === 'W' ? 'streak-W' : 'streak-L';

                    return `
                        <tr class="${isWild ? 'wild-highlight' : ''}">
                            <td class="center rank">${rank}</td>
                            <td class="team-name">
                                <img src="/logos/${team.teamAbbrev.default}_dark.svg" alt="${team.teamAbbrev.default}" class="team-logo">
                                <span class="team-full-name">${team.teamName.default}</span>
                                <span class="team-abbrev-text">${team.teamAbbrev.default}</span>
                            </td>
                            <td class="center">${team.gamesPlayed}</td>
                            <td class="center">${team.wins}</td>
                            <td class="center">${team.losses}</td>
                            <td class="center">${team.otLosses}</td>
                            <td class="center"><strong>${team.points}</strong></td>
                            <td class="center">${team.pointPctg.toFixed(3)}</td>
                            <td class="center hide-mobile">${team.regulationWins}</td>
                            <td class="center hide-mobile">${team.regulationPlusOtWins}</td>
                            <td class="center hide-mobile">${team.goalFor}</td>
                            <td class="center hide-mobile">${team.goalAgainst}</td>
                            <td class="center hide-mobile">${team.goalDifferential > 0 ? '+' : ''}${team.goalDifferential}</td>
                            <td class="center">${team.l10Wins}-${team.l10Losses}-${team.l10OtLosses}</td>
                            <td class="center ${streakClass}">${team.streakCode}${team.streakCount}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function renderStatLeaders(data) {
    const skaters = data.skaters || [];

    // Get top 5 for each category
    const topGoals = [...skaters].sort((a, b) => b.goals - a.goals).slice(0, 5);
    const topAssists = [...skaters].sort((a, b) => b.assists - a.assists).slice(0, 5);
    const topPoints = [...skaters].sort((a, b) => b.points - a.points).slice(0, 5);

    const getLeagueRank = (playerId, category) => {
        if (!leagueLeaders || !leagueLeaders[category]) return null;

        const leaders = leagueLeaders[category][category];
        if (!Array.isArray(leaders)) return null;

        const playerIndex = leaders.findIndex(leader => leader.id === playerId);
        if (playerIndex === -1 || playerIndex >= 25) return null;

        const playerValue = leaders[playerIndex].value;
        const playersWithSameValue = leaders.filter(leader => leader.value === playerValue);
        const isTied = playersWithSameValue.length > 1;
        const rank = leaders.findIndex(leader => leader.value === playerValue) + 1;

        return isTied ? `T${rank}` : rank;
    };

    const createLeaderRow = (player, statProp, category, index) => {
        const rank = getLeagueRank(player.playerId, category);
        const rankText = rank ? `<span class="league-rank-inline">#${rank}</span> ` : '';
        const lastName = player.lastName.default;
        const firstInitial = player.firstName.default.charAt(0);

        return `
            <div class="leader-row">
                <span class="leader-rank">${index + 1}</span>
                <img src="${player.headshot}" alt="${firstInitial}. ${lastName}" class="player-photo-small">
                <span class="leader-name">${firstInitial}. ${lastName}</span>
                <span class="leader-stat">${rankText}${player[statProp]}</span>
            </div>
        `;
    };

    const createLeaderCard = (topPlayers, statProp, label, category) => {
        const playerRows = topPlayers.map((player, index) =>
            createLeaderRow(player, statProp, category, index)
        ).join('');

        return `
            <div class="stat-leader-card">
                <div class="stat-category">${label}</div>
                <div class="leader-list">
                    ${playerRows}
                </div>
            </div>
        `;
    };

    document.getElementById('stat-leaders').innerHTML = `
        <div class="stat-leaders-grid">
            ${createLeaderCard(topGoals, 'goals', 'Goals', 'goals')}
            ${createLeaderCard(topAssists, 'assists', 'Assists', 'assists')}
            ${createLeaderCard(topPoints, 'points', 'Points', 'points')}
        </div>
    `;
}
