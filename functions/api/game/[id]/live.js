export async function onRequest(context) {
    const gameId = context.params.id;
    try {
        const response = await fetch(`https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`);
        const data = await response.json();

        // Return only the fields needed for live score display
        const liveData = {
            gameState: data.gameState,
            period: data.periodDescriptor,
            clock: data.clock,
            awayTeam: {
                abbrev: data.awayTeam?.abbrev,
                score: data.awayTeam?.score
            },
            homeTeam: {
                abbrev: data.homeTeam?.abbrev,
                score: data.homeTeam?.score
            }
        };

        return new Response(JSON.stringify(liveData), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=10' // Short cache for live data
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch live game data' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
