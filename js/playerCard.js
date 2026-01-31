import { getCachedPlayerCard, setCachedPlayerCard, getCachedData } from './state.js';

// State
let hoverTimeout = null;
let currentPlayerId = null;
const pendingRequests = new Map();

// Initialize
export function init() {
    createCardContainer();
    setupEventListeners();
}

// Create single reusable card container
function createCardContainer() {
    const container = document.createElement('div');
    container.id = 'player-card-container';
    container.className = 'player-card-popup';
    document.body.appendChild(container);

    // Add close button click handler
    container.addEventListener('click', (e) => {
        if (e.target.closest('.player-card-close')) {
            e.stopPropagation();
            hidePlayerCard();
        }
    });
}

// Event delegation
function setupEventListeners() {
    document.addEventListener('click', handleClick, true);
}

// Click detection
function handleClick(e) {
    const trigger = e.target.closest('.player-hoverable');

    // If clicking on a player card trigger
    if (trigger) {
        e.preventDefault();
        e.stopPropagation();

        const playerId = trigger.dataset.playerId;

        // If clicking the same player, close the card
        if (currentPlayerId === playerId) {
            hidePlayerCard();
            return;
        }

        // Show card for this player
        showPlayerCard(playerId, e.clientX, e.clientY);
        return;
    }

    // If clicking outside the card and not on a trigger, close it
    const cardContainer = document.getElementById('player-card-container');
    if (cardContainer && !e.target.closest('#player-card-container')) {
        hidePlayerCard();
    }
}

// Show card
async function showPlayerCard(playerId, x, y) {
    currentPlayerId = playerId;

    const cardData = await fetchPlayerCardData(playerId);
    if (!cardData || currentPlayerId !== playerId) return;

    renderCard(cardData);
    positionCard(x, y);

    document.getElementById('player-card-container').classList.add('visible');
}

function hidePlayerCard() {
    document.getElementById('player-card-container').classList.remove('visible');
    currentPlayerId = null;
}

// Data fetching with caching and deduplication
async function fetchPlayerCardData(playerId) {
    // Check cache
    const cached = getCachedPlayerCard(playerId);
    if (cached) return cached;

    // Deduplicate concurrent requests
    if (pendingRequests.has(playerId)) {
        return pendingRequests.get(playerId);
    }

    // Fetch fresh data
    const promise = (async () => {
        try {
            const [detailsRes, gameLogRes] = await Promise.all([
                fetch(`/api/player/${playerId}/details`),
                fetch(`/api/player/${playerId}/game-log`)
            ]);

            // Check for HTTP errors
            if (!detailsRes.ok || !gameLogRes.ok) {
                console.error('API request failed:', {
                    details: detailsRes.status,
                    gameLog: gameLogRes.status
                });
                return null;
            }

            const [details, gameLog] = await Promise.all([
                detailsRes.json(),
                gameLogRes.json()
            ]);

            const cardData = processPlayerData(details, gameLog);
            setCachedPlayerCard(playerId, cardData);
            return cardData;
        } catch (error) {
            console.error('Error fetching player card:', error);
            return null;
        } finally {
            pendingRequests.delete(playerId);
        }
    })();

    pendingRequests.set(playerId, promise);
    return promise;
}

// Process API data
function processPlayerData(details, gameLog) {
    // Validate required data
    if (!details || !details.playerId) {
        throw new Error('Invalid player details data');
    }

    const games = gameLog?.gameLog || [];
    const recentGames = games.slice(0, 10);

    // Calculate stats
    const last10Stats = calculateStats(recentGames);

    // Detect streak
    const streak = detectPointStreak(recentGames);

    // Safe property access with defaults
    const firstName = details.firstName?.default || details.firstName || '';
    const lastName = details.lastName?.default || details.lastName || '';
    const isGoalie = details.position === 'G';

    // Get season stats - different paths for goalies vs skaters
    let seasonStats = {};
    let prevSeasonPoints = null;

    if (isGoalie && details.seasonTotals) {
        // For goalies, find current season in seasonTotals array
        const currentSeasonStats = details.seasonTotals
            .filter(s => s.leagueAbbrev === 'NHL' && s.gameTypeId === 2)
            .sort((a, b) => b.season - a.season)[0];

        if (currentSeasonStats) {
            seasonStats = {
                wins: currentSeasonStats.wins,
                losses: currentSeasonStats.losses,
                otLosses: currentSeasonStats.otLosses,
                goalsAgainstAverage: currentSeasonStats.goalsAgainstAvg,
                savePercentage: currentSeasonStats.savePctg,
                shutouts: currentSeasonStats.shutouts,
                gamesPlayed: currentSeasonStats.gamesPlayed,
                gamesStarted: currentSeasonStats.gamesStarted
            };
        }
    } else {
        // For skaters, use featuredStats
        seasonStats = details.featuredStats?.regularSeason?.subSeason || {};
    }

    // Get previous season points (for all players)
    if (details.seasonTotals) {
        const prevSeason = details.seasonTotals.find(
            s => s.season === 20242025 && s.leagueAbbrev === 'NHL' && s.gameTypeId === 2
        );
        if (prevSeason && prevSeason.points !== undefined) {
            prevSeasonPoints = prevSeason.points;
        }
    }

    return {
        playerId: details.playerId,
        name: `${firstName} ${lastName}`,
        number: details.sweaterNumber || '??',
        age: details.birthDate ? calculateAge(details.birthDate) : '??',
        nationality: details.birthCountry || 'Unknown',
        countryCode: getCountryCode(details.birthCountry),
        position: details.position || '??',
        teamAbbr: details.currentTeamAbbrev || 'MIN',
        headshot: details.headshot || '',
        seasonStats,
        last10Stats,
        streak,
        prevSeasonPoints,
        rankings: extractRankings(details),
        nhlUrl: `https://www.nhl.com/player/${details.playerId}`
    };
}

