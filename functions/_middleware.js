// Cloudflare Pages middleware for every request: one host for the whole site.
// www.wildhockey.win and the default wildstats.pages.dev address served full copies of the site
// (pages, sitemap, robots.txt), which gives search engines several versions of every URL. Send
// them to the bare domain with a permanent redirect. Preview deployments (<hash>.wildstats.pages.dev)
// are left alone.

const CANONICAL_HOST = 'wildhockey.win';
const ALIAS_HOSTS = new Set([`www.${CANONICAL_HOST}`, 'wildstats.pages.dev']);

export async function onRequest(context) {
    const url = new URL(context.request.url);
    if (ALIAS_HOSTS.has(url.hostname)) {
        url.hostname = CANONICAL_HOST;
        url.protocol = 'https:';
        return Response.redirect(url.href, 301);
    }
    return context.next();
}
