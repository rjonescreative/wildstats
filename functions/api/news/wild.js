// Cloudflare Pages Function for Wild news (combines The Athletic RSS + NHL.com + Star Tribune)
export async function onRequest(context) {
    try {
        const url = new URL(context.request.url);
        const offset = parseInt(url.searchParams.get('offset')) || 0;
        const limit = parseInt(url.searchParams.get('limit')) || 6;

        // Fetch from all sources in parallel (get more items for pagination)
        const [athleticResponse, nhlResponse, stribResponse] = await Promise.all([
            fetch('https://www.nytimes.com/athletic/rss/nhl/wild/').catch(() => null),
            fetch('https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=teamid-30&limit=20').catch(() => null),
            fetch('https://www.startribune.com/sports/index.rss2').catch(() => null)
        ]);

        const articles = [];

        // Parse Athletic RSS (get all items)
        if (athleticResponse && athleticResponse.ok) {
            const xml = await athleticResponse.text();
            const items = xml.split('<item>').slice(1);
            items.forEach(item => {
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
                nhlData.items.forEach(item => {
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

        // Parse Star Tribune RSS (only Wild articles)
        if (stribResponse && stribResponse.ok) {
            const xml = await stribResponse.text();
            const items = xml.split('<item>').slice(1);
            items.forEach(item => {
                // Only include items with Wild category
                if (!item.includes('domain="/sports/wild"')) return;

                const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || [])[1] || '';
                const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
                const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
                // Star Tribune doesn't include images in RSS, use placeholder
                if (title && link) {
                    articles.push({
                        title,
                        link,
                        image: '/images/startribune-placeholder.png',
                        source: 'Star Tribune',
                        date: pubDate ? new Date(pubDate) : new Date(0)
                    });
                }
            });
        }

        // Sort by date (newest first)
        articles.sort((a, b) => b.date - a.date);

        // Apply pagination
        const paginatedArticles = articles.slice(offset, offset + limit).map(article => ({
            title: article.title,
            link: article.link,
            image: article.image,
            source: article.source
        }));

        return new Response(JSON.stringify({
            articles: paginatedArticles,
            total: articles.length,
            hasMore: offset + limit < articles.length
        }), {
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
