// Standings view module
import { getStandings, getLeagueLeaders, getPlayoffBracket } from '../api.js';
import { getUIState, setUIState } from '../state.js';

let standingsData = null;
let bracketData = null;

// NHL.com team slug mapping
const TEAM_SLUGS = {
    'ANA': 'ducks', 'BOS': 'bruins', 'BUF': 'sabres', 'CAR': 'hurricanes',
    'CBJ': 'bluejackets', 'CGY': 'flames', 'CHI': 'blackhawks', 'COL': 'avalanche',
    'DAL': 'stars', 'DET': 'redwings', 'EDM': 'oilers', 'FLA': 'panthers',
    'LAK': 'kings', 'MIN': 'wild', 'MTL': 'canadiens', 'NJD': 'devils',
    'NSH': 'predators', 'NYI': 'islanders', 'NYR': 'rangers', 'OTT': 'senators',
    'PHI': 'flyers', 'PIT': 'penguins', 'SJS': 'sharks', 'SEA': 'kraken',
    'STL': 'blues', 'TBL': 'lightning', 'TOR': 'mapleleafs', 'VAN': 'canucks',
    'VGK': 'goldenknights', 'WPG': 'jets', 'WSH': 'capitals', 'UTA': 'utah'
};

export async function init(view = 'wildcard') {
    try {
        // Fetch standings and league leaders (cached if available)
        const fetches = [getStandings(), getLeagueLeaders()];
        if (view === 'playoffs') {
            fetches.push(getPlayoffBracket('2026'));
        }
        const results = await Promise.all(fetches);
        standingsData = results[0];
        if (view === 'playoffs') {
            bracketData = results[2];
        }

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
        case 'playoffs':
            container.innerHTML = renderPlayoffBracket();
            break;
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

    if (state.currentView !== 'playoffs') {
        setupSortListeners();
    }
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
            const field = e.currentTarget.dataset.sort;
            const state = getUIState('standings');

            // Don't do anything if already sorted by this field
            if (state.sortBy === field) {
                return;
            }

            state.sortBy = field;
            state.sortDirection = 'desc';

            setUIState('standings', state);
            render();
        });
    });
}

// Apply NHL tiebreaker rules when two teams have equal points (or equal P%).
// Order: fewer GP → more RW → more ROW → more W → better DIFF → more GF
function breakTie(a, b) {
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed; // fewer GP wins
    if (a.regulationWins !== b.regulationWins) return b.regulationWins - a.regulationWins;
    if (a.regulationPlusOtWins !== b.regulationPlusOtWins) return b.regulationPlusOtWins - a.regulationPlusOtWins;
    if (a.wins !== b.wins) return b.wins - a.wins;
    // Rule 5 (head-to-head) is skipped — data not available
    if (a.goalDifferential !== b.goalDifferential) return b.goalDifferential - a.goalDifferential;
    return b.goalFor - a.goalFor;
}

function sortTeams(teams, state) {
    return [...teams].sort((a, b) => {
        const aVal = a[state.sortBy];
        const bVal = b[state.sortBy];
        const primary = state.sortDirection === 'desc' ? bVal - aVal : aVal - bVal;

        if (primary !== 0) return primary;

        // Apply full NHL tiebreaker chain when sorting by points or points percentage
        if (state.sortBy === 'points' || state.sortBy === 'pointPctg') {
            return breakTie(a, b);
        }

        return 0;
    });
}

