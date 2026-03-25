// Current Season view — team-level stats for 2025-26
import { getTeamSchedule } from '../api.js';

// ─── All 32 teams: division, name, chart color ─────────────────────────────
// Colors chosen to be visible on a dark background while reflecting team identity.
const ALL_TEAMS = {
    // Central Division
    CHI: { name: 'Chicago Blackhawks',    div: 'Central',      lineColor: '#FF4553' },
    COL: { name: 'Colorado Avalanche',    div: 'Central',      lineColor: '#B05076' },
    DAL: { name: 'Dallas Stars',          div: 'Central',      lineColor: '#00C47E' },
    MIN: { name: 'Minnesota Wild',        div: 'Central',      lineColor: '#1C8C47' },
    NSH: { name: 'Nashville Predators',   div: 'Central',      lineColor: '#FFB81C' },
    STL: { name: 'St. Louis Blues',       div: 'Central',      lineColor: '#4A90E2' },
    UTA: { name: 'Utah Hockey Club',      div: 'Central',      lineColor: '#69B3E7' },
    WPG: { name: 'Winnipeg Jets',         div: 'Central',      lineColor: '#7CBDE8' },
    // Pacific Division
    ANA: { name: 'Anaheim Ducks',         div: 'Pacific',      lineColor: '#F47A38' },
    CGY: { name: 'Calgary Flames',        div: 'Pacific',      lineColor: '#D2122E' },
    EDM: { name: 'Edmonton Oilers',       div: 'Pacific',      lineColor: '#FF5500' },
    LAK: { name: 'Los Angeles Kings',     div: 'Pacific',      lineColor: '#B8BABA' },
    SJS: { name: 'San Jose Sharks',       div: 'Pacific',      lineColor: '#00C7C7' },
    SEA: { name: 'Seattle Kraken',        div: 'Pacific',      lineColor: '#8FD4D4' },
    VAN: { name: 'Vancouver Canucks',     div: 'Pacific',      lineColor: '#00B550' },
    VGK: { name: 'Vegas Golden Knights',  div: 'Pacific',      lineColor: '#C9A84C' },
    // Atlantic Division
    BOS: { name: 'Boston Bruins',         div: 'Atlantic',     lineColor: '#FFB81C' },
    BUF: { name: 'Buffalo Sabres',        div: 'Atlantic',     lineColor: '#4A7FD4' },
    DET: { name: 'Detroit Red Wings',     div: 'Atlantic',     lineColor: '#CE1126' },
    FLA: { name: 'Florida Panthers',      div: 'Atlantic',     lineColor: '#C8972A' },
    MTL: { name: 'Montréal Canadiens',    div: 'Atlantic',     lineColor: '#AF1E2D' },
    OTT: { name: 'Ottawa Senators',       div: 'Atlantic',     lineColor: '#E8192C' },
    TBL: { name: 'Tampa Bay Lightning',   div: 'Atlantic',     lineColor: '#3A5DC8' },
    TOR: { name: 'Toronto Maple Leafs',   div: 'Atlantic',     lineColor: '#4A78C4' },
    // Metropolitan Division
    CAR: { name: 'Carolina Hurricanes',   div: 'Metropolitan', lineColor: '#CC0000' },
    CBJ: { name: 'Columbus Blue Jackets', div: 'Metropolitan', lineColor: '#4488C5' },
    NJD: { name: 'New Jersey Devils',     div: 'Metropolitan', lineColor: '#FF3333' },
    NYI: { name: 'New York Islanders',    div: 'Metropolitan', lineColor: '#F47D30' },
    NYR: { name: 'New York Rangers',      div: 'Metropolitan', lineColor: '#4A85E0' },
    PHI: { name: 'Philadelphia Flyers',   div: 'Metropolitan', lineColor: '#F74902' },
    PIT: { name: 'Pittsburgh Penguins',   div: 'Metropolitan', lineColor: '#FCB514' },
    WSH: { name: 'Washington Capitals',   div: 'Metropolitan', lineColor: '#C41230' },
};

const DIVISIONS = {
    Central:      ['CHI', 'COL', 'DAL', 'MIN', 'NSH', 'STL', 'UTA', 'WPG'],
    Pacific:      ['ANA', 'CGY', 'EDM', 'LAK', 'SJS', 'SEA', 'VAN', 'VGK'],
    Atlantic:     ['BOS', 'BUF', 'DET', 'FLA', 'MTL', 'OTT', 'TBL', 'TOR'],
    Metropolitan: ['CAR', 'CBJ', 'NJD', 'NYI', 'NYR', 'PHI', 'PIT', 'WSH'],
};

