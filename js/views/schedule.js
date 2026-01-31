// Schedule view module
import { getSchedule, getStandings } from '../api.js';
import { getUIState, setUIState } from '../state.js';

let allGames = [];
let playoffTeams = new Set();

export async function init() {
    try {
        const [scheduleData, standingsData] = await Promise.all([
            getSchedule('20252026'),
            getStandings()
        ]);

        // Filter to regular season games only (gameType === 2)
        allGames = scheduleData.games.filter(g => g.gameType === 2);

        // Build set of teams currently in playoff position (top 8 in each conference)
        playoffTeams = new Set();
        standingsData.standings.forEach(team => {
            if (team.conferenceSequence <= 8) {
                playoffTeams.add(team.teamAbbrev.default);
            }
        });

        // Render the schedule
        renderToggle();
        renderTables();

        // Set up toggle event listener
        setupToggle();

    } catch (error) {
        console.error('Error loading schedule:', error);
        document.getElementById('schedule-container').innerHTML =
            '<div class="loading">Error loading schedule.</div>';
    }
}

export function render() {
    // Only re-render the tables, not the toggle
    renderTables();
}

function renderToggle() {
    const container = document.getElementById('schedule-container');
    const uiState = getUIState('schedule');
    const isChecked = uiState.hidePastGames ? 'checked' : '';

    const toggleHtml = `
        <div class="schedule-header">
            <label class="schedule-toggle">
                <span class="toggle-label">Hide Past Games</span>
                <input type="checkbox" id="hide-past-games-toggle" ${isChecked}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div id="schedule-tables"></div>
    `;
    container.innerHTML = toggleHtml;
}

function renderTables() {
    const uiState = getUIState('schedule');
    const hidePastGames = uiState.hidePastGames || false;

    // Filter games based on toggle
    let gamesToShow = allGames;
    if (hidePastGames) {
        gamesToShow = allGames.filter(g => g.gameState === 'FUT' || g.gameState === 'LIVE');
    }

    // Group games by month
    const gamesByMonth = groupGamesByMonth(gamesToShow);

    // Render all month tables (without toggle)
    const tablesContainer = document.getElementById('schedule-tables');
    if (tablesContainer) {
        tablesContainer.innerHTML = Object.entries(gamesByMonth)
            .map(([month, games]) => createMonthTable(month, games))
            .join('') + renderPlayoffKey();
    }
}

function renderPlayoffKey() {
    return `
        <div class="schedule-playoff-key">
            <span class="key-item"><span class="opp-in-playoffs">OPP</span> In playoff position</span>
            <span class="key-item"><span class="opp-out-playoffs">OPP</span> Outside playoff position</span>
        </div>
    `;
}

function setupToggle() {
    const toggle = document.getElementById('hide-past-games-toggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            setUIState('schedule', { hidePastGames: e.target.checked });
            renderTables();
        });
    }
}

export function cleanup() {
    const toggle = document.getElementById('hide-past-games-toggle');
    if (toggle) {
        toggle.removeEventListener('change', setupToggle);
    }
}

// Group games by month
function groupGamesByMonth(games) {
    const months = {};

    games.forEach(game => {
        const date = new Date(game.gameDate + 'T00:00:00');
        const monthKey = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long'
        });
        if (!months[monthKey]) {
            months[monthKey] = [];
        }
        months[monthKey].push(game);
    });

    return months;
}

// Format game time in Central timezone
function formatGameTime(startTimeUTC) {
    const date = new Date(startTimeUTC);
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    }).format(date);
}

// Format game date
function formatGameDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

// Get W/L result with OT/SO notation
function getGameResult(game) {
    const isMinHome = game.homeTeam.abbrev === 'MIN';
    const minScore = isMinHome ? game.homeTeam.score : game.awayTeam.score;
    const oppScore = isMinHome ? game.awayTeam.score : game.homeTeam.score;

    if (minScore === undefined) return '--';

    const didWin = minScore > oppScore;
    const periodType = game.periodDescriptor?.periodType || 'REG';

    if (didWin) {
        return periodType === 'OT' ? 'W (OT)' :
               periodType === 'SO' ? 'W (SO)' : 'W';
    } else {
        return periodType === 'OT' ? 'L (OT)' :
               periodType === 'SO' ? 'L (SO)' : 'L';
    }
}

// Extract local TV broadcast
function getTVBroadcast(game) {
    if (!game.tvBroadcasts?.length) return '--';

    const isMinHome = game.homeTeam.abbrev === 'MIN';
    const market = isMinHome ? 'H' : 'A';

    const localBroadcast = game.tvBroadcasts.find(b =>
        b.market === market && b.countryCode === 'US'
    );

    if (localBroadcast) return localBroadcast.network;

    const usBroadcast = game.tvBroadcasts.find(b => b.countryCode === 'US');
    return usBroadcast ? usBroadcast.network : game.tvBroadcasts[0].network;
}