function calculateMagicNumber(team, conferenceTeams) {
    const TOTAL_GAMES = 82;
    const PLAYOFF_SPOTS = 8;

    // Sort teams by wildcard sequence (current playoff standings)
    const sortedTeams = [...conferenceTeams].sort((a, b) => a.wildcardSequence - b.wildcardSequence);

    // Determine if team is in playoff position (top 8)
    const teamPosition = sortedTeams.findIndex(t => t.teamAbbrev.default === team.teamAbbrev.default) + 1;
    const isInPlayoffs = teamPosition <= PLAYOFF_SPOTS;

    // Check for clinch/elimination markers (if they exist in the API)
    if (team.clinchIndicator) return null; // Team has clinched
    if (team.eliminationNumber === 0) return null; // Team is eliminated

    // Calculate games remaining and max points for all teams
    const teamsWithMax = sortedTeams.map(t => ({
        ...t,
        gamesRemaining: TOTAL_GAMES - t.gamesPlayed,
        maxPoints: t.points + ((TOTAL_GAMES - t.gamesPlayed) * 2)
    }));

    const currentTeam = teamsWithMax.find(t => t.teamAbbrev.default === team.teamAbbrev.default);

    if (isInPlayoffs) {
        // Magic number: points needed to guarantee playoff spot
        // Find the team in 9th place or the strongest team that could finish 9th
        const ninthPlaceTeam = teamsWithMax[PLAYOFF_SPOTS]; // 9th place team (index 8)
        if (!ninthPlaceTeam) return null;

        // Magic number = (9th place max points + 1) - your current points
        const magic = (ninthPlaceTeam.maxPoints + 1) - currentTeam.points;
        return magic > 0 ? { type: 'magic', value: magic } : null;
    } else {
        // Tragic number: points 8th place needs to eliminate you
        const eighthPlaceTeam = teamsWithMax[PLAYOFF_SPOTS - 1]; // 8th place team (index 7)
        if (!eighthPlaceTeam) return null;

        // Tragic number = (your max points + 1) - 8th place current points
        const tragic = (currentTeam.maxPoints + 1) - eighthPlaceTeam.points;
        return tragic > 0 ? { type: 'tragic', value: tragic } : null;
    }
}

function isSeasonResolved() {
    return standingsData.standings.every(team =>
        team.clinchIndicator || team.eliminationNumber === 0
    );
}

const CLINCH_LABELS = {
    'p': 'Presidents\' Trophy',
    'z': 'clinched conference',
    'y': 'clinched division',
    'x': 'clinched playoff spot',
    'e': 'eliminated from playoff contention',
};

function renderClinchKey() {
    const hasAny = standingsData.standings.some(t => t.clinchIndicator);
    if (!hasAny) return '';

    const items = Object.entries(CLINCH_LABELS).map(([ind, label]) =>
        `<span class="key-item">${ind} \u2013 ${label}</span>`
    ).join('');
    return `<div class="clinch-key">${items}</div>`;
}

function renderLeagueStandings(state) {
    const allTeams = sortTeams(standingsData.standings, state);
    const hideMagicCol = isSeasonResolved();

    return `
        <div class="standings-section">
            <h2>League</h2>
            <div class="standings-table">
                ${createStandingsTable(allTeams, state, true, hideMagicCol)}
            </div>
        </div>
        ${renderClinchKey()}
    `;
}

function renderConferenceStandings(state) {
    const western = sortTeams(standingsData.standings.filter(team => team.conferenceName === 'Western'), state);
    const eastern = sortTeams(standingsData.standings.filter(team => team.conferenceName === 'Eastern'), state);
    const hideMagicCol = isSeasonResolved();

    return `
        <div class="standings-section">
            <h2>Western Conference</h2>
            <div class="standings-table">
                ${createStandingsTable(western, state, false, hideMagicCol)}
            </div>
        </div>
        <div class="standings-section">
            <h2>Eastern Conference</h2>
            <div class="standings-table">
                ${createStandingsTable(eastern, state, false, hideMagicCol)}
            </div>
        </div>
        ${renderClinchKey()}
    `;
}

function renderDivisionStandings(state) {
    const divisions = ['Central', 'Pacific', 'Atlantic', 'Metropolitan'];
    const hideMagicCol = isSeasonResolved();

    return divisions.map(division => {
        const teams = sortTeams(standingsData.standings.filter(team => team.divisionName === division), state);

        return `
            <div class="standings-section">
                <h2>${division} Division</h2>
                <div class="standings-table">
                    ${createStandingsTable(teams, state, false, hideMagicCol)}
                </div>
            </div>
        `;
    }).join('') + renderClinchKey();
}

function renderWildcardStandings(state) {
    const western = standingsData.standings
        .filter(team => team.conferenceName === 'Western')
        .sort((a, b) => a.wildcardSequence - b.wildcardSequence);

    const eastern = standingsData.standings
        .filter(team => team.conferenceName === 'Eastern')
        .sort((a, b) => a.wildcardSequence - b.wildcardSequence);

    const hideMagicCol = isSeasonResolved();

    return `
        <div class="standings-section">
            <h2>Western Conference - Wildcard</h2>
            <div class="standings-table">
                ${createWildcardTable(western, state, hideMagicCol)}
            </div>
        </div>
        <div class="standings-section">
            <h2>Eastern Conference - Wildcard</h2>
            <div class="standings-table">
                ${createWildcardTable(eastern, state, hideMagicCol)}
            </div>
        </div>
        ${renderClinchKey()}
    `;
}

