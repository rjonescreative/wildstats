// Team Records URL slugs, parsing, and page titles/descriptions.
// Shared by the browser router and the Cloudflare route function (server-rendered meta tags).

// ─── Team Records URL slug mappings ───────────────────────────────────────────

const RECORDS_TIME_TO_SLUG = { alltime: 'all-time', season: 'season' };
const RECORDS_STAT_TO_SLUG = {
    goals: 'goals', assists: 'assists', points: 'points',
    shootout: 'shootout', penaltyMinutes: 'penalty-minutes', gamesPlayed: 'games-played', wins: 'wins',
    evGoals: 'even-strength-goals', evAssists: 'even-strength-assists', evPoints: 'even-strength-points',
    ppGoals: 'power-play-goals', ppAssists: 'power-play-assists', ppPoints: 'power-play-points',
    shGoals: 'short-handed-goals', shAssists: 'short-handed-assists', shPoints: 'short-handed-points',
    enGoals: 'empty-net-goals', enAssists: 'empty-net-assists', enPoints: 'empty-net-points',
};
const RECORDS_POS_TO_SLUG  = { all: 'all-skaters', forwards: 'forwards', defense: 'defense', goalies: 'goalies' };

const RECORDS_SLUG_TO_TIME = Object.fromEntries(Object.entries(RECORDS_TIME_TO_SLUG).map(([k, v]) => [v, k]));
const RECORDS_SLUG_TO_STAT = {
    ...Object.fromEntries(Object.entries(RECORDS_STAT_TO_SLUG).map(([k, v]) => [v, k])),
    // Earlier power-play slugs, kept so shared links still work
    'pp-goals': 'ppGoals', 'pp-assists': 'ppAssists', 'pp-points': 'ppPoints',
};
const RECORDS_SLUG_TO_POS  = Object.fromEntries(Object.entries(RECORDS_POS_TO_SLUG).map(([k, v]) => [v, k]));

// Parse /stats/team-records/[playoffs|combined/]{time}/{stat}/{pos} → { gameType, timeMode, statMode, posMode } or null
// Regular season has no type segment, so existing links keep working.
export function parseTeamRecordsPath(path) {
    const m = path.match(/^\/stats\/team-records\/(?:(playoffs|combined)\/)?([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!m) return null;
    const gameType = m[1] ?? 'regular';
    const timeMode = RECORDS_SLUG_TO_TIME[m[2]];
    const statMode = RECORDS_SLUG_TO_STAT[m[3]];
    const posMode  = RECORDS_SLUG_TO_POS[m[4]];
    if (!timeMode || !statMode || !posMode) return null;
    return { gameType, timeMode, statMode, posMode };
}

// Build /stats/team-records/{time}/{stat}/{pos} from state values
export function buildTeamRecordsPath(timeMode, statMode, posMode, gameType = 'regular') {
    const type = gameType === 'regular' ? '' : `${gameType}/`;
    return `/stats/team-records/${type}${RECORDS_TIME_TO_SLUG[timeMode]}/${RECORDS_STAT_TO_SLUG[statMode]}/${RECORDS_POS_TO_SLUG[posMode]}`;
}

const RECORDS_STAT_LABEL = {
    goals: 'Goals', assists: 'Assists', points: 'Points',
    evGoals: 'Even-Strength Goals', evAssists: 'Even-Strength Assists', evPoints: 'Even-Strength Points',
    ppGoals: 'Power Play Goals', ppAssists: 'Power Play Assists', ppPoints: 'Power Play Points',
    shGoals: 'Short-Handed Goals', shAssists: 'Short-Handed Assists', shPoints: 'Short-Handed Points',
    enGoals: 'Empty-Net Goals', enAssists: 'Empty-Net Assists', enPoints: 'Empty-Net Points',
    shootout: 'Shootout Goals', penaltyMinutes: 'Penalty Minutes',
    gamesPlayed: 'Games Played', wins: 'Wins',
};
const RECORDS_POS_PREFIX = {
    all: '', forwards: 'Forward ', defense: 'Defense ', goalies: 'Goalie ',
};
const RECORDS_POS_NOUN = {
    all: 'skaters', forwards: 'forwards', defense: 'defensemen', goalies: 'goalies',
};

export function teamRecordsTitle(timeMode, statMode, posMode, gameType = 'regular') {
    const time  = timeMode === 'alltime' ? 'Career' : 'Single-Season';
    const type  = { playoffs: 'Playoff ', combined: 'Regular Season & Playoff ' }[gameType] ?? '';
    const pos   = RECORDS_POS_PREFIX[posMode] ?? '';
    const stat  = RECORDS_STAT_LABEL[statMode] ?? statMode;
    const sfx   = timeMode === 'alltime' ? 'Leaders' : 'Records';
    return `Minnesota Wild ${time} ${type}${pos}${stat} ${sfx} | Wild Hockey Hub`;
}

export function teamRecordsDescription(timeMode, statMode, posMode, gameType = 'regular') {
    const stat    = (RECORDS_STAT_LABEL[statMode] ?? statMode).toLowerCase();
    const pos     = RECORDS_POS_NOUN[posMode] ?? 'players';
    if (gameType === 'combined') {
        return timeMode === 'alltime'
            ? `Minnesota Wild all-time ${stat} leaders for ${pos}, regular season and playoffs combined. Complete franchise history ranked from 2000-01.`
            : `Top single-season ${stat} totals by Minnesota Wild ${pos}, counting regular season and playoffs together. The best full seasons in franchise history, ranked.`;
    }
    if (gameType === 'playoffs') {
        return timeMode === 'alltime'
            ? `Minnesota Wild all-time playoff ${stat} leaders for ${pos}. Every Stanley Cup Playoffs run in franchise history, ranked.`
            : `Top single-postseason playoff ${stat} performances by Minnesota Wild ${pos}. The best individual playoff runs in franchise history, ranked.`;
    }
    if (timeMode === 'alltime') {
        return `Minnesota Wild all-time career ${stat} leaders for ${pos}. Complete franchise history ranked from 2000-01 through the current season.`;
    }
    return `Top single-season ${stat} performances by Minnesota Wild ${pos}. The best individual seasons in franchise history, ranked.`;
}
