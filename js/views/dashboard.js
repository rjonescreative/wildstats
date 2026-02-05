// Dashboard view module
import { getStandings, getWildStats, getLeagueLeaders, getSchedule, getNews, getVideos, getLiveGame } from '../api.js';
import { getUIState, setUIState } from '../state.js';
import { trackTableSort, trackNewsClick } from '../analytics.js';

let standingsData = null;
let leagueLeaders = null;
let scheduleData = null;
let liveGameData = null;
let liveGameInterval = null;
let currentLiveGameId = null;
let newsArticles = [];
let newsHasMore = false;
let newsOffset = 0;

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

export async function init() {
    try {
        // Fetch data (cached if available)
        const [standings, wildData, leaders, schedule] = await Promise.all([
            getStandings(),
            getWildStats(),
            getLeagueLeaders(),
            getSchedule('20252026')
        ]);

        standingsData = standings;
        leagueLeaders = leaders;
        scheduleData = schedule;

        // Render views
        renderGames();
        renderStatLeaders(wildData);
        renderCentralDivision();

        // News fetched independently so a failure doesn't block the dashboard
        // Reset news state and load initial articles
        newsArticles = [];
        newsOffset = 0;
        newsHasMore = false;
        loadNews(true);

        // Load highlights independently
        loadHighlights();
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
    // Stop live game polling when leaving dashboard
    if (liveGameInterval) {
        clearInterval(liveGameInterval);
        liveGameInterval = null;
    }
    currentLiveGameId = null;
}

async function renderGames() {
    if (!scheduleData || !scheduleData.games) {
        document.getElementById('dashboard-games').innerHTML =
            '<div class="loading">Loading games...</div>';
        return;
    }

    // Filter to regular season games only
    const regularSeasonGames = scheduleData.games.filter(g => g.gameType === 2);

    // Find last game (most recent completed game)
    const completedGames = regularSeasonGames.filter(g =>
        g.gameState === 'FINAL' || g.gameState === 'OFF'
    );
    const lastGame = completedGames[completedGames.length - 1];

    // Find current/next games
    const futureGames = regularSeasonGames.filter(g =>
        g.gameState === 'FUT' || g.gameState === 'LIVE' || g.gameState === 'CRIT'
    );
    const currentOrNextGame = futureGames[0];
    const upcomingGame = futureGames[1];

    // Fetch live game data if there's a live or starting game
    liveGameData = null;
    if (currentOrNextGame && (currentOrNextGame.gameState === 'LIVE' || currentOrNextGame.gameState === 'CRIT')) {
        currentLiveGameId = currentOrNextGame.id;
        try {
            liveGameData = await getLiveGame(currentOrNextGame.id);
        } catch (error) {
            console.error('Error fetching live game data:', error);
        }

        // Start polling for live updates (every 10 seconds)
        startLiveGamePolling(currentOrNextGame);
    } else {
        // No live game, stop any existing polling
        if (liveGameInterval) {
            clearInterval(liveGameInterval);
            liveGameInterval = null;
        }
        currentLiveGameId = null;
    }

    const gamesHtml = `
        <div class="games-grid">
            ${lastGame ? renderGameCard('Last', lastGame, true, false) : '<div class="game-card"><div class="loading">No games played yet</div></div>'}
            ${currentOrNextGame ? renderGameCard((currentOrNextGame.gameState === 'LIVE' || currentOrNextGame.gameState === 'CRIT') ? 'Current' : 'Next', currentOrNextGame, false, currentOrNextGame.gameState === 'LIVE' || currentOrNextGame.gameState === 'CRIT') : '<div class="game-card"><div class="loading">No upcoming games</div></div>'}
            ${upcomingGame ? renderGameCard('Upcoming', upcomingGame, false, false) : '<div class="game-card"><div class="loading">No games scheduled</div></div>'}
        </div>
        <div class="section-footer">
            <a href="/schedule" class="text-link" data-link>View full schedule →</a>
        </div>
    `;

    document.getElementById('dashboard-games').innerHTML = gamesHtml;
}

function startLiveGamePolling(game) {
    // Clear any existing interval
    if (liveGameInterval) {
        clearInterval(liveGameInterval);
    }

    // Poll every 10 seconds
    liveGameInterval = setInterval(async () => {
        if (!currentLiveGameId) {
            clearInterval(liveGameInterval);
            liveGameInterval = null;
            return;
        }

        try {
            const newData = await getLiveGame(currentLiveGameId);

            // Update the live game data and refresh just the live card
            liveGameData = newData;
            updateLiveGameCard(game);

            // Check if game has ended
            if (newData.gameState !== 'LIVE' && newData.gameState !== 'CRIT') {
                clearInterval(liveGameInterval);
                liveGameInterval = null;
                currentLiveGameId = null;
                // Refresh the full games section after a delay to show Final state
                setTimeout(() => renderGames(), 5000);
            }
        } catch (error) {
            console.error('Error polling live game:', error);
        }
    }, 10000);
}

function updateLiveGameCard(game) {
    const liveCard = document.querySelector('.games-grid > .game-card:nth-child(2)');
    if (!liveCard || !liveGameData) return;

    const isMinHome = game.homeTeam.abbrev === 'MIN';

    // Update scores
    const awayScore = liveGameData.awayTeam?.score ?? 0;
    const homeScore = liveGameData.homeTeam?.score ?? 0;

    const teamAbbrevs = liveCard.querySelectorAll('.team-abbrev');
    if (teamAbbrevs.length >= 2) {
        teamAbbrevs[0].textContent = `${isMinHome ? game.awayTeam.abbrev : 'MIN'} ${isMinHome ? awayScore : (isMinHome ? homeScore : awayScore)}`;
        teamAbbrevs[1].textContent = `${isMinHome ? 'MIN' : game.homeTeam.abbrev} ${isMinHome ? homeScore : (isMinHome ? awayScore : homeScore)}`;

        // Fix: correctly assign scores based on position
        teamAbbrevs[0].textContent = `${isMinHome ? game.awayTeam.abbrev : 'MIN'} ${awayScore}`;
        teamAbbrevs[1].textContent = `${isMinHome ? 'MIN' : game.homeTeam.abbrev} ${homeScore}`;
    }

    // Update period and time
    let liveInfo = liveCard.querySelector('.live-game-info');
    if (!liveInfo) {
        liveInfo = document.createElement('div');
        liveInfo.className = 'live-game-info';
        liveCard.appendChild(liveInfo);
    }

    const period = liveGameData.period;
    const clock = liveGameData.clock;
    const isGameOver = liveGameData.gameState === 'FINAL' || liveGameData.gameState === 'OFF';

    let periodStr = '';
    let timeRemaining = '';

    if (isGameOver) {
        // Game has ended - show Final with OT/SO if applicable
        periodStr = 'Final';
        if (period?.periodType === 'OT') {
            timeRemaining = 'OT';
        } else if (period?.periodType === 'SO') {
            timeRemaining = 'SO';
        }
    } else {
        // Game is still live
        if (period) {
            if (period.periodType === 'REG') {
                const ordinals = ['1ST', '2ND', '3RD'];
                periodStr = ordinals[period.number - 1] || `${period.number}TH`;
            } else if (period.periodType === 'OT') {
                periodStr = period.number === 4 ? 'OT' : `OT${period.number - 3}`;
            } else if (period.periodType === 'SO') {
                periodStr = 'SO';
            }
        }

        timeRemaining = clock?.timeRemaining || '';
        if (clock?.inIntermission) {
            timeRemaining = 'INT';
        }
    }

    const liveLink = isGameOver ? '' : (game.gameCenterLink ? `<a href="https://www.nhl.com${game.gameCenterLink}" target="_blank" rel="noopener" class="game-link live-link">Live ↗</a>` : '');
    liveInfo.innerHTML = `<span class="live-status"><span class="period-badge">${periodStr}</span>${timeRemaining ? ` <span class="time-remaining">${timeRemaining}</span>` : ''}</span>${liveLink}`;
}

function renderGameCard(label, game, isPast, isLive) {
    const isMinHome = game.homeTeam.abbrev === 'MIN';
    const oppTeam = isMinHome ? game.awayTeam : game.homeTeam;

    // Format date
    const gameDate = new Date(game.gameDate + 'T00:00:00');
    const dateStr = gameDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });

    // Format time for future games
    let timeStr = '';
    if (!isPast && !isLive && game.startTimeUTC) {
        const time = new Date(game.startTimeUTC);
        timeStr = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZoneName: 'short'
        }).format(time);
    }

    // Get scores and result for past games
    let awayScore = '';
    let homeScore = '';
    let resultText = '';
    let resultClass = '';
    let liveInfo = '';

    if (isPast) {
        const minScore = isMinHome ? game.homeTeam.score : game.awayTeam.score;
        const oppScore = isMinHome ? game.awayTeam.score : game.homeTeam.score;
        awayScore = ` ${isMinHome ? oppScore : minScore}`;
        homeScore = ` ${isMinHome ? minScore : oppScore}`;

        const didWin = minScore > oppScore;
        const periodType = game.periodDescriptor?.periodType || 'REG';

        resultClass = didWin ? 'game-win' : 'game-loss';
        let resultLabel = didWin ? 'W' : 'L';
        if (periodType === 'OT') resultLabel += ' (OT)';
        if (periodType === 'SO') resultLabel += ' (SO)';
        resultText = `<span class="${resultClass}">${resultLabel}</span>`;
    } else if (isLive && liveGameData) {
        // Show live score (no color highlighting)
        awayScore = ` ${liveGameData.awayTeam?.score ?? 0}`;
        homeScore = ` ${liveGameData.homeTeam?.score ?? 0}`;

        // Format period and time
        const period = liveGameData.period;
        const clock = liveGameData.clock;
        let periodStr = '';
        if (period) {
            if (period.periodType === 'REG') {
                const ordinals = ['1ST', '2ND', '3RD'];
                periodStr = ordinals[period.number - 1] || `${period.number}TH`;
            } else if (period.periodType === 'OT') {
                periodStr = period.number === 4 ? 'OT' : `OT${period.number - 3}`;
            } else if (period.periodType === 'SO') {
                periodStr = 'SO';
            }
        }

        let timeRemaining = clock?.timeRemaining || '';
        if (clock?.inIntermission) {
            timeRemaining = 'INT';
        }

        const liveLink = game.gameCenterLink ? `<a href="https://www.nhl.com${game.gameCenterLink}" target="_blank" rel="noopener" class="game-link live-link">Live ↗</a>` : '';
        liveInfo = `<div class="live-game-info"><span class="live-status"><span class="period-badge">${periodStr}</span> <span class="time-remaining">${timeRemaining}</span></span>${liveLink}</div>`;
    }

    return `
        <div class="game-card ${resultClass}">
            <div class="game-label">${label} • ${dateStr}${timeStr ? ' • ' + timeStr : ''}${resultText ? ' • ' + resultText : ''}</div>
            <div class="game-matchup">
                <div class="team-display ${isMinHome ? 'opponent-team' : 'wild-team'}">
                    <img src="/logos/${isMinHome ? oppTeam.abbrev : 'MIN'}_dark.svg" alt="${isMinHome ? oppTeam.abbrev : 'MIN'}" class="game-team-logo">
                    <div class="team-abbrev">${isMinHome ? oppTeam.abbrev : 'MIN'}${awayScore}</div>
                </div>
                <div class="game-at">@</div>
                <div class="team-display ${isMinHome ? 'wild-team' : 'opponent-team'}">
                    <img src="/logos/${isMinHome ? 'MIN' : oppTeam.abbrev}_dark.svg" alt="${isMinHome ? 'MIN' : oppTeam.abbrev}" class="game-team-logo">
                    <div class="team-abbrev">${isMinHome ? 'MIN' : oppTeam.abbrev}${homeScore}</div>
                </div>
            </div>
            ${liveInfo}
        </div>
    `;
}