function createStandingsTable(teams, state, showLeagueRank = false, hideMagicCol = false) {
    const getSortIcon = (field) => {
        if (state.sortBy !== field) return '<span class="sort-arrow"> </span>';
        const arrow = state.sortDirection === 'desc' ? '↓' : '↑';
        return `<span class="sort-arrow">${arrow}</span>`;
    };

    // Find the last team in playoff position (for cutoff line)
    // Only show cutoff line when sorting by points, and never in league standings
    let lastPlayoffTeamId = null;
    if (state.sortBy === 'points' && !showLeagueRank) {
        // Use conferenceSequence to determine playoff position (1-8 are in playoffs)
        const inPlayoffTeams = teams.filter(t => t.conferenceSequence >= 1 && t.conferenceSequence <= 8);
        const outOfPlayoffTeams = teams.filter(t => t.conferenceSequence > 8);

        // Only show cutoff if there are teams both in and out of playoffs
        if (inPlayoffTeams.length > 0 && outOfPlayoffTeams.length > 0) {
            lastPlayoffTeamId = inPlayoffTeams[inPlayoffTeams.length - 1].teamAbbrev.default;
        }
    }

    return `
        <table>
            <thead>
                <tr>
                    <th class="center rank">#</th>
                    <th class="team-col">Team</th>
                    <th class="center" data-tooltip="Games Played" aria-label="Games Played">GP</th>
                    <th class="center" data-tooltip="Wins" aria-label="Wins">W</th>
                    <th class="center" data-tooltip="Losses" aria-label="Losses">L</th>
                    <th class="center" data-tooltip="Overtime Losses" aria-label="Overtime Losses">OT</th>
                    <th class="center sortable ${state.sortBy === 'points' ? 'sorted' : ''}" data-sort="points" data-tooltip="Points" aria-label="Points">PTS${getSortIcon('points')}</th>
                    <th class="center sortable ${state.sortBy === 'pointPctg' ? 'sorted' : ''}" data-sort="pointPctg" data-tooltip="Points Percentage" aria-label="Points Percentage">P%${getSortIcon('pointPctg')}</th>
                    <th class="center hide-mobile" data-tooltip="Regulation Wins" aria-label="Regulation Wins">RW</th>
                    <th class="center hide-mobile" data-tooltip="Regulation + Overtime Wins" aria-label="Regulation + Overtime Wins">ROW</th>
                    <th class="center hide-mobile" data-tooltip="Goals For" aria-label="Goals For">GF</th>
                    <th class="center hide-mobile" data-tooltip="Goals Against" aria-label="Goals Against">GA</th>
                    <th class="center hide-mobile" data-tooltip="Goal Differential" aria-label="Goal Differential">DIFF</th>
                    <th class="center" data-tooltip="Last 10 Games" aria-label="Last 10 Games">L10</th>
                    <th class="center" data-tooltip="Streak" aria-label="Streak">STRK</th>
                    ${!hideMagicCol ? '<th class="center" data-tooltip="Magic/Tragic Numbers" aria-label="Magic/Tragic Numbers">M#</th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${teams.map((team, index) => {
                    const isWild = team.teamAbbrev.default === 'MIN';
                    const rank = showLeagueRank ? team.leagueSequence : index + 1;
                    const streakClass = team.streakCount > 2 ? (team.streakCode === 'W' ? 'streak-W' : 'streak-L') : '';
                    const diffClass = team.goalDifferential > 0 ? 'diff-positive' : team.goalDifferential < 0 ? 'diff-negative' : '';

                    // Get conference teams for magic number calculation
                    const conferenceTeams = standingsData.standings.filter(t => t.conferenceName === team.conferenceName);
                    const magicNumber = calculateMagicNumber(team, conferenceTeams);
                    let magicDisplay = '';
                    if (magicNumber) {
                        const className = magicNumber.type === 'magic' ? 'magic-number' : 'tragic-number';
                        magicDisplay = `<span class="${className}">${magicNumber.value}</span>`;
                    }

                    // Determine if playoff cutoff line should be added after this team
                    const showCutoff = lastPlayoffTeamId && team.teamAbbrev.default === lastPlayoffTeamId;

                    const row = `
                        <tr class="${isWild ? 'wild-highlight' : ''}">
                            <td class="center rank">${rank}</td>
                            <td class="team-name">
                                <img src="/logos/${team.teamAbbrev.default}_dark.svg" alt="${team.teamAbbrev.default}" class="team-logo">
                                <a href="https://www.nhl.com/${TEAM_SLUGS[team.teamAbbrev.default] || team.teamAbbrev.default.toLowerCase()}/" target="_blank" rel="noopener noreferrer" class="team-link">
                                    <span class="team-full-name">${team.teamName.default}${team.clinchIndicator ? ` \u2013 ${team.clinchIndicator}` : ''}</span>
                                    <span class="team-abbrev-text">${team.teamAbbrev.default}</span>${team.clinchIndicator ? `<span class="clinch-mid"> \u2013 ${team.clinchIndicator}</span>` : ''}${hideMagicCol && team.clinchIndicator ? `<span class="clinch-abbrev"> \u2013 ${team.clinchIndicator}</span>` : ''}
                                    <span class="external-link-icon">↗</span>
                                </a>
                            </td>
                            <td class="center">${team.gamesPlayed}</td>
                            <td class="center">${team.wins}</td>
                            <td class="center">${team.losses}</td>
                            <td class="center">${team.otLosses}</td>
                            <td class="center"><strong>${team.points}</strong></td>
                            <td class="center"><span class="p-pct-full">${team.pointPctg.toFixed(3)}</span><span class="p-pct-mobile">${team.pointPctg.toFixed(2).substring(1)}</span></td>
                            <td class="center hide-mobile">${team.regulationWins}</td>
                            <td class="center hide-mobile">${team.regulationPlusOtWins}</td>
                            <td class="center hide-mobile">${team.goalFor}</td>
                            <td class="center hide-mobile">${team.goalAgainst}</td>
                            <td class="center hide-mobile ${diffClass}">${team.goalDifferential > 0 ? '+' : ''}${team.goalDifferential}</td>
                            <td class="center">${team.l10Wins}-${team.l10Losses}-${team.l10OtLosses}</td>
                            <td class="center ${streakClass}">${team.streakCode}${team.streakCount}</td>
                            ${!hideMagicCol ? `<td class="center">${magicDisplay}${team.clinchIndicator ? `<span class="clinch-mobile">${team.clinchIndicator}</span>` : ''}</td>` : ''}
                        </tr>
                    `;

                    const cutoffLine = showCutoff ? `<tr class="playoff-cutoff"><td colspan="${hideMagicCol ? 15 : 16}"></td></tr>` : '';
                    return row + cutoffLine;
                }).join('')}
            </tbody>
        </table>
    `;
}

