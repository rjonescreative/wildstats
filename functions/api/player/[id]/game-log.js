export async function onRequest(context) {
    const playerId = context.params.id;
    try {
        const response = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/game-log/20252026/2`);
        const data = await response.json();
        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300' // 5 min
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch game log' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
