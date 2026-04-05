// Cloudflare Pages Function for NHL playoff bracket
export async function onRequest(context) {
    const season = context.params.season;
    try {
        const response = await fetch(`https://api-web.nhle.com/v1/playoff-bracket/${season}`);
        const data = await response.json();

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300'
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch playoff bracket' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
