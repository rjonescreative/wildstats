// Cloudflare Pages Function — aggregated all-team schedules
// Fetches all 32 NHL team schedules in parallel server-side and returns a
// single { [abbrev]: games[] } payload, replacing 32 individual client requests.
// Games are stripped to only the fields needed for the points-progression chart.

const ALL_NHL_TEAMS = [
    'ANA','BOS','BUF','CAR','CBJ','CGY','CHI','COL','DAL','DET',
    'EDM','FLA','LAK','MIN','MTL','NJD','NSH','NYI','NYR','OTT',
    'PHI','PIT','SEA','SJS','STL','TBL','TOR','UTA','VAN','VGK','WPG','WSH',
];

function stripGameFields(game) {
    return {
        id:          game.id,
        season:      game.season,
        gameType:    game.gameType,
        gameDate:    game.gameDate,
        gameState:   game.gameState,
        homeTeam:    { abbrev: game.homeTeam?.abbrev, score: game.homeTeam?.score },
        awayTeam:    { abbrev: game.awayTeam?.abbrev, score: game.awayTeam?.score },
        gameOutcome: game.gameOutcome ? { lastPeriodType: game.gameOutcome.lastPeriodType } : undefined,
    };
}

export async function onRequest(context) {
    const { season } = context.params;

    try {
        const results = await Promise.allSettled(
            ALL_NHL_TEAMS.map(async abbrev => {
                try {
                    const response = await fetch(
                        `https://api-web.nhle.com/v1/club-schedule-season/${abbrev}/${season}`,
                        { redirect: 'follow' }
                    );
                    if (!response.ok) return { abbrev, games: [] };
                    const data = await response.json();
                    return { abbrev, games: (data.games ?? []).map(stripGameFields) };
                } catch {
                    return { abbrev, games: [] };
                }
            })
        );

        const payload = {};
        results.forEach(r => {
            if (r.status === 'fulfilled') payload[r.value.abbrev] = r.value.games;
        });

        return new Response(JSON.stringify(payload), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch schedules' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