function createWildcardTable(teams, state, hideMagicCol = false) {
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
        const streakClass = team.streakCount > 2 ? (team.streakCode === 'W' ? 'streak-W' : 'streak-L') : '';
        const diffClass = team.goalDifferential > 0 ? 'diff-positive' : team.goalDifferential < 0 ? 'diff-negative' : '';

        // Calculate magic/tragic number
        const conferenceTeams = teams; // teams parameter is already the conference
        const magicNumber = calculateMagicNumber(team, conferenceTeams);
        let magicDisplay = '';
        if (magicNumber) {
            const className = magicNumber.type === 'magic' ? 'magic-number' : 'tragic-number';
            magicDisplay = `<span class="${className}">${magicNumber.value}</span>`;
        }

        return `
            <tr class="${isWild ? 'wild-highlight' : ''}">
                <td class="team-name">
                    <img src="/logos/${team.teamAbbrev.default}_dark.svg" alt="${team.teamAbbrev.default}" class="team-logo">
                    <a href="https://www.nhl.com/${TEAM_SLUGS[team.teamAbbrev.default] || team.teamAbbrev.default.toLowerCase()}/" target="_blank" rel="noopener noreferrer" class="team-link">
                        <span class="team-full-name">${team.teamName.default}${team.clinchIndicator ? ` \u2013 ${team.clinchIndicator}` : ''}</span>
                        <span class="team-abbrev-text">${team.teamAbbrev.default}</span>${team.clinchIndicator ? `<span class="clinch-mid"> \u2013 ${team.clinchIndicator}</span>` : ''}${hideMagicCol && team.clinchIndicator ? `<span class="clinch-abbrev"> \u2013 ${team.clinchIndicator}</span>` : ''}
                        <span class="external-link-icon">↗</span>
                    </a>
                </td>
                <td class="center">${team.gamesPlayed}</td>
                <td class="center">${team.wins}</td>
                <td class="center">${team.losses}</td>
                <td class="center">${team.otLosses}</td>
                <td class="center"><strong>${team.points}</strong></td>
                <td class="center"><span class="p-pct-full">${team.pointPctg.toFixed(3)}</span><span class="p-pct-mobile">${team.pointPctg.toFixed(2).substring(1)}</span></td>
                <td class="center hide-mobile">${team.regulationWins}</td>
                <td class="center hide-mobile">${team.regulationPlusOtWins}</td>
                <td class="center hide-mobile">${team.goalFor}</td>
                <td class="center hide-mobile">${team.goalAgainst}</td>
                <td class="center hide-mobile ${diffClass}">${team.goalDifferential > 0 ? '+' : ''}${team.goalDifferential}</td>
                <td class="center">${team.l10Wins}-${team.l10Losses}-${team.l10OtLosses}</td>
                <td class="center ${streakClass}">${team.streakCode}${team.streakCount}</td>
                ${!hideMagicCol ? `<td class="center">${magicDisplay}${team.clinchIndicator ? `<span class="clinch-mobile">${team.clinchIndicator}</span>` : ''}</td>` : ''}
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
                    <th class="team-col">Team</th>
                    <th class="center" data-tooltip="Games Played" aria-label="Games Played">GP</th>
                    <th class="center" data-tooltip="Wins" aria-label="Wins">W</th>
                    <th class="center" data-tooltip="Losses" aria-label="Losses">L</th>
                    <th class="center" data-tooltip="Overtime Losses" aria-label="Overtime Losses">OT</th>
                    <th class="center sortable ${state.sortBy === 'points' ? 'sorted' : ''}" data-sort="points" data-tooltip="Points" aria-label="Points">PTS${getSortIcon('points')}</th>
                    <th class="center sortable ${state.sortBy === 'pointPctg' ? 'sorted' : ''}" data-sort="pointPctg" data-tooltip="Points Percentage" aria-label="Points Percentage">P%${getSortIcon('pointPctg')}</th>
                    <th class="center hide-mobile" data-tooltip="Regulation Wins" aria-label="Regulation Wins">RW</th>
                    <th class="center hide-mobile" data-tooltip="Regulation + Overtime Wins" aria-label="Regulation + Overtime Wins">ROW</th>
                    <th class="center hide-mobile" data-tooltip="Goals For" aria-label="Goals For">GF</th>
                    <th class="center hide-mobile" data-tooltip="Goals Against" aria-label="Goals Against">GA</th>
                    <th class="center hide-mobile" data-tooltip="Goal Differential" aria-label="Goal Differential">DIFF</th>
                    <th class="center" data-tooltip="Last 10 Games" aria-label="Last 10 Games">L10</th>
                    <th class="center" data-tooltip="Streak" aria-label="Streak">STRK</th>
                    ${!hideMagicCol ? '<th class="center" data-tooltip="Magic/Tragic Numbers" aria-label="Magic/Tragic Numbers">M#</th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${divisionLeaders.map(div => `
                    <tr class="division-header">
                        <td colspan="${hideMagicCol ? 14 : 15}"><strong>${div.name} Division</strong></td>
                    </tr>
                    ${div.teams.map(team => createTeamRow(team)).join('')}
                `).join('')}
                <tr class="division-header">
                    <td colspan="${hideMagicCol ? 14 : 15}"><strong>Wild Card</strong></td>
                </tr>
                ${sortedWildcardTeams.map((team, index) => {
                    const row = createTeamRow(team);
                    const cutoffLine = index === 1 ? `<tr class="playoff-cutoff"><td colspan="${hideMagicCol ? 14 : 15}"></td></tr>` : '';
                    return row + cutoffLine;
                }).join('')}
            </tbody>
        </table>
    `;
}