// ─── Module state ──────────────────────────────────────────────────────────
let activeToggles = new Set(['Central']);
const dataCache = {}; // abbrev → points progression array

// ─── Chart layout ──────────────────────────────────────────────────────────
const VB_W = 900;
const VB_H = 340;
const M = { top: 20, right: 60, bottom: 44, left: 50 };
const PLOT_W = VB_W - M.left - M.right;
const PLOT_H = VB_H - M.top - M.bottom;
const LOGO_SIZE = 22;

// ─── Data helpers ──────────────────────────────────────────────────────────

function computePointsProgression(games, abbrev) {
    const completed = games
        .filter(g => g.gameType === 2 && (g.gameState === 'FINAL' || g.gameState === 'OFF'))
        .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));

    let cum = 0;
    const pts = [{ game: 0, points: 0 }];
    completed.forEach((game, i) => {
        const isHome = game.homeTeam.abbrev === abbrev;
        const myScore  = isHome ? game.homeTeam.score : game.awayTeam.score;
        const oppScore = isHome ? game.awayTeam.score : game.homeTeam.score;
        const lastPeriod = game.gameOutcome?.lastPeriodType ?? 'REG';
        if (myScore > oppScore)                               cum += 2;
        else if (lastPeriod === 'OT' || lastPeriod === 'SO') cum += 1;
        pts.push({ game: i + 1, points: cum });
    });
    return pts;
}

async function loadTeamData(abbrev) {
    if (dataCache[abbrev]) return dataCache[abbrev];
    const schedule = await getTeamSchedule(abbrev, '20252026');
    const data = computePointsProgression(schedule.games ?? [], abbrev);
    dataCache[abbrev] = data;
    return data;
}

// ─── SVG helpers ───────────────────────────────────────────────────────────

function sx(game, xMax) {
    return M.left + (game / xMax) * PLOT_W;
}

function sy(points, yMax) {
    return M.top + PLOT_H - (points / yMax) * PLOT_H;
}

function linePath(data, xMax, yMax) {
    return data
        .map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(d.game, xMax).toFixed(1)},${sy(d.points, yMax).toFixed(1)}`)
        .join(' ');
}

function areaPath(data, xMax, yMax) {
    const line = linePath(data, xMax, yMax);
    const lx   = sx(data[data.length - 1].game, xMax).toFixed(1);
    const bot  = (M.top + PLOT_H).toFixed(1);
    return `${line} L${lx},${bot} L${sx(0, xMax).toFixed(1)},${bot} Z`;
}

// ─── Chart builder (accepts any number of teams) ───────────────────────────

function buildChart(teams) {
    const xMax = teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.game ?? 0), 10);

    const maxPts = teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.points ?? 0), 40);
    const yMax   = Math.ceil((maxPts + 10) / 20) * 20;

    const plotBottom = M.top + PLOT_H;
    const plotRight  = M.left + PLOT_W;

    // Y grid + labels
    const yTicks = [];
    for (let p = 0; p <= yMax; p += 20) yTicks.push(p);

    // X grid + labels (every 10 games)
    const xTicks = [];
    for (let g = 10; g < xMax; g += 10) xTicks.push(g);
    xTicks.push(xMax);

    const gridLines = [
        ...yTicks.map(p => {
            const y = sy(p, yMax).toFixed(1);
            return `<line x1="${M.left}" y1="${y}" x2="${plotRight}" y2="${y}" class="chart-grid"/>
    <text x="${(M.left - 8).toFixed(1)}" y="${y}" dy="0.35em" text-anchor="end" class="chart-label">${p}</text>`;
        }),
        ...xTicks.map(g => {
            const x = sx(g, xMax).toFixed(1);
            return `<line x1="${x}" y1="${M.top}" x2="${x}" y2="${plotBottom}" class="chart-grid"/>
    <text x="${x}" y="${(plotBottom + 16).toFixed(1)}" text-anchor="middle" class="chart-label">${g}</text>`;
        }),
    ].join('\n    ');

    const defs = teams.map(t => `
    <linearGradient id="area-${t.abbrev}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.config.lineColor}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${t.config.lineColor}" stop-opacity="0"/>
    </linearGradient>`).join('');

    const teamPaths = teams.map(t => {
        const last = t.data[t.data.length - 1];
        const lx = sx(last.game, xMax);
        const ly = sy(last.points, yMax);
        const area = t.abbrev === 'MIN'
            ? `<path d="${areaPath(t.data, xMax, yMax)}" fill="url(#area-${t.abbrev})" stroke="none"/>`
            : '';
        return `
    <!-- ${t.config.name} -->
    ${area}
    <path d="${linePath(t.data, xMax, yMax)}" fill="none" stroke="${t.config.lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" fill="${t.config.lineColor}" stroke="#111" stroke-width="1.5"/>
    <image href="https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg" x="${(lx + 5).toFixed(1)}" y="${(ly - LOGO_SIZE / 2).toFixed(1)}" width="${LOGO_SIZE}" height="${LOGO_SIZE}"/>`;
    }).join('');

    return `<svg class="points-chart" viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs}
  </defs>
  ${gridLines}
  <line x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${plotBottom}" class="chart-axis"/>
  <line x1="${M.left}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" class="chart-axis"/>
  <text x="${(M.left + PLOT_W / 2).toFixed(1)}" y="${(VB_H - 6).toFixed(1)}" text-anchor="middle" class="chart-axis-title">Games Played</text>
  <text x="12" y="${(M.top + PLOT_H / 2).toFixed(1)}" text-anchor="middle" transform="rotate(-90,12,${(M.top + PLOT_H / 2).toFixed(1)})" class="chart-axis-title">Points</text>
  ${teamPaths}
