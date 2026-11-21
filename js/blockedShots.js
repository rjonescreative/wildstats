// Blocked shots for /api/wild/stats — shared by server.js and the Cloudflare Function.
// club-stats has no blocked shots, so they come from the stats API's skater realtime report
// (franchiseId 37 = Minnesota Wild, counting only games played for the Wild).
import { upstreamFetch } from './upstream.js';

export const realtimeReportUrl = season =>
    `https://api.nhle.com/stats/rest/en/skater/realtime?limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=2%20and%20franchiseId=37`;

// Adds blockedShots to each club-stats skater found in the report
export function addBlockedShots(clubStats, report) {
    const byPlayer = new Map((report?.data ?? []).map(r => [r.playerId, r]));
    (clubStats.skaters ?? []).forEach(skater => {
        const r = byPlayer.get(skater.playerId);
        if (r) skater.blockedShots = r.blockedShots;
    });
    return clubStats;
}

// The report is extra detail: a failed fetch leaves the blocks off instead of failing the stats
export async function fetchRealtimeReport(season, options = {}) {
    try {
        const response = await upstreamFetch(realtimeReportUrl(season), options);
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}