// ─── Playoff Bracket ─────────────────────────────────────────────────────────

// Standard NHL bracket: series letter → position
// West R1: A,B,C,D  East R1: E,F,G,H
// West R2: I,J       East R2: K,L
// West CF: M         East CF: N
// SCF: O
const BRACKET_MAP = {
    west: { r1: ['E','F','G','H'], r2: ['K','L'], cf: ['N'] },
    east: { r1: ['A','B','C','D'], r2: ['I','J'], cf: ['M'] },
    scf: 'O'
};

function getSeriesByLetter(letter) {
    if (!bracketData || !bracketData.series) return null;
    return bracketData.series.find(s => s.seriesLetter === letter) || null;
}

function renderMatchupCard(series) {
    if (!series) {
        return `
            <div class="bracket-matchup bracket-matchup-empty">
                <div class="bracket-team bracket-team-tbd">
                    <span class="bracket-team-name">TBD</span>
                </div>
                <div class="bracket-team bracket-team-tbd">
                    <span class="bracket-team-name">TBD</span>
                </div>
            </div>
        `;
    }

    const topTeam = series.topSeedTeam;
    const bottomTeam = series.bottomSeedTeam;
    const topWins = series.topSeedWins || 0;
    const bottomWins = series.bottomSeedWins || 0;
    const topWon = topWins === 4;
    const bottomWon = bottomWins === 4;
    const seriesActive = (topWins > 0 || bottomWins > 0) && !topWon && !bottomWon;

    const renderTeam = (team, seedAbbrev, wins, isWinner, isEliminated) => {
        if (!team) {
            return `
                <div class="bracket-team bracket-team-tbd">
                    <span class="bracket-team-name">TBD</span>
                </div>
            `;
        }
        const abbrev = team.abbrev;
        const isWild = abbrev === 'MIN';
        const teamName = team.commonName?.default || team.name?.default || abbrev;
        const logo = team.darkLogo || team.logo || `/logos/${abbrev}_dark.svg`;
        const nhlSlug = TEAM_SLUGS[abbrev] || abbrev.toLowerCase();
        return `
            <div class="bracket-team${isWinner ? ' bracket-team-winner' : ''}${isEliminated ? ' bracket-team-eliminated' : ''}${isWild ? ' bracket-team-wild' : ''}">
                <span class="bracket-team-seed">${seedAbbrev || ''}</span>
                <a href="https://www.nhl.com/${nhlSlug}/" target="_blank" rel="noopener noreferrer" class="bracket-team-link">
                    <img src="${logo}" alt="${abbrev}" class="bracket-team-logo">
                    <span class="bracket-team-name">${teamName}</span>
                    <span class="bracket-team-abbrev">${abbrev}</span>
                </a>
                <span class="bracket-team-wins${isWinner ? ' wins-highlight' : ''}${wins === 0 && topWins === 0 && bottomWins === 0 ? ' wins-empty' : ''}">${wins}</span>
            </div>
        `;
    };

    const wonLabel = topWon ? `<div class="bracket-series-won">${topTeam?.commonName?.default || 'Team'} advance</div>` :
                     bottomWon ? `<div class="bracket-series-won">${bottomTeam?.commonName?.default || 'Team'} advance</div>` : '';

    return `
        <div class="bracket-matchup${seriesActive ? ' bracket-matchup-active' : ''}">
            ${renderTeam(topTeam, series.topSeedRankAbbrev, topWins, topWon, bottomWon)}
            ${renderTeam(bottomTeam, series.bottomSeedRankAbbrev, bottomWins, bottomWon, topWon)}
            ${wonLabel}
        </div>
    `;
}

