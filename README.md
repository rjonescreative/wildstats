# Wild Stats

A real-time Minnesota Wild hockey statistics tracker built as a modern single-page application (SPA).

## Features

- **Dashboard** - Team stat leaders and Central Division standings
- **Player Stats** - Complete skater and goalie statistics for the Minnesota Wild
- **NHL Standings** - Multiple views:
  - **Wildcard** - Playoff wildcard standings for each conference
  - **Division** - Atlantic, Metropolitan, Central, and Pacific divisions
  - **Conference** - Eastern and Western conference standings
  - **League** - All 32 teams ranked by overall standings
- **Real-time Data** - Live data from the official NHL API
- **Smart Caching** - 5-minute cache to reduce API calls and improve performance
- **State Persistence** - Sort preferences and UI state persist when navigating between views
- **Responsive Design** - Works on desktop and mobile devices
- **Team Colors** - Styled with official Minnesota Wild colors (green, red, gold)

## Architecture

Built as a single-page application (SPA) using vanilla JavaScript with:
- **Client-side routing** - Navigation without page reloads using History API
- **Modular ES6 architecture** - Clean separation of concerns
- **Centralized state management** - Efficient data caching and UI state
- **Environment detection** - Different API endpoints for development vs production

## Development vs Production

**Development Mode** (localhost):
- Uses Node.js proxy server to avoid CORS issues
- API requests go through `/api/*` endpoints
- Run with `npm start`

**Production Mode** (deployed):
- Calls NHL API directly from the browser (no server needed)
- Can be deployed to any static hosting platform
- API requests go directly to `https://api-web.nhle.com/v1/*`

## How to Run Locally

### First Time Setup

Install dependencies:

```bash
npm install
```

### Start the Development Server

```bash
npm start
```

Then open your browser to `http://localhost:3000`

## Deployment

This app can be deployed to any static hosting platform (Vercel, Netlify, GitHub Pages, etc.):

1. Build/deploy the static files (index.html, js/, styles.css, logos/)
2. No server configuration needed - the app automatically detects production mode
3. All API calls go directly to the NHL API in production

## Project Structure

```
wildstats/
├── index.html           # Single HTML file with all views
├── styles.css          # Styling with Wild team colors
├── server.js           # Node.js/Express server (dev only)
├── js/
│   ├── main.js         # Entry point and router initialization
│   ├── router.js       # Client-side routing with History API
│   ├── state.js        # Centralized state management and caching
│   ├── api.js          # Data fetching with environment detection
│   └── views/
│       ├── dashboard.js   # Dashboard view module
│       ├── stats.js       # Player stats view module
│       └── standings.js   # Standings view module
├── logos/              # NHL team logos
└── package.json        # Dependencies
```

## Data Source

All data is fetched from the official NHL API:
- API Documentation: [NHL API Reference](https://github.com/Zmalski/NHL-API-Reference)
- Endpoints:
  - Standings: `https://api-web.nhle.com/v1/standings/now`
  - Team Stats: `https://api-web.nhle.com/v1/club-stats/MIN/now`
  - League Leaders: `https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2`

## Performance

- **Instant navigation** - No page reloads when switching between views
- **Smart caching** - Data cached for 5 minutes, reducing API calls by ~95%
- **Optimized rendering** - Only re-renders when data changes or user sorts
- **Stale-while-revalidate** - Shows cached data immediately, fetches updates in background

## Technology Stack

- Vanilla JavaScript (ES6 modules)
- HTML5 & CSS3
- Express.js (development server only)
- NHL API (official data source)

## Future Enhancements

Potential features to add:
- Live game scores and updates
- Player comparison tools
- Historical statistics and trends
- Game schedule and results
- Advanced filtering and search
- Dark/light theme toggle
