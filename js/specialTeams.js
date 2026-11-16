// Wild power play / penalty kill helpers — shared by server.js and the Cloudflare Function.
// Official per-game numbers come from the NHL stats API; period and score-state splits are
// derived from play-by-play and reconciled to the official opportunity and goal counts (the
// official numbers always win); a game is left out only when it can't be reconciled.

const STATS_BASE = 'https://api.nhle.com/stats/rest/en/team';

// Every NHL stats API URL the endpoint needs for one season
export function specialTeamsStatsUrls(season) {
    const wild = encodeURIComponent(`franchiseId=37 and seasonId=${season} and gameTypeId=2`);
    const league = encodeURIComponent(`seasonId=${season} and gameTypeId=2`);
    return {
        powerPlay:   `${STATS_BASE}/powerplay?isAggregate=false&isGame=true&limit=100&cayenneExp=${wild}`,
        penaltyKill: `${STATS_BASE}/penaltykill?isAggregate=false&isGame=true&limit=100&cayenneExp=${wild}`,
        league:      `${STATS_BASE}/summary?limit=50&cayenneExp=${league}`,
    };
}

// Penalties that can put a team on the power play (misconducts and penalty shots can't)
const PP_PENALTIES = new Set(['MIN', 'MAJ', 'BEN', 'MAT']);

// Skaters per side from a situation code (away goalie, away skaters, home skaters, home goalie).
// An extra attacker for a pulled goalie doesn't count toward a man advantage.
function strength(situationCode, isMinHome) {
    const s = String(situationCode ?? '').padStart(4, '0');
    const away = +s[1] - (s[0] === '0' ? 1 : 0);
    const home = +s[2] - (s[3] === '0' ? 1 : 0);
    return isMinHome ? { min: home, opp: away } : { min: away, opp: home };
}

// Opportunities from one play-by-play: { pp: [[period, state, goalPeriods], ...], pk: [...] }
// period is when the penalty was called: 1–3, or 4 for overtime. state is the Wild's score state
// then: 'L' leading, 'T' tied, 'B' behind. goalPeriods lists the period of each power-play goal
// scored during that opportunity (a power play can carry into the next period).
export function extractSpecialTeams(pbp) {
    const isMinHome = pbp.homeTeam?.abbrev === 'MIN';
    const minId = isMinHome ? pbp.homeTeam?.id : pbp.awayTeam?.id;
    const plays = (pbp.plays ?? []).filter(p => p.periodDescriptor?.periodType !== 'SO');
    // Penalties after the last faceoff (e.g. at the final horn) never become a power play
    let lastFaceoff = -1;
    plays.forEach((p, i) => { if (p.typeDescKey === 'faceoff') lastFaceoff = i; });

    const out = { pp: [], pk: [] };
    let minScore = 0, oppScore = 0;
    let group = null; // penalties called at the same moment, so offsetting ones can cancel

    const flushGroup = () => {
        if (!group) return;
        const offset = Math.min(group.min, group.opp);
        for (let k = offset; k < group.opp; k++) out.pp.push([group.period, group.state, []]);
        for (let k = offset; k < group.min; k++) out.pk.push([group.period, group.state, []]);
        group = null;
    };

    plays.forEach((p, i) => {
        const d = p.details ?? {};
        const period = Math.min(p.periodDescriptor?.number ?? 1, 4);
        const key = `${period}|${p.timeInPeriod}`;
        if (group && (p.typeDescKey !== 'penalty' || group.key !== key)) flushGroup();

        if (p.typeDescKey === 'penalty' && PP_PENALTIES.has(d.typeCode) && i < lastFaceoff) {
            if (!group) {
                const state = minScore > oppScore ? 'L' : minScore < oppScore ? 'B' : 'T';
                group = { key, period, state, min: 0, opp: 0 };
            }
            // A double minor is two power plays
            const units = d.typeCode === 'MIN' ? Math.max(1, Math.round((d.duration ?? 2) / 2)) : 1;
            if (d.eventOwnerTeamId === minId) group.min += units;
            else group.opp += units;
        }

        if (p.typeDescKey === 'goal') {
            const minScored = d.eventOwnerTeamId === minId;
            const { min, opp } = strength(p.situationCode, isMinHome);
            // Credit a power-play goal to the most recent opportunity for that side
            const list = minScored ? (min > opp ? out.pp : null) : (opp > min ? out.pk : null);
            if (list?.length) list[list.length - 1][2].push(period);
            if (minScored) minScore++;
            else oppScore++;
        }
    });
    flushGroup();
    return out;
}

// Rows of a stats API report, or null when the response isn't a usable report
export function statsRows(res) {
    return Array.isArray(res?.data) ? res.data : null;
}

const LEAGUE_FIELDS = ['ppRank', 'pkRank', 'leagueTeams', 'leaguePpPct', 'leaguePkPct'];

