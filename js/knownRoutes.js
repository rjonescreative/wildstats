// Which page URLs exist. Shared by the browser router (shows the not-found view),
// the Cloudflare route function and the local Express server (both answer 404 for anything else).
import { NHL_TEAMS } from './teams.js';
import { getPastSeasons, getSeasonLabel, seasonFromLabel } from './seasonConfig.js';
import { parseTeamRecordsPath } from './teamRecordsMeta.js';

const STATIC_ROUTES = new Set([
    '/',
    '/stats', '/stats/season', '/stats/head-to-head', '/stats/team-records', '/stats/milestones', '/stats/numbers',
    '/standings', '/standings/wildcard', '/standings/division', '/standings/conference', '/standings/league', '/standings/points-progression', '/standings/playoffs',
    '/schedule', '/schedule/past',
    '/media', '/media/highlights', '/media/recaps', '/media/condensed',
]);

export function isKnownRoute(path) {
    if (STATIC_ROUTES.has(path)) return true;

    const h2h = path.match(/^\/stats\/head-to-head\/([^/]+)$/);
    if (h2h) return NHL_TEAMS.some(t => t.slug === h2h[1]);

    const past = path.match(/^\/schedule\/past\/(\d{4}-\d{2})$/);
    if (past) return getPastSeasons().includes(seasonFromLabel(past[1]));

    return Boolean(parseTeamRecordsPath(path));
}

// Where an alternate URL for a page should permanently redirect, or null:
// a known page with a trailing slash → its canonical URL, and the current season
// under past seasons (/schedule/past/2026-27) → the current schedule
export function redirectTarget(path) {
    const trimmed = path.replace(/\/+$/, '') || '/';
    if (trimmed === `/schedule/past/${getSeasonLabel()}`) return '/schedule';
    if (trimmed !== path && isKnownRoute(trimmed)) return trimmed;
    return null;
}

// Page paths have no file extension; anything with one (.js, .png, .xml…) is a static file
export function isPagePath(path) {
    return !/\.[a-z0-9]+$/i.test(path);
}
