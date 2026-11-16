// All-team career regular-season totals for the current Wild roster (~28 NHL requests to build).
// Rebuilt only after Wild games finish — see js/gameTriggered.js and js/gameTriggeredData.js.

import { upstreamFetch, mapLimit } from './upstream.js';

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
    const r = await upstreamFetch(url, { redirect: 'follow' });
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

// Build { [playerId]: { gamesPlayed, goals, assists, points, ev/pp/sh/en Goals/Assists/Points } }.
// landingTtl: seconds to cache each landing page (0 on Cloudflare, where per-call caching would
// exceed the Worker subrequest limit). Any landing page failure fails the whole build, so a
// stored or last good copy is used instead of zeros for an unknown player.
// Resolves to { data, complete }.
export async function buildCareerTotals(season, landingTtl = 0) {
    const rosterRes = await upstreamFetch(`https://api-web.nhle.com/v1/club-stats/MIN/${season}/2`, { redirect: 'follow' });
    if (!rosterRes.ok) throw new Error(`Roster fetch failed: ${rosterRes.status}`);
    const rosterData = await rosterRes.json();
    const players = [
        ...(rosterData.skaters || []).map(p => p.playerId),
        ...(rosterData.goalies  || []).map(p => p.playerId),
    ];

    // A few at a time to stay under the NHL rate limit. No per-call retries, and the first failure
    // stops the rest: a rate-limited NHL API would otherwise take ~3 requests per player (and pass
    // the Worker subrequest limit), when the whole rebuild is retried later anyway (ATTEMPT_LOCK_MS).
    let firstFailure = null;
    const results = await mapLimit(players, 6, async playerId => {
        if (firstFailure) throw firstFailure;
        const r = await upstreamFetch(`https://api-web.nhle.com/v1/player/${playerId}/landing`, { ttl: landingTtl, retries: 0 });
        if (!r.ok) throw (firstFailure ??= new Error(`Landing fetch failed for ${playerId}: ${r.status}`));
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
    });
    const failed = results.find(r => r.status === 'rejected');
    if (failed) throw failed.reason;

    const careerTotals = {};
    results.forEach(r => {
        const { playerId, ...stats } = r.value;
        careerTotals[playerId] = stats;
    });

    // Empty-net career totals (if this fails, those milestones are just skipped)
    let enByPlayer = null;
    try {
        enByPlayer = await fetchEmptyNetCareers(players);
    } catch (err) {
        console.warn('Empty-net career totals unavailable:', err.message);
    }
    addEmptyNetCareers(careerTotals, enByPlayer);
    // Without empty-net stats the build is incomplete, so it's rechecked rather than kept until the next game
    return { data: careerTotals, complete: enByPlayer !== null };
}
