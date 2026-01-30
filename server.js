import express from 'express';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// Serve static files (CSS, JS, logos, etc.)
app.use(express.static(__dirname));

// Proxy endpoint for NHL API
app.get('/api/standings/now', async (req, res) => {
    try {
        const response = await fetch('https://api-web.nhle.com/v1/standings/now');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching standings:', error);
        res.status(500).json({ error: 'Failed to fetch standings' });
    }
});

// Wild team stats endpoint
app.get('/api/wild/stats', async (req, res) => {
    try {
        const response = await fetch('https://api-web.nhle.com/v1/club-stats/MIN/now');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching Wild stats:', error);
        res.status(500).json({ error: 'Failed to fetch Wild stats' });
    }
});

// League stat leaders endpoint
app.get('/api/league/leaders', async (req, res) => {
    try {
        const [goalsRes, assistsRes, pointsRes] = await Promise.all([
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=goals&limit=100'),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=assists&limit=100'),
            fetch('https://api-web.nhle.com/v1/skater-stats-leaders/20252026/2?categories=points&limit=100')
        ]);

        const goals = await goalsRes.json();
        const assists = await assistsRes.json();
        const points = await pointsRes.json();

        res.json({ goals, assists, points });
    } catch (error) {
        console.error('Error fetching league leaders:', error);
        res.status(500).json({ error: 'Failed to fetch league leaders' });
    }
});

// SPA catch-all route - serve index.html for all non-API routes
app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Wild Stats server running at http://localhost:${PORT}`);
    console.log(`Open your browser to http://localhost:${PORT}`);
});
