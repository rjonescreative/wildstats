// API module with caching
import { isCacheValid, getCachedData, setCachedData } from './state.js';

// Detect environment: use proxy in dev, direct API in production
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isDev ? '/api' : 'https://api-web.nhle.com/v1';

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
    const url = isDev ? `${API_BASE}/standings/now` : `${API_BASE}/standings/now`;
    return fetchWithCache(url, 'standings', forceRefresh);
}

// Get Wild team stats
export async function getWildStats(forceRefresh = false) {
    const url = isDev ? `${API_BASE}/wild/stats` : `${API_BASE}/club-stats/MIN/now`;
    return fetchWithCache(url, 'wildStats', forceRefresh);
}

// Get league leaders
export async function getLeagueLeaders(forceRefresh = false) {
    if (isDev) {
        // Use proxy endpoint in development
        return fetchWithCache(`${API_BASE}/league/leaders`, 'leagueLeaders', forceRefresh);
    } else {
        // Call NHL API directly in production
        // Fetch all three categories and combine them
        const cacheKey = 'leagueLeaders';

        if (!forceRefresh && isCacheValid(cacheKey)) {
            return getCachedData(cacheKey);
        }

        try {
            const [goalsRes, assistsRes, pointsRes] = await Promise.all([
                fetch(`${API_BASE}/skater-stats-leaders/20252026/2?categories=goals&limit=100`),
                fetch(`${API_BASE}/skater-stats-leaders/20252026/2?categories=assists&limit=100`),
                fetch(`${API_BASE}/skater-stats-leaders/20252026/2?categories=points&limit=100`)
            ]);

            const goals = await goalsRes.json();
            const assists = await assistsRes.json();
            const points = await pointsRes.json();

            const data = { goals, assists, points };
            setCachedData(cacheKey, data);
            return data;
        } catch (error) {
            console.error('Error fetching league leaders:', error);
            const cached = getCachedData(cacheKey);
            if (cached) {
                console.warn(`Using stale cache for ${cacheKey}`);
                return cached;
            }
            throw error;
        }
    }
}
