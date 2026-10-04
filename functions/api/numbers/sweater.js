// Cloudflare Pages Function — every sweater number worn by a Wild player, from R2
// Response: { lastUpdated, players: { [playerId]: { name, headshot, position } },
//             numbers: { [number]: { [playerId]: { regular, playoffs, firstSeason, lastSeason } } } }
export async function onRequest(context) {
    const { env } = context;

    try {
        const object = await env.H2H_DATA.get('numbers/sweater-numbers.json');
        if (!object) {
            return new Response(JSON.stringify({ error: 'Sweater number data not available yet.' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const { lastUpdated, players, numbers } = JSON.parse(await object.text());
        return new Response(JSON.stringify({ lastUpdated, players, numbers }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to fetch sweater number data.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
