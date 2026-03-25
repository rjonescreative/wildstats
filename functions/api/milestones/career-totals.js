// Returns all-team career regular season stats for current Wild roster.
// Response: { [playerId]: { gamesPlayed, goals, assists, points } }
export async function onRequest() {
    try {
        // Step 1: get current Wild roster
        const rosterRes = await fetch('https://api-web.nhle.com/v1/club-stats/MIN/20252026/2', {
            redirect: 'follow',
        });
        if (!rosterRes.ok) throw new Error(`Roster fetch failed: ${rosterRes.status}`);
        const rosterData = await rosterRes.json();

        const players = [
            ...(rosterData.skaters || []).map(p => p.playerId),
            ...(rosterData.goalies  || []).map(p => p.playerId),
        ];

        // Step 2: fetch each player's landing page in parallel for career totals
        const results = await Promise.allSettled(
            players.map(async playerId => {
                try {
                    const r = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/landing`, {
                        redirect: 'follow',
                    });
                    const d = await r.json();
                    const rs = d.careerTotals?.regularSeason ?? {};
                    return {
                        playerId,
                        gamesPlayed: rs.gamesPlayed ?? 0,
                        goals:       rs.goals       ?? 0,
                        assists:     rs.assists     ?? 0,
                        points:      rs.points      ?? 0,
                    };
                } catch {
                    return { playerId, gamesPlayed: 0, goals: 0, assists: 0, points: 0 };
                }
            })
        );

        const careerTotals = {};
        results.forEach(r => {
            if (r.status === 'fulfilled') {
                const { playerId, ...stats } = r.value;
                careerTotals[playerId] = stats;
            }
        });

        return new Response(JSON.stringify(careerTotals), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to fetch career totals.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
