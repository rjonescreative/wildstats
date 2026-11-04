// Cloudflare Pages middleware for every /api route — last-good fallback.
// Each successful JSON response is kept in the edge cache under its URL. When a route fails
// (usually the NHL API being down or rate-limiting us), the last good copy is served instead,
// marked with X-Data-Stale so the browser can log that the data isn't real time.
// Routes with their own R2 fallback set X-Data-Stale themselves; those responses aren't kept.

const LAST_GOOD_TTL = 7 * 24 * 60 * 60; // keep a copy for a week
const STALE_MAX_AGE = 60;                // browsers retry the real data after a minute

// Cache key for a URL's last good copy, kept apart from any normal edge caching of that URL
function lastGoodKey(url) {
    const u = new URL(url);
    u.searchParams.set('__lastGood', '1');
    return new Request(u.toString());
}

// 5xx or rate-limited: worth falling back. Other 4xx (e.g. no H2H data yet) are real answers.
const isFailure = status => status >= 500 || status === 429;

export async function onRequest(context) {
    const { request } = context;
    if (request.method !== 'GET') return context.next();

    let response = null;
    try {
        response = await context.next();
    } catch {
        // treated as a failure below
    }

    const cache = caches.default;
    const key = lastGoodKey(request.url);

    if (response && !isFailure(response.status)) {
        const isJson = response.headers.get('content-type')?.includes('application/json');
        if (response.status === 200 && isJson && !response.headers.get('X-Data-Stale')) {
            const headers = new Headers(response.headers);
            headers.set('Cache-Control', `public, max-age=${LAST_GOOD_TTL}`);
            headers.set('X-Data-Updated', new Date().toISOString());
            context.waitUntil(
                cache.put(key, new Response(response.clone().body, { status: 200, headers }))
                    .catch(() => {}) // a failed copy just means no fallback next time
            );
        }
        return response;
    }

    const cached = await cache.match(key).catch(() => null);
    if (!cached) {
        return response ?? new Response(JSON.stringify({ error: 'Service unavailable' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

    const headers = new Headers(cached.headers);
    headers.set('X-Data-Stale', 'true');
    headers.set('Cache-Control', `public, max-age=${STALE_MAX_AGE}`);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(cached.body, { status: 200, headers });
}