// Payload for this request, falling back to the last good one (stored in R2) when the stats API
// fails or returns fewer games than before. If only the league summary failed, ranks and
// averages come from the last good payload. Returns { payload, stale }, or null with nothing to serve.
export function resolveSpecialTeams({ powerPlay, penaltyKill, league, splits, lastGood }) {
    const fallback = lastGood?.totals ? { payload: { ...lastGood, stale: true }, stale: true } : null;
    if (!powerPlay || !penaltyKill) return fallback;

    const payload = buildSpecialTeamsPayload({ powerPlay, penaltyKill, league: league ?? [], splits });
    if (payload.games.length === 0 || payload.games.length < (lastGood?.games?.length ?? 0)) {
        return fallback ?? { payload, stale: false };
    }
    if (!league?.length && lastGood?.totals) {
        LEAGUE_FIELDS.forEach(k => { payload.totals[k] = lastGood.totals[k]; });
    }
    return { payload, stale: false };
}

const sumGoals = list => list.reduce((n, o) => n + o[2].length, 0);

// Bring one side's derived opportunities in line with the official NHL count, which always wins.
// Play-by-play over-counts when penalties overlap: stacked minors can each count as a power play
// while the overlapping penalties leave only one real man advantage. Extra opportunities are
// dropped from those that produced no goal, preferring ones stacked with a neighbour (same
// period and score state, i.e. called together), latest first. Returns null when the counts
// can't be matched (too few opportunities, or the goals disagree).
function reconcile(list, officialOpps, officialGoals) {
    if (sumGoals(list) !== officialGoals || list.length < officialOpps) return null;
    const out = [...list];
    const sameMoment = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
    while (out.length > officialOpps) {
        let drop = -1;
        for (let i = out.length - 1; i >= 0 && drop < 0; i--) {
            if (!out[i][2].length && (sameMoment(out[i], out[i - 1]) || sameMoment(out[i], out[i + 1]))) drop = i;
        }
        for (let i = out.length - 1; i >= 0 && drop < 0; i--) {
            if (!out[i][2].length) drop = i;
        }
        if (drop < 0) return null;
        out.splice(drop, 1);
    }
    return out;
}

// Response payload from the stats API reports plus cached play-by-play splits (gameId → splits)
export function buildSpecialTeamsPayload({ powerPlay, penaltyKill, league, splits = {} }) {
    const pkById = Object.fromEntries((penaltyKill ?? []).map(g => [g.gameId, g]));

    const games = (powerPlay ?? [])
        .filter(g => pkById[g.gameId])
        .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
        .map(g => {
            const pk = pkById[g.gameId];
            const game = {
                id: g.gameId,
                date: g.gameDate,
                opponent: g.opponentTeamAbbrev,
                isHome: g.homeRoad === 'H',
                ppGoals: g.powerPlayGoalsFor,
                ppOpps: g.ppOpportunities,
                ppGoalsAgainst: pk.ppGoalsAgainst,
                timesShorthanded: pk.timesShorthanded,
                shGoalsFor: pk.shGoalsFor,
                shGoalsAgainst: g.shGoalsAgainst,
                splits: null,
            };
            const s = splits[g.gameId];
            const pp = s && reconcile(s.pp, game.ppOpps, game.ppGoals);
            const pkSplits = s && reconcile(s.pk, game.timesShorthanded, game.ppGoalsAgainst);
            if (pp && pkSplits) game.splits = { pp, pk: pkSplits };
            return game;
        });

    const sum = key => games.reduce((n, g) => n + (g[key] ?? 0), 0);
    const ppGoals = sum('ppGoals'), ppOpps = sum('ppOpps');
    const ppGoalsAgainst = sum('ppGoalsAgainst'), timesShorthanded = sum('timesShorthanded');

    // League rank (1 = best) and average from every team's season summary
    const teams = (league ?? []).filter(t => t.powerPlayPct != null && t.penaltyKillPct != null);
    const rank = (key, value) => value == null || !teams.length
        ? null
        : 1 + teams.filter(t => t[key] > value + 1e-9).length;
    const avg = key => teams.length ? teams.reduce((n, t) => n + t[key], 0) / teams.length : null;
    const ppPct = ppOpps > 0 ? ppGoals / ppOpps : null;
    const pkPct = timesShorthanded > 0 ? 1 - ppGoalsAgainst / timesShorthanded : null;
    const wildRow = teams.find(t => t.teamId === 30);

    return {
        totals: {
            gamesPlayed: games.length,
            ppGoals, ppOpps, ppPct,
            ppGoalsAgainst, timesShorthanded, pkPct,
            shGoalsFor: sum('shGoalsFor'),
            shGoalsAgainst: sum('shGoalsAgainst'),
            ppRank: wildRow ? rank('powerPlayPct', wildRow.powerPlayPct) : null,
            pkRank: wildRow ? rank('penaltyKillPct', wildRow.penaltyKillPct) : null,
            leagueTeams: teams.length,
            leaguePpPct: avg('powerPlayPct'),
            leaguePkPct: avg('penaltyKillPct'),
        },
        games,
    };
}
