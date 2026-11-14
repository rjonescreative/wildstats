// Shared fetch for the NHL APIs (and other upstream feeds), used by server.js and the Pages Functions.
//
// The NHL rate-limits busy callers (HTTP 429) — Cloudflare's shared egress IPs especially — and
// has short 5xx blips. This helper:
//   1. Caches successful responses for `ttl` seconds, so many visitors (and routes that share an
//      upstream URL, e.g. club-stats or player landing pages) cost one NHL request per ttl.
//      Workers use the edge cache (caches.default); Node uses a small in-memory map.
//   2. Retries 429 / 5xx / network errors / timeouts with a short backoff (honours Retry-After).
// It returns a normal Response. Failed responses are returned (not thrown) after the last retry,
// so callers keep their existing `if (!response.ok) throw …` checks.

const DEFAULT_TTL = 60;          // seconds a successful response is reused
const DEFAULT_RETRIES = 2;       // extra attempts after the first
const DEFAULT_TIMEOUT = 10000;   // ms per attempt
const MAX_RETRY_WAIT = 2000;     // ms; never wait longer than this between attempts
const MEMORY_CACHE_LIMIT = 500;  // Node only

const isRetryable = status => status === 429 || status >= 500;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryDelay(response, attempt) {
    const retryAfter = Number(response?.headers?.get('Retry-After'));
    const backoff = 300 * 3 ** attempt; // 300ms, 900ms, …
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff;
    return Math.min(wait, MAX_RETRY_WAIT) + Math.random() * 100;
}

// ---- response cache -------------------------------------------------------------------------

const edgeCache = () => (typeof caches !== 'undefined' && caches.default) || null;
const memoryCache = new Map(); // url → { body, status, headers, expires }

function cacheKey(url) {
    const u = new URL(url);
    u.searchParams.set('__upstream', '1'); // keep apart from any other cached copy of the URL
    return u.toString();
}

async function readCache(url) {
    const key = cacheKey(url);
    const edge = edgeCache();
    if (edge) return edge.match(new Request(key)).catch(() => null);

    const hit = memoryCache.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
        memoryCache.delete(key);
        return null;
    }
    return new Response(hit.body, { status: hit.status, headers: hit.headers });
}

async function writeCache(url, response, ttl) {
    const key = cacheKey(url);
    const edge = edgeCache();
    const body = await response.clone().arrayBuffer();
    const headers = new Headers(response.headers);
    headers.delete('Set-Cookie');
    headers.set('Cache-Control', `public, max-age=${ttl}`);

    if (edge) {
        await edge.put(new Request(key), new Response(body, { status: response.status, headers })).catch(() => {});
        return;
    }
    if (memoryCache.size >= MEMORY_CACHE_LIMIT) memoryCache.delete(memoryCache.keys().next().value);
    memoryCache.set(key, { body, status: response.status, headers: [...headers], expires: Date.now() + ttl * 1000 });
}

// ---- fetch ----------------------------------------------------------------------------------

async function attempt(url, init, timeout) {
    // A caller-supplied signal (e.g. a page render's time budget) wins over our own timeout
    if (init.signal) return fetch(url, { redirect: 'follow', ...init });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { redirect: 'follow', ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Drop-in replacement for fetch() for upstream URLs, with caching and retries.
 * Extra init keys (removed before fetching):
 *   ttl     seconds to reuse a successful response (default 60; 0 = don't cache)
 *   retries extra attempts on 429 / 5xx / network errors (default 2; 0 when init.signal is given,
 *           since the caller has its own time budget)
 *   timeout ms per attempt (default 10000; ignored when init.signal is given)
 * @returns {Promise<Response>}
 */
export async function upstreamFetch(url, { ttl = DEFAULT_TTL, retries, timeout = DEFAULT_TIMEOUT, ...init } = {}) {
    retries ??= init.signal ? 0 : DEFAULT_RETRIES;

    if (ttl > 0) {
        const cached = await readCache(url);
        if (cached) return cached;
    }

    let lastError;
    for (let i = 0; i <= retries; i++) {
        let response = null;
        try {
            response = await attempt(url, init, timeout);
            if (!isRetryable(response.status)) {
                if (response.ok && ttl > 0) await writeCache(url, response, ttl);
                return response;
            }
            lastError = null;
        } catch (error) {
            lastError = error; // network error or timeout
        }
        if (i === retries) {
            if (response) return response;
            throw lastError;
        }
        await sleep(retryDelay(response, i));
    }
}

/** Run `fn` over `items` with at most `limit` in flight (keeps fan-outs from tripping rate limits). */
export async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            try {
                results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
            } catch (reason) {
                results[i] = { status: 'rejected', reason };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}