async function loadNews(initial = false) {
    const container = document.getElementById('news-section');
    const limit = 6;

    if (initial) {
        container.innerHTML = '<div class="loading">Loading news...</div>';
    }

    try {
        const data = await getNews(newsOffset, limit);
        newsArticles = initial ? data.articles : [...newsArticles, ...data.articles];
        newsHasMore = data.hasMore;
        newsOffset += data.articles.length;
        renderNews();
    } catch (error) {
        console.error('Error loading news:', error);
        if (initial) {
            container.innerHTML = '';
        }
    }
}

function renderNews() {
    const container = document.getElementById('news-section');
    if (!newsArticles || newsArticles.length === 0) {
        container.innerHTML = '<div class="loading">No news available.</div>';
        return;
    }

    container.innerHTML = `
        <div class="news-grid">
            ${newsArticles.map(article => `
                <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="news-card" data-news-title="${article.title.replace(/"/g, '&quot;')}">
                    <img src="${article.image}" alt="${article.title}" class="news-card-image">
                    <div class="news-card-title">${article.title}</div>
                    <div class="news-card-source">${article.source} ↗</div>
                </a>
            `).join('')}
        </div>
        ${newsHasMore ? `
            <div class="news-more-container">
                <button class="news-more-btn" id="load-more-news">More</button>
            </div>
        ` : ''}
    `;

    // Add click tracking for news articles
    container.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', () => {
            trackNewsClick(card.dataset.newsTitle);
        });
    });

    // Add load more handler
    const loadMoreBtn = document.getElementById('load-more-news');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', async () => {
            loadMoreBtn.disabled = true;
            loadMoreBtn.textContent = 'Loading...';
            await loadNews(false);
        });
    }
}

