# Claude Instructions for WildStats

## CRITICAL - Read First

1. **Never commit or push without explicit permission.** Each commit/push requires separate approval. Permission for one commit does not extend to subsequent commits.

2. **API changes require BOTH local and production updates.** Before marking any API work complete, verify both files are updated:
   - `server.js` (local Express server)
   - `functions/api/[path].js` (Cloudflare Function)

## API Change Checklist

When adding or modifying API endpoints, complete ALL steps:

- [ ] Update the local Express server (`server.js`)
- [ ] Update/create the Cloudflare Function in `functions/api/`
- [ ] Verify response format matches between both implementations
- [ ] Test locally before committing

Cloudflare Functions pattern: `functions/api/[path]/[file].js` with `export async function onRequest(context)`

## Project Rules

1. **Always consider mobile view when designing layouts.** Ensure responsive design works on smaller screens. Test CSS changes against mobile breakpoints.

2. **Local server restarts are permitted.** You may stop and restart the local Express server as needed without additional permission.

3. **Include all changed files in commits.** When committing, always include all modified/staged files, even if they weren't part of the most recent changes, unless told otherwise.

4. **Update page titles and analytics when adding pages.** When adding new pages or views:
   - Add the page title to `getPageTitle()` in `js/router.js` using format: `Wild Hockey Hub | Page Name`
   - Ensure GTM tracks the new page with a unique URL and page view event
   - For sub-views (like standings tabs), use format: `Wild Hockey Hub | Parent | Child`

## Project Structure

- `server.js` - Local Express development server
- `functions/api/` - Cloudflare Pages Functions for production
- `js/` - Frontend JavaScript modules
- `js/api.js` - API client functions
- `js/views/` - View modules (dashboard, stats, schedule, standings)
- `styles.css` - All styling with CSS variables

## Tech Stack

- Frontend: Vanilla JS (ES modules), CSS
- Local dev: Express.js on port 3000
- Production: Cloudflare Pages with Functions
- Data source: NHL API (`api-web.nhle.com`)
