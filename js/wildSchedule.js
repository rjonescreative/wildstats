// The Wild's season schedule from the NHL, cached by game window instead of a fixed 5 minutes.
// Shared by every caller of that NHL URL (schedule and team-schedule routes, season breakdown, the
// Wild game trigger in js/gameTriggered.js, the home page's next-game description), since they
// share one cache entry and the last writer sets how long it's kept.
//
// The schedule changes during games (live state, scores) and rarely otherwise (start times,
// postponements, broadcasts). So it's refreshed about every 5 min from WINDOW_LEAD before a game's start
// until that game is final, and otherwise kept until the next window opens (at most an hour) —
// so a cached copy always expires as a window begins.

import { upstreamFetch } from './upstream.js';

const WINDOW_LEAD_MS = 30 * 60 * 1000; // window opens 30 min before puck drop
const IN_WINDOW_TTL = 240;             // seconds: under the 5 min that routes and checks run at,
                                       // so each 5-min check gets a fresh copy rather than every other one
const MAX_TTL = 3600;                  // seconds

const DONE = new Set(['FINAL', 'OFF']);
const NOT_PLAYED = new Set(['PPD', 'CNCL', 'SUSP']); // postponed / cancelled / suspended

/** Seconds to keep this schedule (an NHL club-schedule-season response) as of `now`. */
export function wildScheduleTtl(schedule, now = Date.now()) {
    let nextWindow = Infinity;
    for (const g of schedule?.games ?? []) {
        if (DONE.has(g.gameState) || NOT_PLAYED.has(g.gameScheduleState)) continue;
        const opens = Date.parse(g.startTimeUTC) - WINDOW_LEAD_MS;
        if (!Number.isFinite(opens)) continue;
        if (opens <= now) return IN_WINDOW_TTL; // a game is about to start, live, or not yet final
        nextWindow = Math.min(nextWindow, opens);
    }
    const untilWindow = Math.floor((nextWindow - now) / 1000);
    return Math.max(IN_WINDOW_TTL, Math.min(MAX_TTL, untilWindow));
}

export function wildScheduleUrl(season) {
    return `https://api-web.nhle.com/v1/club-schedule-season/MIN/${season}`;
}

/** upstreamFetch for the Wild schedule with the game-window ttl. Extra init passes through. */
export function fetchWildSchedule(season, init = {}) {
    return upstreamFetch(wildScheduleUrl(season), {
        redirect: 'follow',
        ...init,
        ttlFor: async response => wildScheduleTtl(await response.json()),
    });
}
