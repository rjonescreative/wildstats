// Team blocking, penalty, hitting, faceoff and possession totals for every NHL team, from the
// NHL stats API's team reports (one request each covers all 32 teams, so league ranks come free).
// Shared by server.js and the Cloudflare Functions as the game-triggered `teamStats` dataset
// (js/gameTriggeredData.js). Penalty minutes drawn aren't in any league-wide report, so they're
// summed for the Wild only, from the per-game rows of the Wild's opponents.

import { upstreamFetch } from './upstream.js';

const BASE = 'https://api.nhle.com/stats/rest/en/team';
export const WILD_TEAM_ID = 30;

async function nhlJson(url) {
    const r = await upstreamFetch(url, { redirect: 'follow', ttl: 0, retries: 0 });
    if (!r.ok) throw new Error(`NHL API error ${r.status} for ${url}`);
    return r.json();
}

const league = (report, season) =>
    `${BASE}/${report}?limit=50&cayenneExp=${encodeURIComponent(`seasonId=${season} and gameTypeId=2`)}`;

/** Dataset build → { data: { teams: { [teamId]: totals }, wildPimDrawn } } */
export async function buildTeamStats(season) {
    const [penalties, realtime, summary, opponents] = await Promise.all([
        nhlJson(league('penalties', season)),
        nhlJson(league('realtime', season)),
        nhlJson(league('summary', season)),
        // One row per Wild game, for the opponent: their penalty minutes are what the Wild drew
        nhlJson(`${BASE}/penalties?isAggregate=false&isGame=true&limit=100&cayenneExp=${encodeURIComponent(`seasonId=${season} and gameTypeId=2 and opponentTeamAbbrev="MIN"`)}`),
    ]);

    const teams = {};
    const team = id => teams[id] ??= {};
    for (const r of penalties.data ?? []) {
        Object.assign(team(r.teamId), {
            gp: r.gamesPlayed,
            penaltiesTaken: r.penalties,
            penaltiesDrawn: r.totalPenaltiesDrawn,
            pimSecondsPerGame: r.penaltySecondsPerGame,
        });
    }
    for (const r of realtime.data ?? []) {
        Object.assign(team(r.teamId), {
            blockedShots: r.blockedShots,
            blockedShotsPer60: r.blockedShotsPer60,
            hits: r.hits,
            hitsPer60: r.hitsPer60,
            takeaways: r.takeaways,
            giveaways: r.giveaways,
            satPct: r.satPct,
        });
    }
    for (const r of summary.data ?? []) {
        Object.assign(team(r.teamId), { faceoffWinPct: r.faceoffWinPct });
    }
    if (!teams[WILD_TEAM_ID]?.gp) throw new Error('No Wild team stats');

    const rows = opponents.data ?? [];
    const wildPimDrawn = { gp: rows.length, minutes: rows.reduce((s, r) => s + (r.penaltyMinutes ?? 0), 0) };
    return { data: { teams, wildPimDrawn } };
}