// Helper: Calculate stats from games
function calculateStats(games) {
    return games.reduce((acc, g) => ({
        goals: acc.goals + (g.goals || 0),
        assists: acc.assists + (g.assists || 0),
        points: acc.points + ((g.goals || 0) + (g.assists || 0))
    }), { goals: 0, assists: 0, points: 0 });
}

// Helper: Detect point streak
function detectPointStreak(games) {
    let streak = 0;
    for (const game of games) {
        if ((game.goals || 0) + (game.assists || 0) > 0) {
            streak++;
        } else {
            break;
        }
    }
    return streak >= 2 ? streak : null;
}

// Helper: Calculate age
function calculateAge(birthDate) {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// Helper: Country code mapping
const COUNTRY_CODES = {
    'CAN': 'ca', 'USA': 'us', 'SWE': 'se', 'FIN': 'fi', 'RUS': 'ru',
    'CZE': 'cz', 'SVK': 'sk', 'CHE': 'ch', 'DEU': 'de', 'DNK': 'dk',
    'NOR': 'no', 'AUT': 'at', 'FRA': 'fr', 'LVA': 'lv', 'SVN': 'si'
};

function getCountryCode(country) {
    return COUNTRY_CODES[country] || country?.toLowerCase().slice(0, 2) || 'ca';
}

// Position card near cursor
function positionCard(mouseX, mouseY) {
    const card = document.getElementById('player-card-container');
    const cardRect = card.getBoundingClientRect();
    const padding = 16;
    const offset = 12;

    let x = mouseX + offset;
    let y = mouseY + offset;

    // Adjust for viewport edges
    if (x + cardRect.width + padding > window.innerWidth) {
        x = mouseX - cardRect.width - offset;
    }
    if (y + cardRect.height + padding > window.innerHeight) {
        y = mouseY - cardRect.height - offset;
    }

    x = Math.max(padding, x);
    y = Math.max(padding, y);

    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
}

// Render card HTML
function renderCard(data) {
    const container = document.getElementById('player-card-container');
    container.innerHTML = generateCardHTML(data);
}

// Generate card HTML
function generateCardHTML(data) {
    const { seasonStats, last10Stats, streak, rankings, position } = data;
    const isGoalie = position === 'G';

    return `
        <button class="player-card-close" aria-label="Close">&times;</button>
        <div class="player-card-header" style="background-image: linear-gradient(135deg, rgba(2, 73, 48, 0.95), rgba(10, 10, 10, 0.9)), url('/logos/${data.teamAbbr}_dark.svg');">
            <img class="player-card-photo" src="${data.headshot}" alt="${data.name}">
            <div class="player-card-title">
                <div class="player-card-name-row">
                    <h3>${data.name}</h3>
                    <span class="player-card-number">#${data.number}</span>
                </div>
                <div class="player-card-meta">
                    <span class="player-card-position">${position}</span>
                    <span class="player-card-age">${data.age} yrs</span>
                    <img class="player-card-flag" src="https://flagcdn.com/16x12/${data.countryCode}.png" alt="${data.nationality}">
                    <span class="player-card-country">${data.nationality}</span>
                </div>
            </div>
        </div>

        <div class="player-card-stats">
            ${isGoalie ? `
            <div class="stat-row">
                <span class="stat-label">Record</span>
                <span class="stat-value">${seasonStats.wins || 0}-${seasonStats.losses || 0}-${seasonStats.otLosses || 0}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">GAA</span>
                <span class="stat-value">${seasonStats.goalsAgainstAverage != null ? seasonStats.goalsAgainstAverage.toFixed(2) : '--'}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">SV%</span>
                <span class="stat-value">${seasonStats.savePercentage != null ? seasonStats.savePercentage.toFixed(3) : '--'}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Shutouts</span>
                <span class="stat-value">${seasonStats.shutouts || 0}</span>
            </div>
            ` : `
            ${(() => {
                const seasonPPG = seasonStats.gamesPlayed > 0 ? seasonStats.points / seasonStats.gamesPlayed : 0;
                const last10Games = Math.min(10, seasonStats.gamesPlayed);
                const last10PPG = last10Games > 0 ? last10Stats.points / last10Games : 0;
                const ppgDiff = last10PPG - seasonPPG;
                const ppgClass = ppgDiff > 0 ? 'ppg-up' : ppgDiff < 0 ? 'ppg-down' : 'ppg-neutral';
                const ppgArrow = ppgDiff > 0 ? '↑' : ppgDiff < 0 ? '↓' : '';

                // Calculate 82-game pace
                const paceGoals = seasonStats.gamesPlayed > 0 ? Math.round((seasonStats.goals / seasonStats.gamesPlayed) * 82) : 0;
                const paceAssists = seasonStats.gamesPlayed > 0 ? Math.round((seasonStats.assists / seasonStats.gamesPlayed) * 82) : 0;
                const pacePoints = seasonStats.gamesPlayed > 0 ? Math.round((seasonStats.points / seasonStats.gamesPlayed) * 82) : 0;
                const pacePPG = pacePoints / 82;

                return `
            <table class="stat-table">
                <tbody>
                    <tr>
                        <td class="stat-label">Season</td>
                        <td class="stat-number">${seasonStats.goals || 0}</td>
                        <td class="stat-separator">-</td>
                        <td class="stat-number">${seasonStats.assists || 0}</td>
                        <td class="stat-separator">-</td>
                        <td class="stat-number">${seasonStats.points || 0}</td>
                        <td class="stat-ppg">${seasonPPG.toFixed(2)} PPG</td>
                    </tr>
                    <tr>
                        <td class="stat-label">Last 10</td>
                        <td class="stat-number">${last10Stats.goals}</td>
                        <td class="stat-separator">-</td>
                        <td class="stat-number">${last10Stats.assists}</td>
                        <td class="stat-separator">-</td>
                        <td class="stat-number">${last10Stats.points}</td>
                        <td class="stat-ppg ${ppgClass}">${last10PPG.toFixed(2)} PPG ${ppgArrow}</td>
                    </tr>
                    <tr>
                        <td class="stat-label">Pace/82</td>
                        <td class="stat-number">${paceGoals}</td>
                        <td class="stat-separator">-</td>
                        <td class="stat-number">${paceAssists}</td>
                        <td class="stat-separator">-</td>
                        <td class="stat-number">${pacePoints}</td>
                        <td class="stat-ppg">${data.prevSeasonPoints !== null ? `${data.prevSeasonPoints} prev` : ''}</td>
                    </tr>
                    ${streak ? `
                    <tr class="stat-streak">
                        <td class="stat-label">Streak</td>
                        <td colspan="6" class="stat-streak-value">${streak} game point streak</td>
                    </tr>` : ''}
                </tbody>
            </table>
                `;
            })()}
            `}
        </div>

        ${rankings && rankings.length > 0 ? `
        <div class="player-card-rankings">
            <div class="rankings-header">League Rankings</div>
            ${rankings.map(r => `<span class="ranking-badge">#${r.rank} in ${r.category}</span>`).join('')}
        </div>` : ''}

        <a class="player-card-link" href="${data.nhlUrl}" target="_blank" rel="noopener noreferrer">
            View on NHL.com →
        </a>
    `;
}

// Extract league rankings
function extractRankings(details) {
    const rankings = [];
    const leagueLeaders = getCachedData('leagueLeaders');

    if (!leagueLeaders || !details.playerId) {
        return rankings;
    }

    const isGoalie = details.position === 'G';

    // Map of category names to display labels
    const skaterCategories = {
        'goals': 'Goals',
        'assists': 'Assists',
        'points': 'Points',
        'plusMinus': 'Plus/Minus'
    };

    const goalieCategories = {
        'wins': 'Wins',
        'savePctg': 'Save %',
        'goalsAgainstAverage': 'GAA',
        'shutouts': 'Shutouts'
    };

    const categories = isGoalie ? goalieCategories : skaterCategories;

    // Check each category
    Object.entries(categories).forEach(([category, label]) => {
        const categoryData = leagueLeaders[category]?.[category];
        if (!Array.isArray(categoryData)) return;

        // Find player in top 25
        const playerIndex = categoryData.findIndex(leader => leader.id === details.playerId);
        if (playerIndex !== -1 && playerIndex < 25) {
            const playerValue = categoryData[playerIndex].value;

            // Check for ties
            const playersWithSameValue = categoryData.filter(leader => leader.value === playerValue);
            const isTied = playersWithSameValue.length > 1;
            const rank = categoryData.findIndex(leader => leader.value === playerValue) + 1;

            rankings.push({
                rank: isTied ? `T${rank}` : rank,
                category: label,
                value: playerValue
            });
        }
    });

    return rankings;
}

// Cleanup
export function cleanup() {
    const container = document.getElementById('player-card-container');
    container?.remove();
}