function renderRoundColumn(seriesLetters, roundClass) {
    // Group into pairs for connector styling (R1: 2 pairs of 2, R2: 1 pair of 2, CF: single)
    if (seriesLetters.length === 4) {
        return `
            <div class="bracket-round ${roundClass}">
                <div class="bracket-pair">
                    ${renderMatchupCard(getSeriesByLetter(seriesLetters[0]))}
                    ${renderMatchupCard(getSeriesByLetter(seriesLetters[1]))}
                </div>
                <div class="bracket-pair">
                    ${renderMatchupCard(getSeriesByLetter(seriesLetters[2]))}
                    ${renderMatchupCard(getSeriesByLetter(seriesLetters[3]))}
                </div>
            </div>
        `;
    }
    if (seriesLetters.length === 2) {
        return `
            <div class="bracket-round ${roundClass}">
                <div class="bracket-pair">
                    ${renderMatchupCard(getSeriesByLetter(seriesLetters[0]))}
                </div>
                <div class="bracket-pair">
                    ${renderMatchupCard(getSeriesByLetter(seriesLetters[1]))}
                </div>
            </div>
        `;
    }
    return `
        <div class="bracket-round ${roundClass}">
            ${renderMatchupCard(getSeriesByLetter(seriesLetters[0]))}
        </div>
    `;
}