// Create month table HTML
function createMonthTable(monthName, games) {
    return `
        <div class="standings-section schedule-month">
            <h2>${monthName}</h2>
            <div class="standings-table schedule-table">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th></th>
                            <th>Matchup</th>
                            <th class="hide-mobile">TV</th>
                            <th class="hide-mobile center">Links</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${games.map(game => createGameRow(game)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Create game row HTML
function createGameRow(game) {
    const isMinHome = game.homeTeam.abbrev === 'MIN';
    const oppTeam = isMinHome ? game.awayTeam : game.homeTeam;
    const isFuture = game.gameState === 'FUT' || game.gameState === 'LIVE';
    const isPast = game.gameState === 'FINAL' || game.gameState === 'OFF';

    const date = formatGameDate(game.gameDate);
    const dayOfWeek = new Date(game.gameDate + 'T00:00:00')
        .toLocaleDateString('en-US', { weekday: 'short' });
    const dateDisplay = date;
    const timeDisplay = isFuture ? `${dayOfWeek}, ${formatGameTime(game.startTimeUTC)}` : '';

    // Scores
    const minScore = isMinHome ? game.homeTeam.score : game.awayTeam.score;
    const oppScore = isMinHome ? game.awayTeam.score : game.homeTeam.score;

    // Result
    const result = isPast ? getGameResult(game) : '';
    const resultClass = result.startsWith('W') ? 'game-win' :
                       result.startsWith('L') ? 'game-loss' : '';

    // Matchup with grid structure for alignment
    let matchup;
    if (isPast) {
        matchup = isMinHome
            ? `<span class="matchup-away-logo"><img src="/logos/${oppTeam.abbrev}_dark.svg" alt="${oppTeam.abbrev}" class="team-logo"></span><span class="matchup-away-team">${oppTeam.abbrev}</span><span class="matchup-away-score">${oppScore}</span><span class="matchup-at">@</span><span class="matchup-home-team">MIN</span><span class="matchup-home-score">${minScore}</span><span class="matchup-home-logo"><img src="/logos/MIN_dark.svg" alt="MIN" class="team-logo"></span><span class="matchup-result ${resultClass}">${result}</span>`
            : `<span class="matchup-away-logo"><img src="/logos/MIN_dark.svg" alt="MIN" class="team-logo"></span><span class="matchup-away-team">MIN</span><span class="matchup-away-score">${minScore}</span><span class="matchup-at">@</span><span class="matchup-home-team">${oppTeam.abbrev}</span><span class="matchup-home-score">${oppScore}</span><span class="matchup-home-logo"><img src="/logos/${oppTeam.abbrev}_dark.svg" alt="${oppTeam.abbrev}" class="team-logo"></span><span class="matchup-result ${resultClass}">${result}</span>`;
    } else {
        const oppPlayoffClass = playoffTeams.has(oppTeam.abbrev) ? 'opp-in-playoffs' : 'opp-out-playoffs';
        matchup = isMinHome
            ? `<span class="matchup-away-logo"><img src="/logos/${oppTeam.abbrev}_dark.svg" alt="${oppTeam.abbrev}" class="team-logo"></span><span class="matchup-away-team ${oppPlayoffClass}">${oppTeam.abbrev}</span><span class="matchup-at">@</span><span class="matchup-home-team">MIN</span><span class="matchup-home-logo"><img src="/logos/MIN_dark.svg" alt="MIN" class="team-logo"></span>`
            : `<span class="matchup-away-logo"><img src="/logos/MIN_dark.svg" alt="MIN" class="team-logo"></span><span class="matchup-away-team">MIN</span><span class="matchup-at">@</span><span class="matchup-home-team ${oppPlayoffClass}">${oppTeam.abbrev}</span><span class="matchup-home-logo"><img src="/logos/${oppTeam.abbrev}_dark.svg" alt="${oppTeam.abbrev}" class="team-logo"></span>`;
    }

    // TV
    const tvNetwork = getTVBroadcast(game);

    // Links
    let links = '';
    if (isPast && game.gameCenterLink) {
        links = `<a href="https://www.nhl.com${game.gameCenterLink}" target="_blank" rel="noopener" class="game-link">Recap ↗</a>`;
    } else if (isFuture && game.ticketsLink) {
        links = `<a href="${game.ticketsLink}" target="_blank" rel="noopener" class="game-link">Tickets ↗</a>`;
    }

    const homeAwayClass = isMinHome ? 'game-home' : 'game-away';

    const gameStateClass = isPast ? 'past-game' : 'future-game';

    return `
        <tr class="${resultClass} ${homeAwayClass}">
            <td>${dateDisplay}</td>
            <td>${timeDisplay}</td>
            <td class="matchup-cell ${gameStateClass}">${matchup}</td>
            <td class="hide-mobile">${tvNetwork}</td>
            <td class="hide-mobile center">${links}</td>
        </tr>
    `;
}
