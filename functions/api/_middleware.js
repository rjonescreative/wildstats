// Cloudflare Pages middleware for every /api route — shared edge cache + last-good fallback.
//
// 1. Fresh copy: each successful JSON response is kept in the edge cache under its URL. While it's
//    younger than the route's own max-age (capped at FRESH_CAP, or its FRESH_CAPS entry), it's served straight from the
//    cache without running the route, so visitors don't each cost NHL API requests (the NHL
//    rate-limits Cloudflare's shared IPs with HTTP 429).
// 2. Last good: when a route fails (5xx/429/thrown), the last good copy is served instead, marked
//    X-Data-Stale so the browser can log that the data isn't real time. The edge cache is per data
//    center, so a copy is also kept in R2 (global) and used when this data center has none.
// 3. Deadline: a route that hasn't answered within ROUTE_DEADLINE while a last good copy exists
//    gets the copy served in its place. The route keeps running in the background and refreshes
//    the copy if it succeeds, so a hung NHL API (up to ~16s of timeouts and retries per call)
//    costs visitors at most the deadline. With no copy to fall back on, the route is awaited.
// 4. Failing URL: when a URL's route fails, it's marked failing for FAILING_FOR. While marked, its
//    last good copy is served at once without running the route, so an outage doesn't keep paying
//    the deadline or hammer a rate-limited NHL API. Once the mark expires, the next visitor's
//    request tries the route again (within the deadline).
// Routes with their own R2 fallback set X-Data-Stale themselves; those responses aren't kept.

const LAST_GOOD_TTL = 7 * 24 * 60 * 60; // keep an edge copy for a week
const STALE_MAX_AGE = 60;                // browsers retry the real data after a minute
const FRESH_CAP = 300;                   // serve a cached copy without re-running the route for at most 5 min
// Routes whose data only changes after games get a longer cap (still never past the route's own
// max-age). Career totals checks for a newly finished Wild game each run and rebuilds (~28 NHL
// requests) only after one (js/careerTotals.js); an hour's cap keeps even the check to once an
// hour per data center.
const FRESH_CAPS = { '/api/milestones/career-totals': 3600 };
const R2_REFRESH = 15 * 60 * 1000;       // rewrite a URL's R2 copy at most every 15 min (per data center)
const R2_PREFIX = 'api-last-good/';
const ROUTE_DEADLINE = 2000;             // ms to wait for a route before serving the last good copy
// Routes that fan out to many NHL requests and can pass 2s even when the NHL is healthy
const SLOW_ROUTE_DEADLINES = { '/api/milestones/career-totals': 8000 };
const FAILING_FOR = 60;                  // seconds a failed URL serves its last good copy without retrying

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Cache key for a URL's last good copy, kept apart from any normal edge caching of that URL
function lastGoodKey(url) {
    const u = new URL(url);
    u.searchParams.set('__lastGood', '1');
    return new Request(u.toString());
}

// Cache key marking a URL whose route failed recently (see 4. above)
function failingKey(url) {
    const u = new URL(url);
    u.searchParams.set('__failing', '1');
    return new Request(u.toString());
}

// Query params the site's own requests use (news and videos paging). A URL with any other param,
// or an unusual value, gets no R2 copy, so made-up query strings can't fill the bucket.
const R2_PARAMS = { offset: /^\d{1,4}$/, limit: /^\d{1,3}$/, type: /^[a-z-]{1,20}$/ };

// R2 key for a URL's global last-good copy, or null if the URL shouldn't have one
function r2Key(url) {
    const u = new URL(url);
    const params = [...u.searchParams];
    if (params.some(([name, value]) => !R2_PARAMS[name]?.test(value))) return null;
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
    const failKey = failingKey(request.url);
    const storeKey = env?.H2H_DATA ? r2Key(request.url) : null; // null: no global copy for this URL
    const [cached, failing] = await Promise.all([
        cache.match(key).catch(() => null),
        cache.match(failKey).catch(() => null),
    ]);

    // 1. Recent enough copy: serve it without running the route
    if (cached) {
        const cap = FRESH_CAPS[new URL(request.url).pathname] ?? FRESH_CAP;
        const freshFor = Math.min(Number(cached.headers.get('X-Fresh-For')) || 0, cap) * 1000;
        const age = ageMs(cached);
        if (age < freshFor) {
            const headers = new Headers(cached.headers);
            headers.set('Cache-Control', `public, max-age=${Math.max(1, Math.floor((freshFor - age) / 1000))}`);
            headers.set('Access-Control-Allow-Origin', '*');
            headers.delete('X-Fresh-For');
            return new Response(cached.body, { status: 200, headers });
        }
    }

    // Last good copy to fall back on: this data center's, else R2's (looked up at most once, and
    // only once it's needed, so a healthy route costs no R2 reads)
    let lastGood;
    const loadLastGood = () => lastGood ??= (async () => {
        if (cached) {
            const headers = new Headers(cached.headers);
            headers.delete('X-Fresh-For');
            return staleResponse(cached.body, headers);
        }
        const stored = storeKey ? await env.H2H_DATA.get(storeKey).catch(() => null) : null;
        return stored
            ? staleResponse(stored.body, {
                'Content-Type': stored.httpMetadata?.contentType || 'application/json',
                'X-Data-Updated': stored.customMetadata?.updatedAt || stored.uploaded?.toISOString?.() || '',
            })
            : null;
    })();

    // 4. Failed recently: serve the last good copy straight away
    if (failing) {
        const fallback = await loadLastGood();
        if (fallback) return fallback;
    }

    // Run the route; keep a successful answer as the last good copy, or mark the URL failing.
    // Resolves to { response, ok } (response null when the route threw).
    const run = (async () => {
        let response = null;
        try {
            response = await context.next();
        } catch {
            // treated as a failure below
        }

        if (!response || isFailure(response.status)) {
            const mark = new Response('1', { headers: { 'Cache-Control': `public, max-age=${FAILING_FOR}` } });
            await cache.put(failKey, mark).catch(() => {});
            return { response, ok: false };
        }

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
            if (storeKey && ageMs(cached) > R2_REFRESH) {
                context.waitUntil(
                    env.H2H_DATA.put(storeKey, body, {
                        httpMetadata: { contentType: response.headers.get('content-type') },
                        customMetadata: { updatedAt },
                    }).catch(() => {})
                );
            }
        }
        return { response, ok: true };
    })();

    // 3. Deadline: past it, serve the last good copy if there is one and let the route finish
    // in the background (refreshing the copy, or marking the URL failing)
    const deadline = SLOW_ROUTE_DEADLINES[new URL(request.url).pathname] ?? ROUTE_DEADLINE;
    const first = await Promise.race([run, sleep(deadline).then(() => null)]);
    if (!first) {
        const fallback = await loadLastGood();
        if (fallback) {
            context.waitUntil(run);
            return fallback;
        }
    }

    const { response, ok } = first ?? await run;
    if (ok) return response;

    // 2. Failure: last good copy from this data center, then from R2
    const fallback = await loadLastGood();
    if (fallback) return fallback;

    return response ?? new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
}
