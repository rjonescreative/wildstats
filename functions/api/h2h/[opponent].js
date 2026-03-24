export async function onRequest(context) {
    const { params, env } = context;
    const opponent = params.opponent.toUpperCase();

    try {
        const object = await env.H2H_DATA.get(`h2h/MIN-${opponent}.json`);

        if (!object) {
            return new Response(JSON.stringify({ error: 'No H2H data available for this opponent yet.' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const body = await object.text();

        return new Response(body, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600', // 1 hour — refreshed by nightly job
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to fetch H2H data.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
