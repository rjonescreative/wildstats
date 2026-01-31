// Centralized application state with caching
const TTL = 5 * 60 * 1000; // 5 minutes

const state = {
    cache: {
        standings: { data: null, timestamp: null },
        wildStats: { data: null, timestamp: null },
        leagueLeaders: { data: null, timestamp: null },
        schedule_20252026: { data: null, timestamp: null },
        playerCards: new Map() // Map<playerId, { data, timestamp }>
    },
    ui: {
        currentView: 'dashboard',
        dashboard: {
            sortBy: 'points',
            sortDirection: 'desc'
        },
        stats: {
            skaterSort: 'points',
            skaterSortDirection: 'desc',
            goalieSort: 'goalsAgainstAverage',
            goalieSortDirection: 'asc'
        },
        standings: {
            currentView: 'wildcard',
            sortBy: 'points',
            sortDirection: 'desc'
        },
        schedule: {
            filterType: 'all',
            showPreseason: false,
            hidePastGames: false
        }
    }
};

// Check if cached data is still valid
export function isCacheValid(cacheKey) {
    const cached = state.cache[cacheKey];
    if (!cached || !cached.data || !cached.timestamp) {
        return false;
    }
    return (Date.now() - cached.timestamp) < TTL;
}

// Get cached data
export function getCachedData(cacheKey) {
    return state.cache[cacheKey]?.data || null;
}

// Set cached data
export function setCachedData(cacheKey, data) {
    state.cache[cacheKey] = {
        data: data,
        timestamp: Date.now()
    };
}

// Clear specific cache
export function clearCache(cacheKey) {
    if (cacheKey) {
        state.cache[cacheKey] = { data: null, timestamp: null };
    } else {
        // Clear all caches
        Object.keys(state.cache).forEach(key => {
            state.cache[key] = { data: null, timestamp: null };
        });
    }
}

// Get UI state
export function getUIState(view) {
    return state.ui[view] || {};
}

// Set UI state
export function setUIState(view, updates) {
    state.ui[view] = { ...state.ui[view], ...updates };
}

// Get current view
export function getCurrentView() {
    return state.ui.currentView;
}

// Set current view
export function setCurrentView(view) {
    state.ui.currentView = view;
}

// Cache helpers for player cards
export function getCachedPlayerCard(playerId) {
    const cached = state.cache.playerCards.get(playerId);
    if (!cached) return null;

    const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
    if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    state.cache.playerCards.delete(playerId);
    return null;
}

export function setCachedPlayerCard(playerId, data) {
    state.cache.playerCards.set(playerId, {
        data,
        timestamp: Date.now()
    });

    // LRU: limit cache size to 50 players
    if (state.cache.playerCards.size > 50) {
        const firstKey = state.cache.playerCards.keys().next().value;
        state.cache.playerCards.delete(firstKey);
    }
}

export default state;
