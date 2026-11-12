// Plain HTML versions of pages that the browser otherwise draws from API data, so search engines
// get real, page-specific content in the first response instead of the shared app shell.
// Used by the Cloudflare route function (functions/[[route]].js); the page script replaces each
// one with the full interactive layout when it loads.

import { recordEntries } from './teamRecordsData.js';

export function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const seasonLabel = s => `${s.slice(0, 4)}-${s.slice(6, 8)}`;
const RECENT_GAMES = 25;

// ─── Head-to-head ─────────────────────────────────────────────────────────────

// Wild record as W-L-OTL (OTL = overtime and shootout losses)
const record = side => `${side.wins}-${side.regLosses}-${side.otLosses}`;

function splitRow(label, split) {
    if (!split?.gamesPlayed) return '';
    return `<tr><th scope="row">${label}</th><td>${split.gamesPlayed}</td><td>${record(split.min)}</td>`
        + `<td>${split.min.goalsFor}</td><td>${split.opp.goalsFor}</td></tr>`;
}

function gameResult(g) {
    if (g.minScore > g.oppScore) return g.lastPeriodType === 'REG' ? 'W' : `W (${g.lastPeriodType})`;
    return g.lastPeriodType === 'REG' ? 'L' : `L (${g.lastPeriodType})`;
}

function opponentLinks(teams, currentSlug) {
    return `<h3>Wild head-to-head vs other teams</h3><ul class="search-prerender-links">`
        + teams.filter(t => t.slug !== currentSlug)
            .map(t => `<li><a href="/stats/head-to-head/${t.slug}" data-link>Wild vs ${escapeHtml(t.name)}</a></li>`).join('')
        + `</ul>`;
}

export function renderH2HTeamContent(team, data, teams) {
    const name = escapeHtml(team.name);
    const all = data.allTime;
    const summary = all?.gamesPlayed
        ? `<p>The Minnesota Wild are ${record(all.min)} (W-L-OTL) all-time against the ${name} in the regular season, `
            + `scoring ${all.min.goalsFor} goals and allowing ${all.opp.goalsFor} over ${all.gamesPlayed} games.</p>`
        : `<p>The Minnesota Wild have not played the ${name} in the regular season.</p>`;

    const playoffs = data.playoffs?.gamesPlayed
        ? `<h3>Playoffs</h3><p>In the playoffs the Wild are ${data.playoffs.min.wins}-${data.playoffs.opp.wins} in games `
            + `and ${data.playoffs.seriesWins}-${data.playoffs.seriesLosses} in series against the ${name}, `
            + `with ${data.playoffs.min.goalsFor} goals for and ${data.playoffs.opp.goalsFor} against.</p>`
        : '';

    const recent = [...(data.games ?? [])]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, RECENT_GAMES)
        .map(g => {
            const where = g.isMinHome ? `vs ${name}` : `at ${name}`;
            const type = g.gameType === 3 ? ', playoffs' : '';
            return `<li>${g.date} (${seasonLabel(g.season)}${type}): Wild ${where}, ${g.minScore}-${g.oppScore} ${gameResult(g)}</li>`;
        }).join('');

    return `<div class="search-prerender">`
        + `<h2>Minnesota Wild vs ${name} Head-to-Head</h2>`
        + summary
        + `<table><caption>Wild regular season record vs the ${name}</caption>`
        + `<thead><tr><th scope="col">Span</th><th scope="col">GP</th><th scope="col">W-L-OTL</th><th scope="col">GF</th><th scope="col">GA</th></tr></thead><tbody>`
        + splitRow('This season', data.thisSeason)
        + splitRow('Last season', data.lastSeason)
        + splitRow('Last 5 seasons', data.last5Seasons)
        + splitRow('All-time', all)
        + `</tbody></table>`
        + playoffs
        + (recent ? `<h3>Recent games</h3><ul>${recent}</ul>` : '')
        + `<p><a href="/stats/head-to-head" data-link>All Wild head-to-head records</a></p>`
        + opponentLinks(teams, team.slug)
        + `</div>`;
}

export function renderH2HHubContent(teams) {
    return `<div class="search-prerender">`
        + `<h2>Minnesota Wild Head-to-Head Records</h2>`
        + `<p>Pick an opponent to see the Wild's record, goals for and against, splits by season and every game played against them.</p>`
        + `<ul class="search-prerender-links">`
        + teams.map(t => `<li><a href="/stats/head-to-head/${t.slug}" data-link>Wild vs ${escapeHtml(t.name)}</a></li>`).join('')
        + `</ul></div>`;
}

// ─── Team records ─────────────────────────────────────────────────────────────

// selection: parsed path ({ gameType, timeMode, statMode (data key), posMode }); heading: page title text
export function renderTeamRecordsContent(records, selection, heading) {
    const { entries, showSeason } = recordEntries(records, { ...selection, statKey: selection.statMode });
    if (!entries.length) return null;
    const rows = entries.map((e, i) =>
        `<li>${i + 1}. ${escapeHtml(e.name)}${showSeason && e.season ? ` (${seasonLabel(e.season)})` : ''}: ${e.value}</li>`
    ).join('');
    return `<div class="search-prerender"><h2>${escapeHtml(heading)}</h2><ol>${rows}</ol></div>`;
}

// ─── Points progression ───────────────────────────────────────────────────────

export function renderPointsProgressionContent(standings, seasonText) {
    const byDivision = new Map();
    for (const t of standings) {
        if (!byDivision.has(t.divisionName)) byDivision.set(t.divisionName, []);
        byDivision.get(t.divisionName).push(t);
    }
    // Central (the Wild's division) first
    const divisions = [...byDivision.keys()].sort((a, b) => (b === 'Central') - (a === 'Central') || a.localeCompare(b));

    const tables = divisions.map(div => {
        const rows = byDivision.get(div)
            .sort((a, b) => b.points - a.points || b.pointPctg - a.pointPctg)
            .map(t => `<tr><th scope="row">${escapeHtml(t.teamName.default)}</th><td>${t.gamesPlayed}</td>`
                + `<td>${t.wins}-${t.losses}-${t.otLosses}</td><td>${t.points}</td><td>${t.pointPctg.toFixed(3)}</td></tr>`)
            .join('');
        return `<table><caption>${escapeHtml(div)} Division</caption>`
            + `<thead><tr><th scope="col">Team</th><th scope="col">GP</th><th scope="col">W-L-OTL</th><th scope="col">PTS</th><th scope="col">P%</th></tr></thead>`
            + `<tbody>${rows}</tbody></table>`;
    }).join('');

    return `<div class="search-prerender">`
        + `<h2>NHL Points Progression ${escapeHtml(seasonText)}</h2>`
        + `<p>The points progression chart plots every NHL team's points (or points percentage) after each game of the season, `
        + `so you can see how the Minnesota Wild's pace compares with the Central Division and the rest of the league. Current points by division:</p>`
        + tables
        + `</div>`;
}
