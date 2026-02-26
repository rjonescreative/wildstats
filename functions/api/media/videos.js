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

        // Filter out shorter duplicates (same title + same day, keep longer duration)
        const durationToSeconds = (d) => {
            if (!d) return 0;
            const parts = d.split(':').map(Number);
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            return 0;
        };

        const sameDayTitleMap = new Map();
        items.forEach(item => {
            const title = item.title || '';
            const date = (item.contentDate || '').split('T')[0];
            const key = `${date}|${title}`;
            const duration = durationToSeconds(item.fields?.duration);

            if (!sameDayTitleMap.has(key) || duration > sameDayTitleMap.get(key).duration) {
                sameDayTitleMap.set(key, { item, duration });
            }
        });
        const longerVersionIds = new Set([...sameDayTitleMap.values()].map(v => v.item._entityId));
        items = items.filter(item => longerVersionIds.has(item._entityId));

        // Filter out duplicates (matching duration + at least one other field)
        const seen = [];
        items = items.filter(item => {
            const duration = item.fields?.duration || '';
            const title = item.title || '';
            const description = item.fields?.description || '';
            const thumbnail = item.thumbnail?.templateUrl || '';

            const isDuplicate = seen.some(s =>
                s.duration === duration && (
                    s.title === title ||
                    s.description === description ||
                    s.thumbnail === thumbnail
                )
            );

            if (!isDuplicate) {
                seen.push({ duration, title, description, thumbnail });
                return true;
            }
            return false;
        });

        // For highlights, exclude game recaps
        if (type === 'highlights') {
            items = items.filter(item => {
                const title = (item.title || '').toLowerCase();
                const description = (item.fields?.description || '').toLowerCase();
                return !title.includes('recap') && !description.includes('recap');
            });
        }

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
