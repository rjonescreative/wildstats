// API module with caching
import { isCacheValid, getCachedData, setCachedData } from './state.js';

// Generic fetch with caching
async function fetchWithCache(url, cacheKey, forceRefresh = false) {
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && isCacheValid(cacheKey)) {
        return getCachedData(cacheKey);
    }

    // Fetch fresh data
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Cache the data
        setCachedData(cacheKey, data);

        return data;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);

        // Try to return stale cache on error
        const cached = getCachedData(cacheKey);
        if (cached) {
            console.warn(`Using stale cache for ${cacheKey}`);
            return cached;
        }

        throw error;
    }
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

// Get Wild news from multiple sources (supports pagination)
export async function getNews(offset = 0, limit = 6) {
    // News pagination doesn't use cache - each page is a separate request
    const response = await fetch(`/api/news/wild?offset=${offset}&limit=${limit}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
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
    const response = await fetch(`/api/h2h/${opponentAbbrev}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

// Get Wild videos (supports pagination and filtering)
export async function getVideos(offset = 0, limit = 12, type = 'all') {
    const response = await fetch(`/api/media/videos?offset=${offset}&limit=${limit}&type=${type}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}