</svg>`;
}

// ─── Refresh chart after toggle change ─────────────────────────────────────

async function refreshChart() {
    const chartWrap = document.querySelector('#stats-season-view .points-chart-wrap');
    if (!chartWrap) return;
    chartWrap.innerHTML = '<div class="chart-loading">Loading…</div>';

    try {
        const abbrevs = [...new Set(['MIN', ...[...activeToggles].flatMap(div => DIVISIONS[div])])];
        const teams = await Promise.all(
            abbrevs.map(async abbrev => ({
                abbrev,
                config: ALL_TEAMS[abbrev],
                data: await loadTeamData(abbrev),
            }))
        );
        chartWrap.innerHTML = buildChart(teams);
    } catch (err) {
        console.error('Error refreshing chart:', err);
        chartWrap.innerHTML = '<div class="error-message">Failed to load data.</div>';
    }
}

// ─── Page HTML builder ─────────────────────────────────────────────────────

function buildPage(initialChartHtml) {
    const divisionNames = Object.keys(DIVISIONS);
    const toggles = divisionNames.map(div => {
        const isActive = activeToggles.has(div);
        return `<button class="division-toggle${isActive ? ' active' : ''}" data-division="${div}">${div}</button>`;
    }).join('');

    return `
        <div class="season-section">
            <h2 class="season-section-title">Points Progression</h2>
            <div class="points-chart-wrap">${initialChartHtml}</div>
            <div class="division-toggles">${toggles}</div>
        </div>`;
}

function attachToggleHandlers() {
    document.querySelectorAll('#stats-season-view .division-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
            const div = btn.dataset.division;
            if (activeToggles.has(div)) {
                activeToggles.delete(div);
                btn.classList.remove('active');
            } else {
                activeToggles.add(div);
                btn.classList.add('active');
            }
            await refreshChart();
        });
    });
}

// ─── View init ─────────────────────────────────────────────────────────────

export async function init() {
    activeToggles = new Set(['Central']);

    const container = document.getElementById('stats-season-view');
    container.innerHTML = '<div class="loading">Loading season data…</div>';

    try {
        const centralAbbrevs = DIVISIONS.Central;
        const teams = await Promise.all(
            centralAbbrevs.map(async abbrev => {
                const data = await loadTeamData(abbrev);
                return { abbrev, config: ALL_TEAMS[abbrev], data };
            })
        );

        container.innerHTML = buildPage(buildChart(teams));
        attachToggleHandlers();

        // Pre-load all other divisions in the background so toggles feel instant
        const otherAbbrevs = Object.values(DIVISIONS).flat().filter(a => !DIVISIONS.Central.includes(a));
        otherAbbrevs.forEach(abbrev => loadTeamData(abbrev));
    } catch (err) {
        console.error('Error loading season view:', err);
        container.innerHTML = '<div class="error-message">Failed to load season data.</div>';
    }
}
