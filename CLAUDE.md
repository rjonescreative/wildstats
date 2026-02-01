# Claude Instructions for WildStats

## Project Rules

1. **Never commit and push without permission.** Always wait for explicit user approval before running `git commit` or `git push`.

2. **Always consider mobile view when designing layouts.** Ensure responsive design works on smaller screens. Test CSS changes against mobile breakpoints.

3. **API work must support both environments.** When adding or modifying API endpoints:
   - Update the local Express server (`server.js`)
   - Create/update the corresponding Cloudflare Function in `functions/api/`
   - Cloudflare Functions use the pattern: `functions/api/[path]/[file].js` with `export async function onRequest(context)`

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
