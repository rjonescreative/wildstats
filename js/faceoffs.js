// Faceoff counts for /api/wild/stats — shared by server.js and the Cloudflare Function.
// club-stats only has faceoffWinPctg, so wins and totals come from the stats API's faceoff report
// (franchiseId 37 = Minnesota Wild, counting only games played for the Wild).

export const faceoffReportUrl = season =>
    `https://api.nhle.com/stats/rest/en/skater/faceoffwins?limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=2%20and%20franchiseId=37`;

// Adds faceoffWins / faceoffTotal to each club-stats skater found in the report
export function addFaceoffCounts(clubStats, report) {
    const byPlayer = new Map((report?.data ?? []).map(r => [r.playerId, r]));
    (clubStats.skaters ?? []).forEach(skater => {
        const r = byPlayer.get(skater.playerId);
        if (r) {
            skater.faceoffWins = r.totalFaceoffWins;
            skater.faceoffTotal = r.totalFaceoffs;
        }
    });
    return clubStats;
}

// The report is extra detail: a failed fetch leaves the counts off instead of failing the stats
export async function fetchFaceoffReport(season, options = {}) {
    try {
        const response = await fetch(faceoffReportUrl(season), options);
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}
