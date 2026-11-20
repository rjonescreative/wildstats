// Game flow for every NHL team: who scored first, and how long each team led and trailed.
// Built from the NHL's daily scores feed (score/{date}), which lists every goal of every game that
// day with its period, time and the score after it, so one request covers the whole league for a
// day. Shared by server.js and the Cloudflare Functions as the game-triggered `gameFlow` dataset
// (js/gameTriggeredData.js).
//
// Stored data: { startDate, days: { 'YYYY-MM-DD': { done, games: [summary] } } }. Each rebuild
// starts from the previous build and fetches only days that aren't done (today, and any day with
// a game not yet final or whose goals didn't add up), at most MAX_DAYS_PER_BUILD at a time; a build
// that leaves days unfetched is incomplete, so it's rechecked and the backfill continues.

import { upstreamFetch, mapLimit } from './upstream.js';

const MAX_DAYS_PER_BUILD = 30; // keeps a Worker well under its 50-subrequest limit
const CONCURRENCY = 6;
const PERIOD_SECONDS = 20 * 60;
const REGULATION_SECONDS = 3 * PERIOD_SECONDS;
const OT_SECONDS = 5 * 60; // regular-season overtime

const FINISHED = new Set(['FINAL', 'OFF']);
const NOT_PLAYED = new Set(['PPD', 'CNCL', 'SUSP']);

async function nhlJson(url) {
    const r = await upstreamFetch(url, { redirect: 'follow', ttl: 0, retries: 0 });
    if (!r.ok) throw new Error(`NHL API error ${r.status} for ${url}`);
    return r.json();
}

// ---- dates (NHL game dates are Eastern) -------------------------------------------------------

export function easternDate(now = Date.now()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now));
}

function datesBetween(start, end) {
    const out = [];
    for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86400000) {
        out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
}

// ---- one game ----------------------------------------------------------------------------------

const toSeconds = mmss => {
    const [m, s] = String(mmss ?? '').split(':').map(Number);
    return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null;
};

/**
 * Summary of a finished game from the scores feed, or null when its goals don't account for the
 * final score (the feed occasionally lags a scoring change). Shootouts are excluded from first
 * goal and time: a 0-0 game decided in a shootout has no first goal.
 * → { id, home, away, homeScore, awayScore, last, first, length, homeLead, awayLead } (seconds)
 */
export function summarizeGame(game) {
    const last = game.gameOutcome?.lastPeriodType ?? 'REG';
    const homeScore = game.homeTeam?.score ?? 0;
    const awayScore = game.awayTeam?.score ?? 0;
    const goals = (game.goals ?? [])
        .filter(g => g.periodDescriptor?.periodType !== 'SO')
        .map(g => {
            const t = toSeconds(g.timeInPeriod);
            const n = g.periodDescriptor?.number ?? g.period;
            return { at: t === null || !n ? null : (n - 1) * PERIOD_SECONDS + t, team: g.teamAbbrev };
        });
    // Every goal must be timed, and they must add up to the final score (minus a shootout win)
    const expected = homeScore + awayScore - (last === 'SO' ? 1 : 0);
    if (goals.length !== expected || goals.some(g => g.at === null)) return null;
    goals.sort((a, b) => a.at - b.at);

    const length = last === 'OT' ? goals.at(-1)?.at ?? REGULATION_SECONDS + OT_SECONDS
        : last === 'SO' ? REGULATION_SECONDS + OT_SECONDS
        : REGULATION_SECONDS;
    const home = game.homeTeam.abbrev, away = game.awayTeam.abbrev;
    if (goals.some(g => g.team !== home && g.team !== away)) return null;

    // Walk the goals: each span between them counts for whoever led (home margin > 0 or < 0)
    let homeLead = 0, awayLead = 0, from = 0, margin = 0;
    for (const g of [...goals, { at: length, team: null }]) {
        const at = Math.min(g.at, length);
        if (margin > 0) homeLead += at - from; else if (margin < 0) awayLead += at - from;
        from = at;
        if (g.team) margin += g.team === home ? 1 : -1;
    }

    return {
        id: game.id, home, away, homeScore, awayScore, last,
        first: goals[0]?.team ?? null,
        length, homeLead, awayLead,
    };
}

