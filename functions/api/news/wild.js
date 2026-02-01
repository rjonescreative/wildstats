// Cloudflare Pages Function for The Athletic Wild news via RSS
export async function onRequest() {
    try {
        const response = await fetch('https://www.nytimes.com/athletic/rss/nhl/wild/');
        const xml = await response.text();

        const items = xml.split('<item>').slice(1);
        const articles = items.slice(0, 3).map(item => {
            const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || [])[1] || '';
            const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
            const image = (item.match(/<media:content url="([^"]*)"/) || [])[1] || '';
            return { title, link, image, source: 'The Athletic' };
        });

        return new Response(JSON.stringify(articles), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800'
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch news' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