function renderMobileRound(seriesLetters, roundName) {
    return `
        <div class="bracket-mobile-round">
            <div class="bracket-mobile-round-label">${roundName}</div>
            <div class="bracket-mobile-matchups">
                ${seriesLetters.map(l => renderMatchupCard(getSeriesByLetter(l))).join('')}
            </div>
        </div>
    `;
}

function renderPlayoffBracket() {
    if (!bracketData || !bracketData.series) {
        return '<div class="loading">Unable to load playoff bracket.</div>';
    }

    const title = bracketData.bracketTitle?.default || 'Playoff Bracket';

    return `
        <div class="playoff-bracket-wrapper">
            <div class="playoff-bracket-header">
                <h2>${title}</h2>
            </div>
            <div class="playoff-bracket-scroll bracket-desktop">
                <div class="playoff-bracket">
                    <div class="bracket-body">
                        <div class="bracket-label bracket-label-wr1">1ST ROUND</div>
                        <div class="bracket-label bracket-label-wr2">2ND ROUND</div>
                        <div class="bracket-label bracket-label-wcf">CONF. FINALS</div>
                        <div class="bracket-label bracket-label-scf-text">STANLEY CUP<br>FINAL</div>
                        <div class="bracket-label bracket-label-ecf">CONF. FINALS</div>
                        <div class="bracket-label bracket-label-er2">2ND ROUND</div>
                        <div class="bracket-label bracket-label-er1">1ST ROUND</div>
                        <div class="bracket-conf-label bracket-conf-west">WESTERN CONFERENCE</div>
                        <div class="bracket-conf-label bracket-conf-east">EASTERN CONFERENCE</div>
                        ${renderRoundColumn(BRACKET_MAP.west.r1, 'bracket-r1 bracket-west')}
                        <div class="bracket-connector west-r1-r2"></div>
                        ${renderRoundColumn(BRACKET_MAP.west.r2, 'bracket-r2 bracket-west')}
                        <div class="bracket-connector west-r2-cf"></div>
                        ${renderRoundColumn(BRACKET_MAP.west.cf, 'bracket-cf bracket-west')}
                        <div class="bracket-connector west-cf-scf"></div>
                        <div class="bracket-round bracket-scf">
                            ${renderMatchupCard(getSeriesByLetter(BRACKET_MAP.scf))}
                        </div>
                        <div class="bracket-connector east-cf-scf"></div>
                        ${renderRoundColumn(BRACKET_MAP.east.cf, 'bracket-cf bracket-east')}
                        <div class="bracket-connector east-r2-cf"></div>
                        ${renderRoundColumn(BRACKET_MAP.east.r2, 'bracket-r2 bracket-east')}
                        <div class="bracket-connector east-r1-r2"></div>
                        ${renderRoundColumn(BRACKET_MAP.east.r1, 'bracket-r1 bracket-east')}
                    </div>
                </div>
            </div>
            <div class="bracket-mobile">
                <div class="bracket-mobile-conf">
                    <div class="bracket-mobile-conf-label">WESTERN CONFERENCE</div>
                    ${renderMobileRound(BRACKET_MAP.west.r1, 'R1')}
                    ${renderMobileRound(BRACKET_MAP.west.r2, 'R2')}
                    ${renderMobileRound(BRACKET_MAP.west.cf, 'CF')}
                </div>
                <div class="bracket-mobile-scf">
                    <div class="bracket-mobile-conf-label">STANLEY CUP FINAL</div>
                    <div class="bracket-mobile-matchups">
                        ${renderMatchupCard(getSeriesByLetter(BRACKET_MAP.scf))}
                    </div>
                </div>
                <div class="bracket-mobile-conf">
                    <div class="bracket-mobile-conf-label">EASTERN CONFERENCE</div>
                    ${renderMobileRound(BRACKET_MAP.east.r1, 'R1')}
                    ${renderMobileRound(BRACKET_MAP.east.r2, 'R2')}
                    ${renderMobileRound(BRACKET_MAP.east.cf, 'CF')}
                </div>
            </div>
        </div>
    `;
}