// A day's regular-season games → { done, games }. Done once every game is final (and its goals
// add up) or won't be played; otherwise the day is fetched again next build.
export function summarizeDay(scoreResponse) {
    const games = (scoreResponse.games ?? []).filter(g => g.gameType === 2);
    const summaries = [];
    let done = true;
    for (const g of games) {
        if (NOT_PLAYED.has(g.gameScheduleState)) continue;
        if (!FINISHED.has(g.gameState)) { done = false; continue; }
        const s = summarizeGame(g);
        if (s) summaries.push(s); else done = false;
    }
    return { done, games: summaries };
}

// ---- build -------------------------------------------------------------------------------------

/** Dataset build: previous build's data (or null) → { data, complete } */
export async function buildGameFlow(previous, now = Date.now()) {
    const startDate = previous?.startDate
        ?? (await nhlJson('https://api-web.nhle.com/v1/schedule/now')).regularSeasonStartDate;
    if (!startDate) throw new Error('No regular season start date');

    const days = { ...(previous?.days ?? {}) };
    const pending = datesBetween(startDate, easternDate(now)).filter(d => !days[d]?.done);
    const batch = pending.slice(0, MAX_DAYS_PER_BUILD);
    const results = await mapLimit(batch, CONCURRENCY, date => nhlJson(`https://api-web.nhle.com/v1/score/${date}`));

    let fetched = 0;
    results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return; // keep any earlier copy of that day; retried next build
        days[batch[i]] = summarizeDay(r.value);
        fetched++;
    });
    if (batch.length && !fetched) throw new Error('Every scores request failed');

    // Today's games still being played is expected (their finals trigger the next rebuild); a failed
    // request, a capped backfill or an earlier day that isn't done makes the build incomplete, so
    // it's rechecked soon
    const today = easternDate(now);
    const complete = fetched === batch.length && pending.length === batch.length
        && Object.entries(days).every(([d, v]) => v.done || d >= today);
    return { data: { startDate, days }, complete };
}

// ---- per-team totals ---------------------------------------------------------------------------

const emptyRecord = () => ({ gp: 0, w: 0, l: 0, otl: 0 });

function addResult(rec, won, last) {
    rec.gp++;
    if (won) rec.w++;
    else if (last === 'OT' || last === 'SO') rec.otl++;
    else rec.l++;
}

/**
 * Totals per team from the stored days:
 * { [abbrev]: { gp, scoredFirst, scoredSecond, noGoals (records: { gp, w, l, otl }),
 *               leadSeconds, trailSeconds, playedSeconds } }
 * scoredFirst: the team scored the game's first goal. scoredSecond: the opponent scored first and
 * the team answered at least once. noGoals: the team scored no goals before any shootout.
 */
export function teamGameFlow(data) {
    const teams = {};
    const team = abbrev => teams[abbrev] ??= {
        gp: 0, scoredFirst: emptyRecord(), scoredSecond: emptyRecord(), noGoals: emptyRecord(),
        leadSeconds: 0, trailSeconds: 0, playedSeconds: 0,
    };
    for (const day of Object.values(data?.days ?? {})) {
        for (const g of day.games) {
            for (const side of ['home', 'away']) {
                const other = side === 'home' ? 'away' : 'home';
                const t = team(g[side]);
                const goalsBeforeShootout = g[`${side}Score`] - (g.last === 'SO' && g[`${side}Score`] > g[`${other}Score`] ? 1 : 0);
                const bucket = g.first === g[side] ? t.scoredFirst : goalsBeforeShootout > 0 ? t.scoredSecond : t.noGoals;
                const won = g[`${side}Score`] > g[`${other}Score`];
                t.gp++;
                addResult(bucket, won, g.last);
                t.leadSeconds += g[`${side}Lead`];
                t.trailSeconds += g[`${other}Lead`];
                t.playedSeconds += g.length;
            }
        }
    }
    return teams;
}

/** The /api/league/game-flow response: per-team totals, and the last day whose games are all in. */
export function gameFlowResponse(data) {
    const doneDays = Object.entries(data?.days ?? {}).filter(([, d]) => d.done && d.games.length).map(([d]) => d).sort();
    return { teams: teamGameFlow(data), through: doneDays.at(-1) ?? null };
}