async function loadHighlights() {
    const container = document.getElementById('highlights-section');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading highlights...</div>';

    try {
        const data = await getVideos(0, 3, 'highlights');
        renderHighlights(data.videos);
    } catch (error) {
        console.error('Error loading highlights:', error);
        container.innerHTML = '';
    }
}

function formatDuration(duration) {
    if (!duration) return '';
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

function renderHighlights(videos) {
    const container = document.getElementById('highlights-section');
    if (!container || !videos || videos.length === 0) {
        if (container) container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="highlights-grid">
            ${videos.map(video => `
                <div class="highlight-card" data-brightcove-id="${video.brightcoveId}" data-account-id="${video.brightcoveAccountId}">
                    <div class="highlight-thumbnail-container">
                        <img src="${video.thumbnail}" alt="${video.title}" class="highlight-thumbnail">
                        <div class="highlight-play-overlay">
                            <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        </div>
                        ${video.duration ? `<span class="video-duration">${formatDuration(video.duration)}</span>` : ''}
                    </div>
                    <div class="highlight-title">${video.title}</div>
                </div>
            `).join('')}
        </div>
        <div class="section-footer">
            <a href="/media" class="text-link" data-link>View all media →</a>
        </div>
    `;

    // Add click handlers for video cards
    container.querySelectorAll('.highlight-card').forEach(card => {
        card.addEventListener('click', () => {
            const brightcoveId = card.dataset.brightcoveId;
            const accountId = card.dataset.accountId;
            if (brightcoveId) {
                openHighlightModal(brightcoveId, accountId);
            }
        });
    });
}

function openHighlightModal(brightcoveId, accountId) {
    // Remove existing modal if any
    closeHighlightModal();

    const modal = document.createElement('div');
    modal.className = 'video-modal';
    modal.innerHTML = `
        <div class="video-modal-backdrop"></div>
        <div class="video-modal-content">
            <button class="video-modal-close">&times;</button>
            <div class="video-player-container">
                <iframe
                    src="https://players.brightcove.net/${accountId}/EXtG1xJ7H_default/index.html?videoId=${brightcoveId}"
                    allowfullscreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    class="video-player-iframe"
                ></iframe>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        modal.classList.add('visible');
    });

    modal.querySelector('.video-modal-backdrop').addEventListener('click', closeHighlightModal);
    modal.querySelector('.video-modal-close').addEventListener('click', closeHighlightModal);
    document.addEventListener('keydown', handleHighlightEscapeKey);
}

