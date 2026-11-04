// Video feed filtering — shared by server.js and the Cloudflare Function (/api/media/videos).
//
// Each play is usually published twice: the Wild's copy (tagged min-created, title like
// "MIN@PHI: Boldy scores goal against Dan Vladar") and the NHL's copy (tagged nhl /
// real-time-highlight, title like "Boldy opens the scoring", photo thumbnail). Both carry the
// play's statsEventId (the play-by-play eventId) and a gameid-… tag, so clips are grouped by
// game + event + duration: one per group, preferring the NHL copy. Clips of the same play with
// different lengths are different cuts, so each is kept. Videos with no event (recaps, features)
// fall back to the older title / duration matching.

const durationToSeconds = d => {
    if (!d) return 0;
    const parts = d.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
};

const hasTag = (item, slug) => (item.tags ?? []).some(t => t.slug === slug);

const gameIdOf = item => (item.tags ?? []).find(t => t.slug?.startsWith('gameid-'))?.slug.slice(7);

// "gameId|players|duration" — who is in a clip, for clips that have no statsEventId (multi-goal
// compilations, and some of the Wild's copies), or null
function playerKey(item) {
    const gameId = gameIdOf(item);
    const players = (item.tags ?? []).filter(t => t.slug?.startsWith('playerid-')).map(t => t.slug.slice(9)).sort();
    return gameId && players.length ? `${gameId}|${players.join(',')}|${item.fields?.duration ?? ''}` : null;
}

// Identifies a clip of a play (the same key = the same play and length), or null for videos that
// aren't play clips (recaps, features): "gameId|eventId|duration", or the player key when the
// clip has no statsEventId
export function playKey(item) {
    const eventId = item.fields?.statsEventId;
    const gameId = gameIdOf(item);
    if (eventId && gameId) return `${gameId}|${eventId}|${item.fields?.duration ?? ''}`;
    return playerKey(item);
}

// Higher is better when two copies of the same clip compete
const copyRank = item => (hasTag(item, 'nhl') || hasTag(item, 'real-time-highlight') ? 2 : 0) + (hasTag(item, 'min-created') ? 0 : 1);

// One clip per play and length (NHL copy preferred). A clip with no statsEventId is also dropped
// when a clip with an event shows the same players in the same game at the same length.
function dedupePlays(items) {
    const best = new Map();
    items.forEach(item => {
        const key = playKey(item);
        if (key && (!best.has(key) || copyRank(item) > copyRank(best.get(key)))) best.set(key, item);
    });
    const coveredByEventClips = new Set(items.filter(i => i.fields?.statsEventId).map(playerKey).filter(Boolean));
    return items.filter(item => {
        const key = playKey(item);
        if (!key) return true;
        if (!item.fields?.statsEventId && coveredByEventClips.has(key)) return false;
        return best.get(key) === item;
    });
}

// Videos without a play: same title on the same day keeps the longer one; then drop matching
// duration + title, description or thumbnail
function dedupeOthers(items) {
    const sameDayTitleMap = new Map();
    items.forEach(item => {
        if (playKey(item)) return;
        const key = `${(item.contentDate || '').split('T')[0]}|${item.title || ''}`;
        const duration = durationToSeconds(item.fields?.duration);
        if (!sameDayTitleMap.has(key) || duration > sameDayTitleMap.get(key).duration) {
            sameDayTitleMap.set(key, { item, duration });
        }
    });
    const longerVersionIds = new Set([...sameDayTitleMap.values()].map(v => v.item._entityId));

    const seen = [];
    return items.filter(item => {
        if (playKey(item)) return true;
        if (!longerVersionIds.has(item._entityId)) return false;
        const duration = item.fields?.duration || '';
        const title = item.title || '';
        const description = item.fields?.description || '';
        const thumbnail = item.thumbnail?.templateUrl || '';
        const isDuplicate = seen.some(s =>
            s.duration === duration && (s.title === title || s.description === description || s.thumbnail === thumbnail)
        );
        if (isDuplicate) return false;
        seen.push({ duration, title, description, thumbnail });
        return true;
    });
}

// Feed items to show for a media tab ('all' | 'highlights' | 'recaps' | 'condensed')
export function filterVideos(items, type) {
    let result = dedupeOthers(dedupePlays(items));

    // For highlights, exclude game recaps
    if (type === 'highlights') {
        result = result.filter(item => {
            const title = (item.title || '').toLowerCase();
            const description = (item.fields?.description || '').toLowerCase();
            return !title.includes('recap') && !description.includes('recap');
        });
    }
    return result;
}
