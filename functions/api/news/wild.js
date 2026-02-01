// Cloudflare Pages Function for Wild news (combines The Athletic RSS + NHL.com)
export async function onRequest() {
    try {
        // Fetch from both sources in parallel
        const [athleticResponse, nhlResponse] = await Promise.all([
            fetch('https://www.nytimes.com/athletic/rss/nhl/wild/').catch(() => null),
            fetch('https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-30&limit=5').catch(() => null)
        ]);

        const articles = [];

        // Parse Athletic RSS
        if (athleticResponse && athleticResponse.ok) {
            const xml = await athleticResponse.text();
            const items = xml.split('<item>').slice(1);
            items.slice(0, 5).forEach(item => {
                const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || [])[1] || '';
                const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
                const image = (item.match(/<media:content url="([^"]*)"/) || [])[1] || '';
                const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
                if (title && link) {
                    articles.push({
                        title,
                        link,
                        image,
                        source: 'The Athletic',
                        date: pubDate ? new Date(pubDate) : new Date(0)
                    });
                }
            });
        }

        // Parse NHL.com Forge API
        if (nhlResponse && nhlResponse.ok) {
            const nhlData = await nhlResponse.json();
            if (nhlData.items && Array.isArray(nhlData.items)) {
                nhlData.items.slice(0, 5).forEach(item => {
                    // Get the thumbnail image
                    const thumbnail = item.thumbnail?.templateUrl?.replace('{formatInstructions}', 't_ratio16_9-size40/f_auto/') || '';
                    articles.push({
                        title: item.title || '',
                        link: `https://www.nhl.com/wild/news/${item.slug}`,
                        image: thumbnail,
                        source: 'NHL.com',
                        date: item.contentDate ? new Date(item.contentDate) : new Date(0)
                    });
                });
            }
        }

        // Sort by date (newest first) and take top 6, max 3 per source
        articles.sort((a, b) => b.date - a.date);
        const sourceCounts = {};
        const topArticles = [];
        for (const article of articles) {
            const count = sourceCounts[article.source] || 0;
            if (count < 3) {
                topArticles.push({
                    title: article.title,
                    link: article.link,
                    image: article.image,
                    source: article.source
                });
                sourceCounts[article.source] = count + 1;
            }
            if (topArticles.length >= 6) break;
        }

        return new Response(JSON.stringify(topArticles), {
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