function handleHighlightEscapeKey(e) {
    if (e.key === 'Escape') {
        closeHighlightModal();
    }
}

function closeHighlightModal() {
    const modal = document.querySelector('.video-modal');
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 200);
    }
    document.removeEventListener('keydown', handleHighlightEscapeKey);
}

function setupSortListeners() {
    document.querySelectorAll('#central-standings .sortable').forEach(header => {
        header.addEventListener('click', (e) => {
            const field = e.currentTarget.dataset.sort;
            const state = getUIState('dashboard');

            // Don't do anything if already sorted by this field
            if (state.sortBy === field) {
                return;
            }

            state.sortBy = field;
            state.sortDirection = 'desc';

            // Track table sort
            trackTableSort('central-standings', field);

            setUIState('dashboard', state);
            renderCentralDivision();
        });
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

    // Find the last team in playoff position (for cutoff line)
    // Only show cutoff line when sorting by points
    let lastPlayoffTeamId = null;
    if (state.sortBy === 'points') {
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
                    <th class="center" data-tooltip="Magic/Tragic Numbers">M#</th>
                </tr>
            </thead>
            <tbody>
                ${teams.map((team, index) => {
                    const isWild = team.teamAbbrev.default === 'MIN';
                    const rank = index + 1;
                    const streakClass = team.streakCount > 2 ? (team.streakCode === 'W' ? 'streak-W' : 'streak-L') : '';
                    const diffClass = team.goalDifferential > 0 ? 'diff-positive' : team.goalDifferential < 0 ? 'diff-negative' : '';

                    // Calculate magic/tragic number
                    const conferenceTeams = standingsData.standings.filter(t => t.conferenceName === team.conferenceName);
                    const magicNumber = calculateMagicNumber(team, conferenceTeams);
                    let magicDisplay = '';
                    if (magicNumber) {
                        const className = magicNumber.type === 'magic' ? 'magic-number' : 'tragic-number';
                        magicDisplay = `<span class="${className}">${magicNumber.value}</span>`;
                    }

                    // Determine if playoff cutoff line should be added after this team
                    // Show cutoff after the last team that's in a playoff position
                    const showCutoff = lastPlayoffTeamId && team.teamAbbrev.default === lastPlayoffTeamId;

                    const row = `
                        <tr class="${isWild ? 'wild-highlight' : ''}">
                            <td class="center rank">${rank}</td>
                            <td class="team-name">
                                <img src="/logos/${team.teamAbbrev.default}_dark.svg" alt="${team.teamAbbrev.default}" class="team-logo">
                                <a href="https://www.nhl.com/${TEAM_SLUGS[team.teamAbbrev.default] || team.teamAbbrev.default.toLowerCase()}/" target="_blank" rel="noopener noreferrer" class="team-link">
                                    <span class="team-full-name">${team.teamName.default}</span>
                                    <span class="team-abbrev-text">${team.teamAbbrev.default}</span>
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
                            <td class="center">${magicDisplay}</td>
                        </tr>
                    `;

                    const cutoffLine = showCutoff ? '<tr class="playoff-cutoff"><td colspan="16"></td></tr>' : '';
                    return row + cutoffLine;
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
            <div class="leader-row player-hoverable" data-player-id="${player.playerId}">
                <span class="leader-rank">${index + 1}</span>
                <div class="leader-player">
                    <img src="${player.headshot}" alt="${firstInitial}. ${lastName}" class="player-photo-small">
                    <span class="leader-name">${firstInitial}. ${lastName}</span>
                </div>
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
