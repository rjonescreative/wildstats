// Cloudflare Pages Function: every video for one game, both teams (Media → Game-by-Game)
import { buildGameVideos, gameVideosMaxAge } from '../../../../js/gameVideos.js';

const json = (body, status, maxAge = 0) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json',
        ...(maxAge ? { 'Cache-Control': `public, max-age=${maxAge}` } : {}),
    },
});

export async function onRequest(context) {
    const gameId = context.params.gameId;
    if (!/^\d{10}$/.test(gameId)) return json({ error: 'Invalid game ID' }, 400);
    try {
        const result = await buildGameVideos(gameId);
        return json(result, 200, gameVideosMaxAge(result));
    } catch (error) {
        console.error(`Error fetching videos for game ${gameId}:`, error);
        return json({ error: 'Failed to fetch game videos' }, 500);
    }
}
