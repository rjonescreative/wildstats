# Wild Stats

A real-time NHL standings website focused on the Minnesota Wild hockey team.

## Features

- **Real-time NHL Standings** - Live data from the official NHL API
- **Multiple Views**:
  - **League** - All 32 teams ranked by overall standings
  - **Conference** - Eastern and Western conference standings
  - **Division** - Atlantic, Metropolitan, Central, and Pacific divisions
  - **Wildcard** - Playoff wildcard standings for each conference
- **Minnesota Wild Highlighting** - The Wild are highlighted in every view
- **Responsive Design** - Works on desktop and mobile devices
- **Team Colors** - Styled with official Minnesota Wild colors (green, red, gold)

## How to Run

The project includes a Node.js server to handle API requests (required due to CORS restrictions).

### First Time Setup

Install dependencies:

```bash
npm install
```

### Start the Server

```bash
npm start
```

Then open your browser to `http://localhost:3000`

## Data Source

All standings data is fetched from the official NHL API:
- API Documentation: [NHL API Reference](https://github.com/Zmalski/NHL-API-Reference)
- Endpoint: `https://api-web.nhle.com/v1/standings/now`

The Node.js server acts as a proxy to handle CORS restrictions.

## Project Structure

```
wildstats/
├── index.html    # Main HTML structure
├── styles.css    # Styling with Wild team colors
├── app.js        # JavaScript for data fetching and rendering
├── server.js     # Node.js/Express server with API proxy
├── package.json  # Node.js dependencies
└── README.md     # This file
```

## Future Enhancements

Potential features to add:
- Player statistics
- Game schedule
- Team roster
- Historical statistics
- Game highlights
- Player comparison tools
