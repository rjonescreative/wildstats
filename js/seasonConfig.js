// Season helpers shared by the frontend, server.js and Cloudflare Functions.
// Season IDs use the NHL API format: start year + end year, e.g. "20262027".

// The regular season expanded from 82 to 84 games starting with 2026-27.
const EXPANDED_SEASON_START_YEAR = 2026;
const LEGACY_SEASON_GAMES = 82;
const EXPANDED_SEASON_GAMES = 84;

// Playoff mode: turn on late in the season to show playoff-race stats
// (magic numbers on the dashboard and standings, opponent playoff position on the schedule,
// Record vs Playoff Teams on the current season stats page) and the Standings > Playoffs bracket tab.
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

// Playoffs are named for the year the season ends, e.g. "20262027" → "2027"
export function getPlayoffYear(season = getCurrentSeason()) {
    return String(season).slice(4, 8);
}

// Every completed Wild season, newest first (2000-01 onward, skipping the 2004-05 lockout)
export function getPastSeasons(current = getCurrentSeason()) {
    const seasons = [];
    for (let y = Number(String(current).slice(0, 4)) - 1; y >= 2000; y--) {
        if (y === 2004) continue;
        seasons.push(`${y}${y + 1}`);
    }
    return seasons;
}

// Season ID from a display label, e.g. "2025-26" → "20252026" (null if malformed)
export function seasonFromLabel(label) {
    const m = String(label).match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const start = Number(m[1]);
    return String(start + 1).slice(2) === m[2] ? `${start}${start + 1}` : null;
}
