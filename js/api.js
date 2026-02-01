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

// Get Wild news from The Athletic
export async function getNews(forceRefresh = false) {
    return fetchWithCache('/api/news/wild', 'news', forceRefresh);
}

// Get live game data (no caching - always fresh)
export async function getLiveGame(gameId) {
    const response = await fetch(`/api/game/${gameId}/live`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}
