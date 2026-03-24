export async function onRequest(context) {
    const { env } = context;

    try {
        const object = await env.H2H_DATA.get('milestones/franchise-leaders.json');

        if (!object) {
            return new Response(JSON.stringify({ error: 'Milestones data not available yet. Run the seed script first.' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const body = await object.text();

        return new Response(body, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to fetch milestones data.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
