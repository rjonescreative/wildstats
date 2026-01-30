// Standings view module
import { getStandings } from '../api.js';
import { getUIState, setUIState } from '../state.js';

let standingsData = null;

export async function init(view = 'wildcard') {
    try {
        // Fetch standings (cached if available)
        standingsData = await getStandings();

        // Update UI state with initial view
        const state = getUIState('standings');
        state.currentView = view;
        setUIState('standings', state);

        // Render standings
        render();
        setupViewButtons();
    } catch (error) {
        console.error('Error loading standings:', error);
        document.getElementById('standings-container').innerHTML =
            '<div class="loading">Error loading standings.</div>';
    }
}

export function render() {
    if (!standingsData) return;

    const state = getUIState('standings');
    const container = document.getElementById('standings-container');

    switch(state.currentView) {
        case 'league':
            container.innerHTML = renderLeagueStandings(state);
            break;
        case 'conference':
            container.innerHTML = renderConferenceStandings(state);
            break;
        case 'division':
            container.innerHTML = renderDivisionStandings(state);
            break;
        case 'wildcard':
        default:
            container.innerHTML = renderWildcardStandings(state);
            break;
    }

    setupSortListeners();
}

export function cleanup() {
    // Clean up event listeners if needed
}

function setupViewButtons() {
    const viewButtons = document.querySelectorAll('.view-btn');
    const state = getUIState('standings');

    // Set active state based on current view
    viewButtons.forEach(btn => {
        if (btn.dataset.view === state.currentView) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function setupSortListeners() {
    document.querySelectorAll('#standings-container .sortable').forEach(header => {
        header.addEventListener('click', (e) => {
            const field = e.target.dataset.sort;
            const state = getUIState('standings');

            if (state.sortBy === field) {
                state.sortDirection = state.sortDirection === 'desc' ? 'asc' : 'desc';
            } else {
                state.sortBy = field;
                state.sortDirection = 'desc';
            }

            setUIState('standings', state);
            render();
        });
    });
}

function sortTeams(teams, state) {
    return [...teams].sort((a, b) => {
        const aVal = a[state.sortBy];
        const bVal = b[state.sortBy];
        return state.sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
}

function renderLeagueStandings(state) {
    const allTeams = sortTeams(standingsData.standings, state);

    return `
        <div class="standings-section">
            <h2>NHL League Standings</h2>
            <div class="standings-table">
                ${createStandingsTable(allTeams, state, true)}
            </div>
        </div>
    `;
}

function renderConferenceStandings(state) {
    const western = sortTeams(standingsData.standings.filter(team => team.conferenceName === 'Western'), state);
    const eastern = sortTeams(standingsData.standings.filter(team => team.conferenceName === 'Eastern'), state);

    return `
        <div class="standings-section">
            <h2>Western Conference</h2>
            <div class="standings-table">
                ${createStandingsTable(western, state)}
            </div>
        </div>
        <div class="standings-section">
            <h2>Eastern Conference</h2>
            <div class="standings-table">
                ${createStandingsTable(eastern, state)}
            </div>
        </div>
    `;
}

function renderDivisionStandings(state) {
    const divisions = ['Central', 'Pacific', 'Atlantic', 'Metropolitan'];

    return divisions.map(division => {
        const teams = sortTeams(standingsData.standings.filter(team => team.divisionName === division), state);

        return `
            <div class="standings-section">
                <h2>${division} Division</h2>
                <div class="standings-table">
                    ${createStandingsTable(teams, state)}
                </div>
            </div>
        `;
    }).join('');
}

function renderWildcardStandings(state) {
    const western = standingsData.standings
        .filter(team => team.conferenceName === 'Western')
        .sort((a, b) => a.wildcardSequence - b.wildcardSequence);

    const eastern = standingsData.standings
        .filter(team => team.conferenceName === 'Eastern')
        .sort((a, b) => a.wildcardSequence - b.wildcardSequence);

    return `
        <div class="standings-section">
            <h2>Western Conference - Wildcard</h2>
            <div class="standings-table">
                ${createWildcardTable(western, state)}
            </div>
        </div>
        <div class="standings-section">
            <h2>Eastern Conference - Wildcard</h2>
            <div class="standings-table">
                ${createWildcardTable(eastern, state)}
            </div>
        </div>
    `;
}

function createStandingsTable(teams, state, showLeagueRank = false) {
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
                    const rank = showLeagueRank ? team.leagueSequence : index + 1;
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

function createWildcardTable(teams, state) {
    // Group teams by division
    const divisions = {};
    teams.forEach(team => {
        if (!divisions[team.divisionName]) {
            divisions[team.divisionName] = [];
        }
        divisions[team.divisionName].push(team);
    });

    // Sort each division by the current sort criteria
    Object.keys(divisions).forEach(div => {
        divisions[div] = sortTeams(divisions[div], state);
    });

    // Get the two divisions in this conference
    const divisionNames = Object.keys(divisions);

    // Separate top 3 from each division and remaining teams
    const divisionLeaders = [];
    const wildcardTeams = [];

    divisionNames.forEach(divName => {
        const divTeams = divisions[divName];
        divisionLeaders.push({
            name: divName,
            teams: divTeams.slice(0, 3)
        });
        wildcardTeams.push(...divTeams.slice(3));
    });

    // Sort wildcard teams by the current sort setting
    const sortedWildcardTeams = sortTeams(wildcardTeams, state);

    const createTeamRow = (team) => {
        const isWild = team.teamAbbrev.default === 'MIN';
        const streakClass = team.streakCode === 'W' ? 'streak-W' : 'streak-L';

        return `
            <tr class="${isWild ? 'wild-highlight' : ''}">
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
    };

    const getSortIcon = (field) => {
        if (state.sortBy !== field) return '<span class="sort-arrow"> </span>';
        const arrow = state.sortDirection === 'desc' ? '↓' : '↑';
        return `<span class="sort-arrow">${arrow}</span>`;
    };

    return `
        <table>
            <thead>
                <tr>
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
                ${divisionLeaders.map(div => `
                    <tr class="division-header">
                        <td colspan="14"><strong>${div.name} Division</strong></td>
                    </tr>
                    ${div.teams.map(team => createTeamRow(team)).join('')}
                `).join('')}
                <tr class="division-header">
                    <td colspan="14"><strong>Wild Card</strong></td>
                </tr>
                ${sortedWildcardTeams.map((team, index) => {
                    const row = createTeamRow(team);
                    const cutoffLine = index === 1 ? '<tr class="playoff-cutoff"><td colspan="14"></td></tr>' : '';
                    return row + cutoffLine;
                }).join('')}
            </tbody>
        </table>
    `;
}
