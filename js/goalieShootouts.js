// Goalie shootout losses for /api/wild/stats — shared by server.js and the Cloudflare Function.
// club-stats has overtimeLosses (which, per NHL convention, includes shootout losses) but no
// shootout split, so it comes from the stats API's goalie shootout report
// (franchiseId 37 = Minnesota Wild, counting only games played for the Wild).

export const goalieShootoutReportUrl = season =>
    `https://api.nhle.com/stats/rest/en/goalie/shootout?limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=2%20and%20franchiseId=37`;

// Adds shootoutLosses to each club-stats goalie. The report only lists goalies who have been in
// a shootout, so anyone missing from a successful report has 0; a failed report leaves it off.
export function addGoalieShootoutLosses(clubStats, report) {
    if (!report) return clubStats;
    const byPlayer = new Map((report.data ?? []).map(r => [r.playerId, r]));
    (clubStats.goalies ?? []).forEach(goalie => {
        goalie.shootoutLosses = byPlayer.get(goalie.playerId)?.shootoutLosses ?? 0;
    });
    return clubStats;
}

// The report is extra detail: a failed fetch leaves the counts off instead of failing the stats
export async function fetchGoalieShootoutReport(season, options = {}) {
    try {
        const response = await fetch(goalieShootoutReportUrl(season), options);
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}
