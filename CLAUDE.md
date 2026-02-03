# Claude Instructions for WildStats

## Project Rules

1. **Never commit and push without permission.** Always wait for explicit user approval before running `git commit` or `git push`.

2. **Always consider mobile view when designing layouts.** Ensure responsive design works on smaller screens. Test CSS changes against mobile breakpoints.

3. **API work must support both environments.** When adding or modifying API endpoints:
   - Update the local Express server (`server.js`)
   - Create/update the corresponding Cloudflare Function in `functions/api/`
   - Cloudflare Functions use the pattern: `functions/api/[path]/[file].js` with `export async function onRequest(context)`

4. **Local server restarts are permitted.** You may stop and restart the local Express server as needed without additional permission.

5. **Include all changed files in commits.** When committing, always include all modified/staged files, even if they weren't part of the most recent changes, unless told otherwise.

6. **Update page titles and analytics when adding pages.** When adding new pages or views:
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
