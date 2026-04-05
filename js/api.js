// API module with caching
import { isCacheValid, getCachedData, setCachedData } from './state.js';

// Fetch with automatic retry + exponential backoff.
// Retries on network errors, 5xx responses, and 429 rate-limit responses.
// Other 4xx errors are not retried (bad request, not transient).
async function fetchWithRetry(url, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url);
            // Retry on rate-limit or server errors
            if (response.status === 429 || response.status >= 500) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            if (!response.ok) {
                // Other 4xx — don't retry
                throw Object.assign(new Error(`HTTP error! status: ${response.status}`), { permanent: true });
            }
            return response;
        } catch (err) {
            lastError = err;
            if (err.permanent) throw err; // don't retry permanent errors
            // Don't wait after the last attempt
            if (attempt < maxAttempts) {
                await new Promise(r => setTimeout(r, attempt * 1000));
            }
        }
    }
    throw lastError;
}

// Tracks in-flight requests by cache key so concurrent callers share one fetch.
const inFlight = new Map();

// Generic fetch with caching
async function fetchWithCache(url, cacheKey, forceRefresh = false) {
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && isCacheValid(cacheKey)) {
        return getCachedData(cacheKey);
    }

    // If a request for this key is already in flight, wait for it instead of
    // firing a duplicate (fixes concurrent callers all missing an empty cache).
    if (inFlight.has(cacheKey)) {
        return inFlight.get(cacheKey);
    }

    // Fetch fresh data (with retry)
    const promise = (async () => {
        try {
            const response = await fetchWithRetry(url);
            const data = await response.json();
            setCachedData(cacheKey, data);
            return data;
        } catch (error) {
            console.error(`Error fetching ${url}:`, error);
            const cached = getCachedData(cacheKey);
            if (cached) {
                console.warn(`Using stale cache for ${cacheKey}`);
                return cached;
            }
            throw error;
        } finally {
            inFlight.delete(cacheKey);
        }
    })();

    inFlight.set(cacheKey, promise);
    return promise;
}

// Get NHL standings
export async function getStandings(forceRefresh = false) {
    return fetchWithCache('/api/standings/now', 'standings', forceRefresh);
}

// Get Wild team stats
export async function getWildStats(forceRefresh = false) {
    return fetchWithCache('/api/wild/stats', 'wildStats', forceRefresh);
}

// Get league leaders
export async function getLeagueLeaders(forceRefresh = false) {
    return fetchWithCache('/api/league/leaders', 'leagueLeaders', forceRefresh);
}

// Get Minnesota Wild schedule
export async function getSchedule(season = '20252026', forceRefresh = false) {
    return fetchWithCache(`/api/schedule/${season}`, `schedule_${season}`, forceRefresh);
}

// Get any team's schedule (used for multi-team points chart)
export async function getTeamSchedule(team, season = '20252026', forceRefresh = false) {
    return fetchWithCache(`/api/team-schedule/${team}/${season}`, `schedule_${team}_${season}`, forceRefresh);
}

// Fetches all 32 team schedules in a single server-side aggregated request.
// Returns { [abbrev]: games[] } with chart-only fields stripped server-side.
// Use this instead of 32 individual getTeamSchedule() calls.
export async function getAllTeamSchedules(season = '20252026', forceRefresh = false) {
    return fetchWithCache(`/api/all-team-schedules/${season}`, `allTeamSchedules_${season}`, forceRefresh);
}

// Get Wild news from multiple sources (supports pagination)
export async function getNews(offset = 0, limit = 6) {
    // News pagination doesn't use cache - each page is a separate request
    const response = await fetchWithRetry(`/api/news/wild?offset=${offset}&limit=${limit}`);
    return response.json();
}

// Get live game data (no caching - always fresh)
export async function getLiveGame(gameId) {
    const response = await fetch(`/api/game/${gameId}/live`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

// Get pre-aggregated H2H data for a given opponent (served from R2)
export async function getH2HData(opponentAbbrev) {
    const response = await fetchWithRetry(`/api/h2h/${opponentAbbrev}`);
    return response.json();
}

// Get franchise milestone / all-time leaders data
export async function getMilestones(forceRefresh = false) {
    return fetchWithCache('/api/milestones/leaders', 'milestones', forceRefresh);
}

// Get Wild season breakdown — period scores per game (for situational/period analytics)
export async function getWildSeasonBreakdown(forceRefresh = false) {
    return fetchWithCache('/api/wild/season-breakdown', 'wildSeasonBreakdown', forceRefresh);
}

// Get all-team career totals for current Wild roster (playerId → { gamesPlayed, goals, assists, points })
export async function getCareerTotals(forceRefresh = false) {
    return fetchWithCache('/api/milestones/career-totals', 'careerTotals', forceRefresh);
}

// Get NHL playoff bracket
export async function getPlayoffBracket(season = '2026', forceRefresh = false) {
    return fetchWithCache(`/api/playoff-bracket/${season}`, `playoffBracket_${season}`, forceRefresh);
}

// Get Wild videos (supports pagination and filtering)
export async function getVideos(offset = 0, limit = 12, type = 'all') {
    const response = await fetchWithRetry(`/api/media/videos?offset=${offset}&limit=${limit}&type=${type}`);
    return response.json();
}
