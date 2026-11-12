// Cloudflare Pages Function for Wild videos
import { filterVideos, playKey } from '../../../js/videoFilters.js';

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
        } else if (type === 'condensed') {
            tags = 'condensed-game,teamid-30';
        }

        // Fetch extra to account for filtered duplicates and recaps
        const fetchLimit = type === 'highlights' ? limit * 3 : limit * 2;

        const response = await fetch(
            `https://forge-dapi.d3.nhle.com/v2/content/en-us/videos?tags.slug=${encodeURIComponent(tags)}&$skip=${offset}&$limit=${fetchLimit}`
        );

        if (!response.ok) {
            throw new Error(`NHL API error: ${response.status}`);
        }

        const data = await response.json();
        let items = data.items || [];
        const fetchedCount = items.length;

        // One clip per play and length (NHL copy preferred), then the older duplicate checks
        items = filterVideos(items, type);

        // Trim to requested limit
        items = items.slice(0, limit);

        const videos = items.map(item => ({
            id: item._entityId,
            title: item.title || '',
            description: item.fields?.description || '',
            duration: item.fields?.duration || '',
            brightcoveId: item.fields?.brightcoveId || '',
            brightcoveAccountId: item.fields?.brightcoveAccountId || '6415718365001',
            thumbnail: item.thumbnail?.templateUrl?.replace('{formatInstructions}', 't_ratio16_9-size40/f_auto/') || '',
            contentDate: item.contentDate || '',
            slug: item.slug || '', // shareable URL /media/video/{slug}
            playKey: playKey(item) // lets the page skip a play already shown on an earlier page
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
