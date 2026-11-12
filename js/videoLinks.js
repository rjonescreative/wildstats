// Shareable video URLs: /media/video/{nhl-slug}. NHL video slugs end in the Brightcove ID
// (e.g. "hynes-pregame-at-toronto-6408297057112"), so a link can be played without looking it up.
// Shared by the browser router, the Cloudflare route function and the local Express server.

export const DEFAULT_BRIGHTCOVE_ACCOUNT = '6415718365001';

const VIDEO_PATH = /^\/media\/video\/((?:[a-z0-9]+-)*(\d{6,}))$/;

// { slug, brightcoveId } for a video page path, or null
export function parseVideoPath(path) {
    const m = path.match(VIDEO_PATH);
    return m ? { slug: m[1], brightcoveId: m[2] } : null;
}

export function videoPath(slug) {
    return `/media/video/${slug}`;
}

// Brightcove's hosted player page (what the modal iframes, and what link previews embed)
export function brightcovePlayerUrl(accountId, brightcoveId, autoplay = false) {
    const base = `https://players.brightcove.net/${accountId || DEFAULT_BRIGHTCOVE_ACCOUNT}/EXtG1xJ7H_default/index.html?videoId=${brightcoveId}`;
    return autoplay ? `${base}&autoplay=${autoplay}` : base;
}
