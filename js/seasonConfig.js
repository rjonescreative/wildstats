// Season helpers shared by the frontend, server.js and Cloudflare Functions.
// Season IDs use the NHL API format: start year + end year, e.g. "20262027".

// The regular season expanded from 82 to 84 games starting with 2026-27.
const EXPANDED_SEASON_START_YEAR = 2026;
const LEGACY_SEASON_GAMES = 82;
const EXPANDED_SEASON_GAMES = 84;

// Playoff mode: turn on late in the season to show playoff-race stats
// (magic numbers on the dashboard and standings, opponent playoff position on the schedule).
export const PLAYOFF_MODE = false;

// Season rolls over in October (matches getCurrentSeasonStartYear in scripts/)
export function getCurrentSeasonStartYear(date = new Date()) {
    const year = date.getFullYear();
    return date.getMonth() + 1 >= 10 ? year : year - 1;
}

export function getCurrentSeason(date = new Date()) {
    const y = getCurrentSeasonStartYear(date);
    return `${y}${y + 1}`;
}

// Regular-season length for a season ID (string or number); defaults to the current season.
export function getSeasonGames(season = getCurrentSeason()) {
    const startYear = parseInt(String(season).slice(0, 4), 10);
    return startYear >= EXPANDED_SEASON_START_YEAR ? EXPANDED_SEASON_GAMES : LEGACY_SEASON_GAMES;
}

export function getPreviousSeason(season = getCurrentSeason()) {
    const startYear = parseInt(String(season).slice(0, 4), 10) - 1;
    return `${startYear}${startYear + 1}`;
}

// Display label for a season ID, e.g. "20262027" → "2026-27"
export function getSeasonLabel(season = getCurrentSeason()) {
    const s = String(season);
    return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
}
