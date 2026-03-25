// Cloudflare Pages Function — any-team schedule endpoint
export async function onRequest(context) {
    const { params } = context;
    const team   = params.team.toUpperCase();
    const season = params.season;

    try {
        const response = await fetch(
            `https://api-web.nhle.com/v1/club-schedule-season/${team}/${season}`,
            { redirect: 'follow' }
        );

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300',
            },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch schedule' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
