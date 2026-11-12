// Picks the ranked list for a Team Records selection from the franchise records data
// (milestones/franchise-leaders.json). Shared by the Team Records view and the Cloudflare
// route function, which server-renders the list for search engines.

export const RECORDS_DISPLAY_LIMIT = 20;

// selection: { gameType: 'regular'|'playoffs'|'combined', timeMode: 'alltime'|'season',
//              statKey: data key such as 'goals', 'ppPoints', 'wins', 'shootout', posMode: 'all'|'forwards'|'defense'|'goalies' }
export function recordEntries(records, { gameType, timeMode, statKey, posMode }) {
    const source = gameType === 'playoffs' ? records?.playoffs
        : gameType === 'combined' ? records?.combined
        : records;
    if (!source) return { entries: [], showSeason: false };
    const { skaters, goalies } = source;
    const alltime = timeMode === 'alltime';

    // Wins always uses goalies pool regardless of posMode
    if (statKey === 'wins') {
        const entries = alltime
            ? (goalies.careerLeaders.wins ?? [])
            : (goalies.singleSeasonRecords.wins ?? []);
        return { entries, showSeason: !alltime };
    }

    // All goalie-position stats route to goalies pool
    if (posMode === 'goalies') {
        const pool = alltime ? goalies.careerLeaders : goalies.singleSeasonRecords;
        // gamesPlayed is all-time only
        const entries = statKey === 'gamesPlayed'
            ? (goalies.careerLeaders.gamesPlayed ?? [])
            : (pool[statKey] ?? []);
        return { entries: entries.slice(0, RECORDS_DISPLAY_LIMIT), showSeason: !alltime && statKey !== 'gamesPlayed' };
    }

    // Skater stats (including shootout and situational) — position-specific pools
    const posKey = posMode === 'forwards' ? 'forwards' : posMode === 'defense' ? 'defense' : 'all';
    const pool = alltime ? skaters.careerLeaders : skaters.singleSeasonRecords;
    const entries = pool[posKey]?.[statKey === 'shootout' ? 'shootoutGoals' : statKey] ?? [];
    return { entries: entries.slice(0, RECORDS_DISPLAY_LIMIT), showSeason: !alltime };
}
