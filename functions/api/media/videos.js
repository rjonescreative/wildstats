// Cloudflare Pages Function for Wild videos
export async function onRequest(context) {
    try {
        const url = new URL(context.request.url);
        const offset = parseInt(url.searchParams.get('offset')) || 0;
        const limit = parseInt(url.searchParams.get('limit')) || 12;
        const type = url.searchParams.get('type') || 'all';

        // Build tags filter based on type
        let tags = 'teamid-30';
        if (type === 'highlights') {
            tags = 'highlight,teamid-30';
        } else if (type === 'recaps') {
            tags = 'game-recap,teamid-30';
        }

        // Fetch extra for highlights to account for filtered recaps
        const fetchLimit = type === 'highlights' ? limit * 2 : limit;

        const response = await fetch(
            `https://forge-dapi.d3.nhle.com/v2/content/en-us/videos?tags.slug=${encodeURIComponent(tags)}&$skip=${offset}&$limit=${fetchLimit}`
        );

        if (!response.ok) {
            throw new Error(`NHL API error: ${response.status}`);
        }

        const data = await response.json();
        let items = data.items || [];
        const fetchedCount = items.length;

        // For highlights, exclude game recaps and trim to requested limit
        if (type === 'highlights') {
            items = items.filter(item => {
                const title = (item.title || '').toLowerCase();
                const description = (item.fields?.description || '').toLowerCase();
                return !title.includes('recap') && !description.includes('recap');
            });
            items = items.slice(0, limit);
        }

        const videos = items.map(item => ({
            id: item._entityId,
            title: item.title || '',
            description: item.fields?.description || '',
            duration: item.fields?.duration || '',
            brightcoveId: item.fields?.brightcoveId || '',
            brightcoveAccountId: item.fields?.brightcoveAccountId || '6415718365001',
            thumbnail: item.thumbnail?.templateUrl?.replace('{formatInstructions}', 't_ratio16_9-size40/f_auto/') || '',
            contentDate: item.contentDate || ''
        }));

        return new Response(JSON.stringify({
            videos,
            total: data.pagination?.total || videos.length,
            hasMore: fetchedCount === fetchLimit,
            nextOffset: offset + fetchedCount
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300'
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch videos' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
