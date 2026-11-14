// Returns all-team career regular season stats for current Wild roster.
// Response: { [playerId]: { gamesPlayed, goals, assists, points } }
import { getCurrentSeason } from '../../../js/seasonConfig.js';
import { upstreamFetch, mapLimit } from '../../../js/upstream.js';

export async function onRequest() {
    try {
        // Step 1: get current Wild roster
        const rosterRes = await upstreamFetch(`https://api-web.nhle.com/v1/club-stats/MIN/${getCurrentSeason()}/2`, {
            redirect: 'follow',
        });
        if (!rosterRes.ok) throw new Error(`Roster fetch failed: ${rosterRes.status}`);
        const rosterData = await rosterRes.json();

        const players = [
            ...(rosterData.skaters || []).map(p => p.playerId),
            ...(rosterData.goalies  || []).map(p => p.playerId),
        ];

        // Step 2: each player's landing page, a few at a time; any failure fails the route so the
        // /api middleware serves the last complete copy instead of zeros
        const results = await mapLimit(players, 6, async playerId => {
            // fan-out: no per-call cache (subrequest limit)
            const r = await upstreamFetch(`https://api-web.nhle.com/v1/player/${playerId}/landing`, { ttl: 0 });
            if (!r.ok) throw new Error(`Landing fetch failed for ${playerId}: ${r.status}`);
            const rs = (await r.json()).careerTotals?.regularSeason ?? {};
            return {
                playerId,
                gamesPlayed: rs.gamesPlayed ?? 0,
                goals:       rs.goals       ?? 0,
                assists:     rs.assists     ?? 0,
                points:      rs.points      ?? 0,
            };
        });
        const failed = results.find(r => r.status === 'rejected');
        if (failed) throw failed.reason;

        const careerTotals = {};
        results.forEach(r => {
            const { playerId, ...stats } = r.value;
            careerTotals[playerId] = stats;
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
