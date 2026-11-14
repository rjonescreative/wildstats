// Cloudflare Pages middleware for every /api route — shared edge cache + last-good fallback.
//
// 1. Fresh copy: each successful JSON response is kept in the edge cache under its URL. While it's
//    younger than the route's own max-age (capped at FRESH_CAP), it's served straight from the
//    cache without running the route, so visitors don't each cost NHL API requests (the NHL
//    rate-limits Cloudflare's shared IPs with HTTP 429).
// 2. Last good: when a route fails (5xx/429/thrown), the last good copy is served instead, marked
//    X-Data-Stale so the browser can log that the data isn't real time. The edge cache is per data
//    center, so a copy is also kept in R2 (global) and used when this data center has none.
// Routes with their own R2 fallback set X-Data-Stale themselves; those responses aren't kept.

const LAST_GOOD_TTL = 7 * 24 * 60 * 60; // keep an edge copy for a week
const STALE_MAX_AGE = 60;                // browsers retry the real data after a minute
const FRESH_CAP = 300;                   // serve a cached copy without re-running the route for at most 5 min
const R2_REFRESH = 15 * 60 * 1000;       // rewrite a URL's R2 copy at most every 15 min (per data center)
const R2_PREFIX = 'api-last-good/';

// Cache key for a URL's last good copy, kept apart from any normal edge caching of that URL
function lastGoodKey(url) {
    const u = new URL(url);
    u.searchParams.set('__lastGood', '1');
    return new Request(u.toString());
}

function r2Key(url) {
    const u = new URL(url);
    return R2_PREFIX + u.pathname.replace(/^\/api\//, '') + u.search;
}

// 5xx or rate-limited: worth falling back. Other 4xx (e.g. no H2H data yet) are real answers.
const isFailure = status => status >= 500 || status === 429;

function maxAge(headers) {
    const match = /max-age=(\d+)/.exec(headers.get('Cache-Control') || '');
    return match ? Number(match[1]) : 0;
}

function ageMs(cached) {
    const updated = Date.parse(cached?.headers.get('X-Data-Updated') || '');
    return Number.isFinite(updated) ? Date.now() - updated : Infinity;
}

function staleResponse(body, headers) {
    const h = new Headers(headers);
    h.set('X-Data-Stale', 'true');
    h.set('Cache-Control', `public, max-age=${STALE_MAX_AGE}`);
    h.set('Access-Control-Allow-Origin', '*');
    return new Response(body, { status: 200, headers: h });
}

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'GET') return context.next();

    const cache = caches.default;
    const key = lastGoodKey(request.url);
    const cached = await cache.match(key).catch(() => null);

    // 1. Recent enough copy: serve it without running the route
    if (cached) {
        const freshFor = Math.min(Number(cached.headers.get('X-Fresh-For')) || 0, FRESH_CAP) * 1000;
        const age = ageMs(cached);
        if (age < freshFor) {
            const headers = new Headers(cached.headers);
            headers.set('Cache-Control', `public, max-age=${Math.max(1, Math.floor((freshFor - age) / 1000))}`);
            headers.set('Access-Control-Allow-Origin', '*');
            headers.delete('X-Fresh-For');
            return new Response(cached.body, { status: 200, headers });
        }
    }

    let response = null;
    try {
        response = await context.next();
    } catch {
        // treated as a failure below
    }

    if (response && !isFailure(response.status)) {
        const isJson = response.headers.get('content-type')?.includes('application/json');
        if (response.status === 200 && isJson && !response.headers.get('X-Data-Stale')) {
            const updatedAt = new Date().toISOString();
            const headers = new Headers(response.headers);
            headers.set('X-Fresh-For', String(maxAge(response.headers)));
            headers.set('Cache-Control', `public, max-age=${LAST_GOOD_TTL}`);
            headers.set('X-Data-Updated', updatedAt);
            const body = await response.clone().arrayBuffer();
            context.waitUntil(
                cache.put(key, new Response(body, { status: 200, headers })).catch(() => {}) // a failed copy just means no fallback next time
            );
            // Global copy for data centers that have none (throttled to limit R2 writes)
            if (env?.H2H_DATA && ageMs(cached) > R2_REFRESH) {
                context.waitUntil(
                    env.H2H_DATA.put(r2Key(request.url), body, {
                        httpMetadata: { contentType: response.headers.get('content-type') },
                        customMetadata: { updatedAt },
                    }).catch(() => {})
                );
            }
        }
        return response;
    }

    // 2. Failure: last good copy from this data center, then from R2
    if (cached) {
        const headers = new Headers(cached.headers);
        headers.delete('X-Fresh-For');
        return staleResponse(cached.body, headers);
    }

    const stored = env?.H2H_DATA ? await env.H2H_DATA.get(r2Key(request.url)).catch(() => null) : null;
    if (stored) {
        return staleResponse(stored.body, {
            'Content-Type': stored.httpMetadata?.contentType || 'application/json',
            'X-Data-Updated': stored.customMetadata?.updatedAt || stored.uploaded?.toISOString?.() || '',
        });
    }

    return response ?? new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
}
