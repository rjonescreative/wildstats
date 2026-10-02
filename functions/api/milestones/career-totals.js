// Returns all-team career regular season stats for current Wild roster.
// Response: { [playerId]: { gamesPlayed, goals, assists, points, ev/pp/sh/en Goals/Assists/Points } }
import { getCurrentSeason } from '../../../js/seasonConfig.js';

// A missing split value can only be inferred when the matching total is 0; otherwise it's null (excluded)
function inferred(value, total) {
    return value ?? (total === 0 ? 0 : null);
}

// Even-strength, power-play, and short-handed career totals from a player landing page.
// Landing pages have no even-strength split, but goals/points = EV + PP + SH, so EV is the remainder.
function situationalFromLanding(rs) {
    const ppGoals  = inferred(rs.powerPlayGoals, rs.goals ?? 0);
    const ppPoints = inferred(rs.powerPlayPoints, rs.points ?? 0);
    const shGoals  = inferred(rs.shorthandedGoals, rs.goals ?? 0);
    const shPoints = inferred(rs.shorthandedPoints, rs.points ?? 0);
    const evGoals  = ppGoals === null || shGoals === null ? null : (rs.goals ?? 0) - ppGoals - shGoals;
    const evPoints = ppPoints === null || shPoints === null ? null : (rs.points ?? 0) - ppPoints - shPoints;
    return {
        evGoals, evPoints, evAssists: evGoals === null || evPoints === null ? null : evPoints - evGoals,
        ppGoals, ppPoints, ppAssists: ppGoals === null || ppPoints === null ? null : ppPoints - ppGoals,
        shGoals, shPoints, shAssists: shGoals === null || shPoints === null ? null : shPoints - shGoals,
    };
}

// All-team career empty-net totals (landing pages don't include them), one stats API request
async function fetchEmptyNetCareers(playerIds) {
    const cayenne = `gameTypeId=2 and playerId in (${playerIds.join(',')})`;
    const url = `https://api.nhle.com/stats/rest/en/skater/realtime?isAggregate=true&isGame=false&limit=-1&cayenneExp=${encodeURIComponent(cayenne)}`;
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`Empty-net fetch failed: ${r.status}`);
    const { data = [] } = await r.json();
    return new Map(data.map(row => [row.playerId, row]));
}

// Merge empty-net career totals into careerTotals (missing data stays null → excluded)
function addEmptyNetCareers(careerTotals, enByPlayer) {
    for (const [playerId, stats] of Object.entries(careerTotals)) {
        const row = enByPlayer?.get(Number(playerId)) ?? {};
        const enGoals   = inferred(row.emptyNetGoals, stats.goals);
        const enAssists = inferred(row.emptyNetAssists, stats.assists);
        stats.enGoals   = enGoals;
        stats.enAssists = enAssists;
        stats.enPoints  = enGoals === null || enAssists === null ? null : enGoals + enAssists;
    }
}

export async function onRequest() {
    try {
        // Step 1: get current Wild roster
        const rosterRes = await fetch(`https://api-web.nhle.com/v1/club-stats/MIN/${getCurrentSeason()}/2`, {
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
                        ...situationalFromLanding(rs),
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

        // Step 3: empty-net career totals (if this fails, those milestones are just skipped)
        let enByPlayer = null;
        try {
            enByPlayer = await fetchEmptyNetCareers(players);
        } catch (err) {
            console.warn('Empty-net career totals unavailable:', err.message);
        }
        addEmptyNetCareers(careerTotals, enByPlayer);

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
