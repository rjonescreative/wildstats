// Current Season view — team-level stats for the current season
import { getTeamSchedule, getAllTeamSchedules, getStandings, getWildStats, getWildSeasonBreakdown, getWildSpecialTeams, getGameFlow } from '../api.js';
import { getSeasonLabel, PLAYOFF_MODE } from '../seasonConfig.js';
import { updatePointsChartURL } from '../router.js';

// ─── All 32 teams: division, name, chart color ─────────────────────────────
export const ALL_TEAMS = {
    // Central Division
    CHI: { name: 'Chicago Blackhawks',    div: 'Central',      conf: 'W', lineColor: '#FF4553' },
    COL: { name: 'Colorado Avalanche',    div: 'Central',      conf: 'W', lineColor: '#B05076' },
    DAL: { name: 'Dallas Stars',          div: 'Central',      conf: 'W', lineColor: '#00C47E' },
    MIN: { name: 'Minnesota Wild',        div: 'Central',      conf: 'W', lineColor: '#1C8C47' },
    NSH: { name: 'Nashville Predators',   div: 'Central',      conf: 'W', lineColor: '#FFB81C' },
    STL: { name: 'St. Louis Blues',       div: 'Central',      conf: 'W', lineColor: '#4A90E2' },
    UTA: { name: 'Utah Hockey Club',      div: 'Central',      conf: 'W', lineColor: '#69B3E7' },
    WPG: { name: 'Winnipeg Jets',         div: 'Central',      conf: 'W', lineColor: '#7CBDE8' },
    // Pacific Division
    ANA: { name: 'Anaheim Ducks',         div: 'Pacific',      conf: 'W', lineColor: '#F47A38' },
    CGY: { name: 'Calgary Flames',        div: 'Pacific',      conf: 'W', lineColor: '#D2122E' },
    EDM: { name: 'Edmonton Oilers',       div: 'Pacific',      conf: 'W', lineColor: '#FF5500' },
    LAK: { name: 'Los Angeles Kings',     div: 'Pacific',      conf: 'W', lineColor: '#B8BABA' },
    SJS: { name: 'San Jose Sharks',       div: 'Pacific',      conf: 'W', lineColor: '#00C7C7' },
    SEA: { name: 'Seattle Kraken',        div: 'Pacific',      conf: 'W', lineColor: '#8FD4D4' },
    VAN: { name: 'Vancouver Canucks',     div: 'Pacific',      conf: 'W', lineColor: '#00B550' },
    VGK: { name: 'Vegas Golden Knights',  div: 'Pacific',      conf: 'W', lineColor: '#C9A84C' },
    // Atlantic Division
    BOS: { name: 'Boston Bruins',         div: 'Atlantic',     conf: 'E', lineColor: '#FFB81C' },
    BUF: { name: 'Buffalo Sabres',        div: 'Atlantic',     conf: 'E', lineColor: '#4A7FD4' },
    DET: { name: 'Detroit Red Wings',     div: 'Atlantic',     conf: 'E', lineColor: '#CE1126' },
    FLA: { name: 'Florida Panthers',      div: 'Atlantic',     conf: 'E', lineColor: '#C8972A' },
    MTL: { name: 'Montréal Canadiens',    div: 'Atlantic',     conf: 'E', lineColor: '#AF1E2D' },
    OTT: { name: 'Ottawa Senators',       div: 'Atlantic',     conf: 'E', lineColor: '#E8192C' },
    TBL: { name: 'Tampa Bay Lightning',   div: 'Atlantic',     conf: 'E', lineColor: '#3A5DC8' },
    TOR: { name: 'Toronto Maple Leafs',   div: 'Atlantic',     conf: 'E', lineColor: '#4A78C4' },
    // Metropolitan Division
    CAR: { name: 'Carolina Hurricanes',   div: 'Metropolitan', conf: 'E', lineColor: '#CC0000' },
    CBJ: { name: 'Columbus Blue Jackets', div: 'Metropolitan', conf: 'E', lineColor: '#4488C5' },
    NJD: { name: 'New Jersey Devils',     div: 'Metropolitan', conf: 'E', lineColor: '#FF3333' },
    NYI: { name: 'New York Islanders',    div: 'Metropolitan', conf: 'E', lineColor: '#F47D30' },
    NYR: { name: 'New York Rangers',      div: 'Metropolitan', conf: 'E', lineColor: '#4A85E0' },
    PHI: { name: 'Philadelphia Flyers',   div: 'Metropolitan', conf: 'E', lineColor: '#F74902' },
    PIT: { name: 'Pittsburgh Penguins',   div: 'Metropolitan', conf: 'E', lineColor: '#FCB514' },
    WSH: { name: 'Washington Capitals',   div: 'Metropolitan', conf: 'E', lineColor: '#C41230' },
};

export const DIVISIONS = {
    Central:      ['CHI', 'COL', 'DAL', 'MIN', 'NSH', 'STL', 'UTA', 'WPG'],
    Pacific:      ['ANA', 'CGY', 'EDM', 'LAK', 'SJS', 'SEA', 'VAN', 'VGK'],
    Atlantic:     ['BOS', 'BUF', 'DET', 'FLA', 'MTL', 'OTT', 'TBL', 'TOR'],
    Metropolitan: ['CAR', 'CBJ', 'NJD', 'NYI', 'NYR', 'PHI', 'PIT', 'WSH'],
};

// ─── Module state ──────────────────────────────────────────────────────────
let activeToggles = new Set(['Central']);
let chartMode = 'points'; // 'points' | 'pct' | 'line' (playoff line)
let playoffConf = 'W';     // playoff line chart filter: 'W' | 'E' conference, or 'MIN' for the Wild alone
let alwaysShowWild = true; // Wild toggle: keep MIN on the chart even when the Central is off
export const dataCache = {}; // abbrev → points progression array

// ─── Chart layout ──────────────────────────────────────────────────────────
const VB_W = 900;
const VB_H = 340;
const M = { top: 20, right: 60, bottom: 44, left: 50 };
const PLOT_W = VB_W - M.left - M.right;
const PLOT_H = VB_H - M.top - M.bottom;
const LOGO_SIZE = 22;

// ─── Data helpers: points chart ────────────────────────────────────────────

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

export async function loadTeamData(abbrev) {
    if (dataCache[abbrev]) return dataCache[abbrev];
    // One aggregated request fetches all 32 teams at once (server-side fan-out).
    // Subsequent calls for other teams hit the in-memory cache instantly.
    const allSchedules = await getAllTeamSchedules();
    const games = allSchedules[abbrev] ?? [];
    const data = computePointsProgression(games, abbrev);
    dataCache[abbrev] = data;
    return data;
}

// ─── Data helpers: season stats ────────────────────────────────────────────

function processGames(scheduleGames, periodScores) {
    const completed = scheduleGames
        .filter(g => g.gameType === 2 && (g.gameState === 'FINAL' || g.gameState === 'OFF'))
        .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));

    return completed.map((game, idx) => {
        const isHome = game.homeTeam.abbrev === 'MIN';
        const myScore  = isHome ? game.homeTeam.score : game.awayTeam.score;
        const oppScore = isHome ? game.awayTeam.score : game.homeTeam.score;
        const opponent = isHome ? game.awayTeam.abbrev : game.homeTeam.abbrev;
        const lastPeriod = game.gameOutcome?.lastPeriodType ?? 'REG';

        // B2B: this game is played the day after the previous one
        let isB2B = false;
        if (idx > 0) {
            const d1 = new Date(completed[idx - 1].gameDate + 'T12:00:00');
            const d2 = new Date(game.gameDate + 'T12:00:00');
            isB2B = (d2 - d1) / 86400000 === 1;
        }

        let result;
        if (myScore > oppScore) result = 'W';
        else if (lastPeriod === 'OT' || lastPeriod === 'SO') result = 'OTL';
        else result = 'L';

        const periods = periodScores[game.id] ?? [];
        const minSide = isHome ? 'home' : 'away';
        const oppSide = isHome ? 'away' : 'home';

        // Score state after P1 and P2
        let stateAfterP1 = null, stateAfterP2 = null;
        const p1 = periods.find(p => p.period === 1);
        const p2 = periods.find(p => p.period === 2);

        if (p1) {
            const m = p1[minSide] ?? 0, o = p1[oppSide] ?? 0;
            stateAfterP1 = m > o ? 'leading' : m < o ? 'trailing' : 'tied';
        }
        if (p1 && p2) {
            const m = (p1[minSide] ?? 0) + (p2[minSide] ?? 0);
            const o = (p1[oppSide] ?? 0) + (p2[oppSide] ?? 0);
            stateAfterP2 = m > o ? 'leading' : m < o ? 'trailing' : 'tied';
        }

        return { id: game.id, date: game.gameDate, opponent, isHome, myScore, oppScore,
                 result, lastPeriod, isB2B, periods, minSide, oppSide, stateAfterP1, stateAfterP2 };
    });
}

function computeRecord(games) {
    let W = 0, L = 0, OTL = 0, GF = 0, GA = 0;
    games.forEach(g => {
        if (g.result === 'W') W++;
        else if (g.result === 'OTL') OTL++;
        else L++;
        GF += g.myScore;
        GA += g.oppScore;
    });
    const GP = W + L + OTL;
    const pts = W * 2 + OTL;
    const pct = GP > 0 ? pts / (GP * 2) : null;
    return { W, L, OTL, GP, GF, GA, pts, pct };
}

function fmtRecord(W, L, OTL) { return `${W}-${L}-${OTL}`; }

function fmtPct(pct) {
    if (pct === null || pct === undefined) return '—';
    return pct.toFixed(3).replace(/^0\./, '.');
}

function recStr(games) {
    const r = computeRecord(games);
    return fmtRecord(r.W, r.L, r.OTL);
}

function computeStreak(games) {
    if (!games.length) return '—';
    let count = 1;
    const last = games[games.length - 1].result;
    for (let i = games.length - 2; i >= 0; i--) {
        if (games[i].result === last) count++;
        else break;
    }
    const label = last === 'W' ? 'W' : last === 'OTL' ? 'OT' : 'L';
    return `${label}${count}`;
}

// ─── Section: Season At a Glance ───────────────────────────────────────────

function buildAtAGlance(games, slots, standings) {
    const r  = computeRecord(games);
    const hr = computeRecord(games.filter(g => g.isHome));
    const ar = computeRecord(games.filter(g => !g.isHome));
    const streak  = computeStreak(games);

    return `
    <div class="season-section">
      <h2 class="section-title">Season At a Glance</h2>
      <div class="season-glance-grid glance-top">
        <div class="season-glance-card">
          <div class="glance-label">Record</div>
          <div class="glance-value">${fmtRecord(r.W, r.L, r.OTL)}</div>
          <div class="glance-sub">${r.pts} pts &middot; ${fmtPct(r.pct)} pts%</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">Home</div>
          <div class="glance-value">${fmtRecord(hr.W, hr.L, hr.OTL)}</div>
          <div class="glance-sub">${hr.GP} games &middot; ${fmtPct(hr.pct)} pts%</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">Away</div>
          <div class="glance-value">${fmtRecord(ar.W, ar.L, ar.OTL)}</div>
          <div class="glance-sub">${ar.GP} games &middot; ${fmtPct(ar.pct)} pts%</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">Streak</div>
          <div class="glance-value">${streak}</div>
          <div class="glance-sub">current</div>
        </div>
      </div>
      ${buildGameMargins(slots, games, leagueGoalRanks(standings))}
    </div>`;
}

// ─── Section: Game by Game (goal margin per game) ──────────────────────────

// Every regular-season game in date order, played or not, so the chart spans the full season
function gameSlots(scheduleGames, games) {
    const played = new Map(games.map(g => [g.id, g]));
    return scheduleGames
        .filter(g => g.gameType === 2)
        .sort((a, b) => new Date(a.startTimeUTC ?? a.gameDate) - new Date(b.startTimeUTC ?? b.gameDate))
        .map(g => {
            const isHome = g.homeTeam.abbrev === 'MIN';
            const opponent = isHome ? g.awayTeam.abbrev : g.homeTeam.abbrev;
            return { date: g.gameDate, isHome, opponent, game: played.get(g.id) ?? null };
        });
}

// Wild's NHL rank in goals for and against, both as season totals and per game
// (teams have played different numbers of games, so the two can differ).
// Ties share a rank: 1 + the number of teams strictly better.
function leagueGoalRanks(standings) {
    const teams = standings
        .filter(t => t.gamesPlayed > 0)
        .map(t => ({
            abbrev: t.teamAbbrev?.default ?? t.teamAbbrev,
            gfTotal: t.goalFor, gaTotal: t.goalAgainst,
            gf: t.goalFor / t.gamesPlayed, ga: t.goalAgainst / t.gamesPlayed,
        }));
    const min = teams.find(t => t.abbrev === 'MIN');
    if (!min) return {};
    return {
        gf: 1 + teams.filter(t => t.gf > min.gf).length,
        ga: 1 + teams.filter(t => t.ga < min.ga).length,
        gfTotal: 1 + teams.filter(t => t.gfTotal > min.gfTotal).length,
        gaTotal: 1 + teams.filter(t => t.gaTotal < min.gaTotal).length,
    };
}

function buildMarginAverages(games, ranks = {}) {
    const avg = list => list.length ? list.reduce((sum, g) => sum + g.myScore - g.oppScore, 0) / list.length : null;
    const signed = v => v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
    const valueClass = v => v > 0 ? ' glance-positive' : v < 0 ? ' glance-negative' : '';
    const r = computeRecord(games);
    const total = r.GF - r.GA;
    const rankStr = rank => rank ? ` &middot; ${ordinal(rank)} in NHL` : '';
    const totalRank = rank => rank ? `${ordinal(rank)} in NHL` : '';
    const wins = games.filter(g => g.result === 'W');
    const losses = games.filter(g => g.result !== 'W');
    const diff = avg(games);
    const winDiff = avg(wins);
    const lossDiff = avg(losses);
    const card = (label, value, subs, cls = '') => `
        <div class="season-glance-card">
          <div class="glance-label">${label}</div>
          <div class="glance-value${cls}">${value}</div>
          ${[].concat(subs).filter(Boolean).map(t => `<div class="glance-sub">${t}</div>`).join('')}
        </div>`;
    return `
      <div class="season-glance-grid gm-averages">
        ${card('Goals For', r.GF, [totalRank(ranks.gfTotal), `${(r.GF / r.GP).toFixed(2)} per game${rankStr(ranks.gf)}`])}
        ${card('Goals Against', r.GA, [totalRank(ranks.gaTotal), `${(r.GA / r.GP).toFixed(2)} per game${rankStr(ranks.ga)}`])}
        ${card('Goal Diff', `${total > 0 ? '+' : total < 0 ? '−' : ''}${Math.abs(total)}`, `${signed(diff)} per game`, valueClass(total))}
        ${card('Goal Diff in Wins', signed(winDiff), `${wins.length} ${wins.length === 1 ? 'win' : 'wins'}`, valueClass(winDiff))}
        ${card('Goal Diff in Losses', signed(lossDiff), `${losses.length} ${losses.length === 1 ? 'loss' : 'losses'} incl. OT/SO`, valueClass(lossDiff))}
      </div>`;
}

function buildGameMargins(slots, games, ranks) {
    const playedCount = games.length;
    if (playedCount === 0) return '';
    return `
      <h3 class="subsection-title">Game by Game - ${playedCount} of ${slots.length} played</h3>
      <div class="gm-chart-wrap">
        <div class="gm-chart"></div>
        <div class="gm-chart-tooltip" hidden></div>
      </div>
      <div class="chart-controls gm-controls">
        <div class="chart-mode-toggles">
          <button class="division-toggle gm-mode-toggle${gmChartMode === 'diff' ? ' active' : ''}" data-mode="diff">Goals Diff</button>
          <button class="division-toggle gm-mode-toggle${gmChartMode === 'goals' ? ' active' : ''}" data-mode="goals">All Goals</button>
        </div>
        <div class="gm-legend" aria-hidden="true">${gmLegend(gmChartMode)}</div>
      </div>
      ${buildMarginAverages(games, ranks)}`;
}

let gmChartMode = 'diff'; // 'diff' | 'goals'

function gmLegend(mode) {
    const item = (cls, label) => `<span class="gm-legend-item"><span class="gm-swatch ${cls}"></span>${label}</span>`;
    return mode === 'goals'
        ? item('gm-w', 'Wild Goals') + item('gm-l', 'Opponent Goals') + item('gm-otl', 'OT/SO')
        : item('gm-w', 'Win') + item('gm-l', 'Loss') + item('gm-otl', 'OT/SO');
}

const isExtraTime = g => g.lastPeriod === 'OT' || g.lastPeriod === 'SO';

// Colour of the winning side: green for a Wild regulation win, red for a regulation loss,
// grey whenever the game went to OT/SO (either way)
const resultClass = g => isExtraTime(g) ? 'gm-otl' : g.result === 'W' ? 'gm-w' : 'gm-l';

function buildGameMarginsChart(slots, width, mode) {
    const goalsMode = mode === 'goals';
    const W = Math.round(width);
    const narrow = W < 500;
    const m = { top: 10, right: 8, bottom: 26, left: 30 };
    const pw = W - m.left - m.right;

    const played = slots.filter(s => s.game).map(s => s.game);
    const heights = goalsMode
        ? played.flatMap(g => [g.myScore, g.oppScore])
        : played.map(g => Math.abs(g.myScore - g.oppScore));
    const yMax = Math.max(3, ...heights);
    // Both modes share one plot height (sized for the highest single-team score) so the
    // page doesn't shift when toggling; each mode then scales its own goals into it
    const maxScore = Math.max(3, ...played.flatMap(g => [g.myScore, g.oppScore]));
    const half = maxScore * (narrow ? 15 : 22);
    const unit = half / yMax;                       // px per goal
    const ph = half * 2;
    const H = m.top + ph + m.bottom;
    const base = m.top + half;

    const slotW = pw / slots.length;
    const barW = Math.max(1, slotW * (slotW < 6 ? 0.8 : 0.66));
    const cx = i => m.left + slotW * (i + 0.5);
    const y = v => base - v * unit;

    const step = yMax <= 5 ? 1 : 2;
    const ticks = [];
    for (let v = step; v <= yMax; v += step) ticks.push(v, -v);
    const grid = ticks.map(v => `<line x1="${m.left}" y1="${y(v)}" x2="${m.left + pw}" y2="${y(v)}" class="chart-grid"/>
    <text x="${m.left - 6}" y="${y(v)}" dy="0.35em" text-anchor="end" class="chart-label">${goalsMode ? '' : v > 0 ? '+' : '−'}${Math.abs(v)}</text>`).join('\n    ');

    const bars = slots.map((s, i) => {
        if (!s.game) {
            // Unplayed: a faint stub on the baseline
            return `<rect x="${(cx(i) - barW / 2).toFixed(1)}" y="${base - 1}" width="${barW.toFixed(1)}" height="2" class="gm-future"/>`;
        }
        const g = s.game;
        const rect = (top, h, cls) => h > 0
            ? `<rect x="${(cx(i) - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="${barW > 4 ? 1.5 : 0}" class="gm-bar ${cls}"/>`
            : '';
        if (goalsMode) {
            // Wild goals up, opponent goals down; the winning side in full colour, the loser faded
            const won = g.result === 'W';
            const winCls = resultClass(g);
            return rect(y(g.myScore), g.myScore * unit, won ? winCls : 'gm-w gm-faded')
                 + rect(base, g.oppScore * unit, won ? 'gm-l gm-faded' : winCls);
        }
        const diff = g.myScore - g.oppScore;
        return rect(diff > 0 ? y(diff) : base, Math.abs(diff) * unit, resultClass(g));
    }).join('');

    // Month labels at each month's first game, skipping any that would collide
    let lastX = -Infinity, lastMonth = null;
    const months = slots.map((s, i) => {
        const d = new Date(s.date + 'T12:00:00');
        const key = d.getMonth();
        if (key === lastMonth) return '';
        lastMonth = key;
        const x = cx(i) - slotW / 2;
        if (x - lastX < 30) return '';
        lastX = x;
        return `<line x1="${x.toFixed(1)}" y1="${m.top + ph + 2}" x2="${x.toFixed(1)}" y2="${m.top + ph + 7}" class="chart-axis"/>
    <text x="${x.toFixed(1)}" y="${H - 6}" class="chart-label">${d.toLocaleDateString('en-US', { month: 'short' })}</text>`;
    }).join('');

    return `<svg class="points-chart gm-chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${goalsMode ? 'Wild and opponent goals in each Wild game this season' : 'Goal margin of each Wild game this season'}">
  ${grid}
  <line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + ph}" class="chart-axis"/>
  <rect class="gm-hover" x="0" y="${m.top}" width="${slotW.toFixed(1)}" height="${ph}" visibility="hidden"/>
  ${bars}
  <line x1="${m.left}" y1="${base}" x2="${m.left + pw}" y2="${base}" class="gm-baseline"/>
  ${months}
</svg>`;
}

function attachGameMarginsChart(root, slots) {
    const wrap = root.querySelector('.gm-chart-wrap');
    if (!wrap) return;
    const chartEl = wrap.querySelector('.gm-chart');
    const tooltip = wrap.querySelector('.gm-chart-tooltip');
    let renderedWidth = 0;

    const render = () => {
        const width = chartEl.clientWidth;
        if (!width) return;
        renderedWidth = width;
        chartEl.innerHTML = buildGameMarginsChart(slots, width, gmChartMode);
        tooltip.hidden = true;

        const svg = chartEl.querySelector('svg');
        const band = svg.querySelector('.gm-hover');
        const plotLeft = 30, plotW = width - 30 - 8;
        const slotW = plotW / slots.length;

        const show = evt => {
            const box = svg.getBoundingClientRect();
            const scale = width / box.width;
            const px = (evt.clientX - box.left) * scale;
            const i = Math.floor((px - plotLeft) / slotW);
            const s = slots[i];
            if (!s) { hide(); return; }
            band.setAttribute('x', (plotLeft + i * slotW).toFixed(1));
            band.setAttribute('visibility', 'visible');

            const date = new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const g = s.game;
            let body;
            if (g) {
                const extra = isExtraTime(g) ? ` (${g.lastPeriod})` : '';
                const label = g.result === 'W' ? 'W' : g.result === 'OTL' ? 'OTL' : 'L';
                body = `<div class="st-tip-value"><span class="gm-tip-result ${resultClass(g)}">${label}</span> ${g.myScore}–${g.oppScore}${extra}</div>`;
            } else {
                body = '<div>Not played yet</div>';
            }
            tooltip.innerHTML = `<div class="st-tip-head">Game ${i + 1} &middot; ${s.isHome ? 'vs' : '@'} ${s.opponent} &middot; ${date}</div>${body}`;
            tooltip.hidden = false;
            const tw = tooltip.offsetWidth;
            const barX = (plotLeft + (i + 0.5) * slotW) / scale;
            tooltip.style.left = `${Math.min(Math.max(barX - tw / 2, 0), box.width - tw)}px`;
            // Sit in the half away from the bar so it never hides it
            const baseY = Number(svg.querySelector('.gm-baseline').getAttribute('y1')) / scale;
            const wins = g && g.myScore > g.oppScore;
            tooltip.style.top = wins ? `${baseY + 6}px` : `${Math.max(baseY - tooltip.offsetHeight - 6, 0)}px`;
        };
        const hide = () => {
            tooltip.hidden = true;
            band.setAttribute('visibility', 'hidden');
        };
        svg.addEventListener('pointermove', show);
        svg.addEventListener('pointerdown', show);
        svg.addEventListener('pointerleave', hide);
    };

    render();

    const legend = root.querySelector('.gm-legend');
    root.querySelectorAll('.gm-mode-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            if (gmChartMode === btn.dataset.mode) return;
            gmChartMode = btn.dataset.mode;
            root.querySelectorAll('.gm-mode-toggle').forEach(b => b.classList.toggle('active', b === btn));
            if (legend) legend.innerHTML = gmLegend(gmChartMode);
            render();
        });
    });

    let resizeTimer = null;
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!wrap.isConnected) { window.removeEventListener('resize', onResize); return; }
            if (chartEl.clientWidth !== renderedWidth) render();
        }, 150);
    };
    window.addEventListener('resize', onResize);
}

// ─── Section: Special Teams ────────────────────────────────────────────────

const fmtPP = v => v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`;

function ordinal(n) {
    const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
    return `${n}${s}`;
}

// Opportunities and goals by period and by the Wild's score state, from games with splits.
// Opportunities count in the period the penalty was called, goals in the period they were scored
// (a power play can carry over); score state is always the one when the penalty was called.
function tallySpecialTeams(games) {
    const buckets = {};
    const bucket = key => buckets[key] ??= { ppGoals: 0, ppOpps: 0, ppGoalsAgainst: 0, timesShorthanded: 0 };
    games.forEach(g => {
        ['pp', 'pk'].forEach(side => {
            const [oppKey, goalKey] = side === 'pp' ? ['ppOpps', 'ppGoals'] : ['timesShorthanded', 'ppGoalsAgainst'];
            g.splits[side].forEach(([period, state, goalPeriods]) => {
                bucket(`p${period}`)[oppKey]++;
                bucket(state)[oppKey]++;
                bucket(state)[goalKey] += goalPeriods.length;
                goalPeriods.forEach(gp => { bucket(`p${gp}`)[goalKey]++; });
            });
        });
    });
    return buckets;
}

function buildSpecialTeams(st) {
    const title = '<h2 class="section-title">Special Teams</h2>';
    if (!st?.totals || st.totals.gamesPlayed === 0) {
        return `<div class="season-section">${title}<p class="season-no-data">Special teams data unavailable.</p></div>`;
    }
    const t = st.totals;
    const rankStr = r => r ? ` &middot; ${ordinal(r)} in NHL` : '';
    const pkKills = t.timesShorthanded - t.ppGoalsAgainst;

    const cards = `
      <div class="season-glance-grid">
        <div class="season-glance-card">
          <div class="glance-label">Power Play</div>
          <div class="glance-value">${fmtPP(t.ppPct)}</div>
          <div class="glance-sub">${t.ppGoals} for ${t.ppOpps}${rankStr(t.ppRank)}</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">Penalty Kill</div>
          <div class="glance-value">${fmtPP(t.pkPct)}</div>
          <div class="glance-sub">${pkKills} of ${t.timesShorthanded} killed${rankStr(t.pkRank)}</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">PP Goals For</div>
          <div class="glance-value">${t.ppGoals}</div>
          <div class="glance-sub">${(t.ppGoals / t.gamesPlayed).toFixed(2)} per game</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">PK Goals Against</div>
          <div class="glance-value">${t.ppGoalsAgainst}</div>
          <div class="glance-sub">${(t.ppGoalsAgainst / t.gamesPlayed).toFixed(2)} per game</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">SH Goals For</div>
          <div class="glance-value">${t.shGoalsFor}</div>
          <div class="glance-sub">scored while shorthanded</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">SH Goals Against</div>
          <div class="glance-value">${t.shGoalsAgainst}</div>
          <div class="glance-sub">allowed on the power play</div>
        </div>
      </div>`;

    // Splits table (only games whose play-by-play matched the official counts)
    const splitGames = st.games.filter(g => g.splits);
    let splitsHtml = '';
    if (splitGames.length > 0) {
        const b = tallySpecialTeams(splitGames);
        const row = (label, key, cls = '') => {
            const r = b[key];
            if (!r) return `<tr><td class="${cls}">${label}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
            // A carried-over goal can land in a period with few (or no) penalties called,
            // so kills can't go below zero and a goal still shows with no opportunities
            const kills = Math.max(r.timesShorthanded - r.ppGoalsAgainst, 0);
            const pkCell = r.timesShorthanded ? `${kills}/${r.timesShorthanded}`
                : r.ppGoalsAgainst ? `${r.ppGoalsAgainst} GA` : '—';
            return `<tr>
              <td class="${cls}">${label}</td>
              <td>${r.ppOpps || r.ppGoals ? `${r.ppGoals}/${r.ppOpps}` : '—'}</td>
              <td class="stat-highlight">${r.ppOpps ? fmtPP(r.ppGoals / r.ppOpps) : '—'}</td>
              <td>${pkCell}</td>
              <td class="stat-highlight">${r.timesShorthanded ? fmtPP(kills / r.timesShorthanded) : '—'}</td>
            </tr>`;
        };
        const coverage = splitGames.length < st.games.length
            ? ` Splits cover ${splitGames.length} of ${st.games.length} games; games whose play-by-play doesn't line up with the official totals are left out.`
            : '';
        splitsHtml = `
      <h3 class="subsection-title">By Period and Score</h3>
      <p class="season-section-note st-splits-note">Goals count in the period they were scored and opportunities in the period the penalty was called.${coverage}</p>
      <div class="season-table-wrap">
        <table class="season-table situation-table st-table">
          <thead>
            <tr><th>Situation</th><th>PP</th><th>PP%</th><th>PK</th><th>PK%</th></tr>
          </thead>
          <tbody>
            <tr class="div-section-row"><td colspan="5">By Period</td></tr>
            ${row('1st', 'p1', 'period-label')}
            ${row('2nd', 'p2', 'period-label')}
            ${row('3rd', 'p3', 'period-label')}
            ${b.p4 ? row('OT', 'p4', 'period-label') : ''}
            <tr class="div-section-row"><td colspan="5">By Score</td></tr>
            ${row('Leading', 'L', 'sit-label sit-label-leading')}
            ${row('Tied', 'T', 'sit-label sit-label-tied')}
            ${row('Trailing', 'B', 'sit-label sit-label-trailing')}
          </tbody>
        </table>
      </div>`;
    }

    const chartHtml = st.games.length >= 2 ? `
      <h3 class="subsection-title">Season Progression</h3>
      <div class="st-chart-wrap">
        <div class="st-chart"></div>
        <div class="st-chart-tooltip" hidden></div>
      </div>
      <div class="chart-controls">
        <div class="chart-mode-toggles">
          <button class="division-toggle st-mode-toggle${stChartMode === 'pp' ? ' active' : ''}" data-mode="pp">Power Play</button>
          <button class="division-toggle st-mode-toggle${stChartMode === 'pk' ? ' active' : ''}" data-mode="pk">Penalty Kill</button>
        </div>
      </div>` : '';

    return `
    <div class="season-section special-teams">
      ${title}
      ${cards}
      ${splitsHtml}
      ${chartHtml}
    </div>`;
}

// ─── Special teams chart: season-to-date PP% / PK% after each game ──────────

let stChartMode = 'pp'; // 'pp' | 'pk'

function specialTeamsProgression(games, mode) {
    let goals = 0, opps = 0;
    return games.map((g, i) => {
        if (mode === 'pp') { goals += g.ppGoals; opps += g.ppOpps; }
        else { goals += g.ppGoalsAgainst; opps += g.timesShorthanded; }
        const pct = opps > 0 ? (mode === 'pp' ? goals / opps : 1 - goals / opps) : null;
        return { game: i + 1, g, pct };
    }).filter(d => d.pct !== null);
}

function buildSpecialTeamsChart(points, mode, leagueAvg, width) {
    const areaId = uniqueSvgId('st-area');
    const W = Math.round(width);
    const H = W < 500 ? 200 : 240;
    const m = { top: 14, right: 16, bottom: 34, left: 46 };
    const pw = W - m.left - m.right;
    const ph = H - m.top - m.bottom;

    const xMax = Math.max(points[points.length - 1].game, 10);
    const values = points.map(d => d.pct).concat(leagueAvg ?? []);
    const lo = Math.max(0, Math.floor((Math.min(...values) - 0.02) * 20) / 20);
    const hi = Math.min(1, Math.ceil((Math.max(...values) + 0.02) * 20) / 20);
    const yStep = hi - lo > 0.4 ? 0.1 : 0.05;

    const x = game => m.left + (game / xMax) * pw;
    const y = pct => m.top + ph - ((pct - lo) / (hi - lo)) * ph;

    const yTicks = [];
    for (let v = lo; v <= hi + 1e-9; v += yStep) yTicks.push(v);
    const xStep = xMax <= 20 ? 5 : xMax <= 40 ? 10 : 20;
    const xTicks = [];
    for (let g = xStep; g <= xMax; g += xStep) xTicks.push(g);

    const grid = [
        ...yTicks.map(v => `<line x1="${m.left}" y1="${y(v).toFixed(1)}" x2="${m.left + pw}" y2="${y(v).toFixed(1)}" class="chart-grid"/>
    <text x="${m.left - 8}" y="${y(v).toFixed(1)}" dy="0.35em" text-anchor="end" class="chart-label">${Math.round(v * 100)}%</text>`),
        ...xTicks.map(g => `<text x="${x(g).toFixed(1)}" y="${m.top + ph + 16}" text-anchor="middle" class="chart-label">${g}</text>`),
    ].join('\n    ');

    const line = points.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(d.game).toFixed(1)},${y(d.pct).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points[points.length - 1].game).toFixed(1)},${m.top + ph} L${x(points[0].game).toFixed(1)},${m.top + ph} Z`;
    const last = points[points.length - 1];

    const avgLine = leagueAvg == null ? '' : `
    <line x1="${m.left}" y1="${y(leagueAvg).toFixed(1)}" x2="${m.left + pw}" y2="${y(leagueAvg).toFixed(1)}" class="chart-midline"/>
    <text x="${m.left + 6}" y="${(y(leagueAvg) - 5).toFixed(1)}" class="chart-label st-avg-label">NHL avg ${fmtPP(leagueAvg)}</text>`;

    return `<svg class="points-chart st-chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${mode === 'pp' ? 'Power play' : 'Penalty kill'} percentage after each game">
  <defs>
    <linearGradient id="${areaId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1C8C47" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#1C8C47" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${grid}
  <line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + ph}" class="chart-axis"/>
  <line x1="${m.left}" y1="${m.top + ph}" x2="${m.left + pw}" y2="${m.top + ph}" class="chart-axis"/>
  ${avgLine}
  <path d="${area}" fill="url(#${areaId})" stroke="none"/>
  <path class="st-line" d="${line}" fill="none" stroke="#1C8C47" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${x(last.game).toFixed(1)}" cy="${y(last.pct).toFixed(1)}" r="3.5" fill="#1C8C47" stroke="#111" stroke-width="1.5"/>
  <line class="st-guide" x1="0" y1="${m.top}" x2="0" y2="${m.top + ph}" visibility="hidden"/>
  <circle class="st-dot" r="4" fill="#1C8C47" stroke="#fff" stroke-width="1.5" visibility="hidden"/>
  <text x="${m.left + pw / 2}" y="${H - 4}" text-anchor="middle" class="chart-axis-title">Games Played</text>
</svg>`;
}

function attachSpecialTeamsChart(root, st) {
    const wrap = root.querySelector('.st-chart-wrap');
    if (!wrap) return;
    const chartEl = wrap.querySelector('.st-chart');
    const tooltip = wrap.querySelector('.st-chart-tooltip');
    let renderedWidth = 0;

    const render = () => {
        const width = chartEl.clientWidth;
        if (!width) return;
        renderedWidth = width;
        const mode = stChartMode;
        const points = specialTeamsProgression(st.games, mode);
        if (points.length === 0) { chartEl.innerHTML = '<p class="season-no-data">No data yet.</p>'; return; }
        const leagueAvg = mode === 'pp' ? st.totals.leaguePpPct : st.totals.leaguePkPct;
        chartEl.innerHTML = buildSpecialTeamsChart(points, mode, leagueAvg, width);
        tooltip.hidden = true;

        const svg = chartEl.querySelector('svg');
        const guide = svg.querySelector('.st-guide');
        const dot = svg.querySelector('.st-dot');
        // Point positions, read back from the drawn line (one per entry in points)
        const linePts = svg.querySelector('.st-line').getAttribute('d').match(/[\d.]+,[\d.]+/g)
            .map(s => s.split(',').map(Number));

        const show = evt => {
            const box = svg.getBoundingClientRect();
            const px = evt.clientX - box.left;
            let best = 0;
            linePts.forEach(([lx], i) => { if (Math.abs(lx - px) < Math.abs(linePts[best][0] - px)) best = i; });
            const [lx, ly] = linePts[best];
            const d = points[best];
            guide.setAttribute('x1', lx); guide.setAttribute('x2', lx);
            dot.setAttribute('cx', lx); dot.setAttribute('cy', ly);
            guide.setAttribute('visibility', 'visible');
            dot.setAttribute('visibility', 'visible');

            const [g, o] = mode === 'pp'
                ? [d.g.ppGoals, d.g.ppOpps]
                : [d.g.timesShorthanded - d.g.ppGoalsAgainst, d.g.timesShorthanded];
            const date = new Date(d.g.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            tooltip.innerHTML = `
              <div class="st-tip-head">Game ${d.game} &middot; ${d.g.isHome ? 'vs' : '@'} ${d.g.opponent} &middot; ${date}</div>
              <div>${mode === 'pp' ? 'PP' : 'PK'} this game: ${o ? `${g}/${o}` : 'none'}</div>
              <div class="st-tip-value">Season: ${fmtPP(d.pct)}</div>`;
            tooltip.hidden = false;
            const tw = tooltip.offsetWidth;
            const left = Math.min(Math.max(lx - tw / 2, 0), box.width - tw);
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${Math.max(ly - tooltip.offsetHeight - 12, 0)}px`;
        };
        const hide = () => {
            tooltip.hidden = true;
            guide.setAttribute('visibility', 'hidden');
            dot.setAttribute('visibility', 'hidden');
        };
        svg.addEventListener('pointermove', show);
        svg.addEventListener('pointerdown', show);
        svg.addEventListener('pointerleave', hide);
    };

    render();

    root.querySelectorAll('.st-mode-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            if (stChartMode === btn.dataset.mode) return;
            stChartMode = btn.dataset.mode;
            root.querySelectorAll('.st-mode-toggle').forEach(b => b.classList.toggle('active', b === btn));
            render();
        });
    });

    // Redraw at the new width so labels stay readable (stops once the view is gone)
    let resizeTimer = null;
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!wrap.isConnected) { window.removeEventListener('resize', onResize); return; }
            if (chartEl.clientWidth !== renderedWidth) render();
        }, 150);
    };
    window.addEventListener('resize', onResize);
}

// ─── Section: Period-by-Period Scoring ─────────────────────────────────────

function buildPeriodScoring(games) {
    const gamesWithPeriods = games.filter(g => g.periods.length > 0);
    if (gamesWithPeriods.length === 0) {
        return `<div class="season-section">
          <h2 class="section-title">Period-by-Period Scoring</h2>
          <p class="season-no-data">Period data unavailable.</p>
        </div>`;
    }

    const tally = { p1: null, p2: null, p3: null, ot: null };
    const init = () => ({ gf: 0, ga: 0, hGf: 0, hGa: 0, aGf: 0, aGa: 0, games: 0 });
    tally.p1 = init(); tally.p2 = init(); tally.p3 = init(); tally.ot = init();

    gamesWithPeriods.forEach(game => {
        game.periods.forEach(p => {
            const mineGoals = (p[game.minSide] ?? 0);
            const oppGoals  = (p[game.oppSide] ?? 0);
            let bucket;
            if      (p.period === 1 && p.periodType === 'REG') bucket = tally.p1;
            else if (p.period === 2 && p.periodType === 'REG') bucket = tally.p2;
            else if (p.period === 3 && p.periodType === 'REG') bucket = tally.p3;
            else if (p.periodType === 'OT')                    bucket = tally.ot;
            else return;

            bucket.gf += mineGoals;
            bucket.ga += oppGoals;
            bucket.games++;
            if (game.isHome) { bucket.hGf += mineGoals; bucket.hGa += oppGoals; }
            else             { bucket.aGf += mineGoals; bucket.aGa += oppGoals; }
        });
    });

    const totalGF = tally.p1.gf + tally.p2.gf + tally.p3.gf + tally.ot.gf;
    const totalGA = tally.p1.ga + tally.p2.ga + tally.p3.ga + tally.ot.ga;

    const diffClass = d => d > 0 ? 'period-pos' : d < 0 ? 'period-neg' : '';
    const diffStr   = d => d > 0 ? `+${d}` : `${d}`;

    const row = (label, t) => {
        if (!t) return '';
        const diff = t.gf - t.ga;
        return `<tr>
          <td class="period-label">${label}</td>
          <td>${t.gf}</td><td>${t.ga}</td>
          <td class="${diffClass(diff)}">${diffStr(diff)}</td>
          <td>${t.hGf}</td><td>${t.hGa}</td>
          <td>${t.aGf}</td><td>${t.aGa}</td>
        </tr>`;
    };

    const totalDiff = totalGF - totalGA;

    return `
    <div class="season-section">
      <h2 class="section-title">Period-by-Period Scoring</h2>
      <p class="season-section-note">Goals scored and allowed per period across all ${gamesWithPeriods.length} games with data.</p>
      <div class="season-table-wrap">
        <table class="season-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>GF</th><th>GA</th><th>+/−</th>
              <th>Home GF</th><th>Home GA</th>
              <th>Away GF</th><th>Away GA</th>
            </tr>
          </thead>
          <tbody>
            ${row('1st', tally.p1)}
            ${row('2nd', tally.p2)}
            ${row('3rd', tally.p3)}
            ${tally.ot.games > 0 ? row('OT', tally.ot) : ''}
            <tr class="period-total">
              <td>Total</td>
              <td>${totalGF}</td><td>${totalGA}</td>
              <td class="${diffClass(totalDiff)}">${diffStr(totalDiff)}</td>
              <td>${tally.p1.hGf + tally.p2.hGf + tally.p3.hGf + tally.ot.hGf}</td>
              <td>${tally.p1.hGa + tally.p2.hGa + tally.p3.hGa + tally.ot.hGa}</td>
              <td>${tally.p1.aGf + tally.p2.aGf + tally.p3.aGf + tally.ot.aGf}</td>
              <td>${tally.p1.aGa + tally.p2.aGa + tally.p3.aGa + tally.ot.aGa}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── Section: Situational Records ──────────────────────────────────────────

function buildSituationalRecords(games, gameFlow) {
    const gamesWithP1 = games.filter(g => g.stateAfterP1 !== null);
    const gamesWithP2 = games.filter(g => g.stateAfterP2 !== null);

    if (gamesWithP1.length === 0) {
        return `<div class="season-section">
          <h2 class="section-title">Situational Records</h2>
          <p class="season-no-data">Period data unavailable.</p>
          ${buildGameFlow(gameFlow)}
        </div>`;
    }

    const recFor = (gameList, state) => {
        const filtered = gameList.filter(g => g.stateAfterP1 === state || g.stateAfterP2 === state
            ? (gameList === gamesWithP1 ? g.stateAfterP1 === state : g.stateAfterP2 === state)
            : false);
        return computeRecord(filtered);
    };

    // P1 situations
    const p1Lead  = computeRecord(gamesWithP1.filter(g => g.stateAfterP1 === 'leading'));
    const p1Tied  = computeRecord(gamesWithP1.filter(g => g.stateAfterP1 === 'tied'));
    const p1Trail = computeRecord(gamesWithP1.filter(g => g.stateAfterP1 === 'trailing'));
    // P2 situations
    const p2Lead  = computeRecord(gamesWithP2.filter(g => g.stateAfterP2 === 'leading'));
    const p2Tied  = computeRecord(gamesWithP2.filter(g => g.stateAfterP2 === 'tied'));
    const p2Trail = computeRecord(gamesWithP2.filter(g => g.stateAfterP2 === 'trailing'));

    const cell = (r) => `<td>
      <span class="sit-record">${fmtRecord(r.W, r.L, r.OTL)}</span>
      <span class="sit-pct">${fmtPct(r.pct)}</span>
    </td>`;

    return `
    <div class="season-section">
      <h2 class="section-title">Situational Records</h2>
      <p class="season-section-note">Wild record based on score at the end of each period.</p>
      <div class="season-table-wrap">
        <table class="season-table situation-table">
          <thead>
            <tr>
              <th>Score After Period</th>
              <th>After 1st Period</th>
              <th>After 2nd Period</th>
            </tr>
          </thead>
          <tbody>
            <tr class="sit-leading">
              <td class="sit-label sit-label-leading">Leading</td>
              ${cell(p1Lead)}
              ${cell(p2Lead)}
            </tr>
            <tr class="sit-tied">
              <td class="sit-label sit-label-tied">Tied</td>
              ${cell(p1Tied)}
              ${cell(p2Tied)}
            </tr>
            <tr class="sit-trailing">
              <td class="sit-label sit-label-trailing">Trailing</td>
              ${cell(p1Trail)}
              ${cell(p2Trail)}
            </tr>
          </tbody>
        </table>
      </div>
      ${buildGameFlow(gameFlow)}
    </div>`;
}

// ─── Situational Records: first goal and time with the lead ────────────────

// League rank of the Wild's value among every team with one: 1 + teams strictly better, marked
// "T-" when another team has the same value
function flowRank(teams, valueOf, higherIsBetter = true) {
    const values = Object.entries(teams)
        .map(([abbrev, t]) => [abbrev, valueOf(t)])
        .filter(([, v]) => v !== null && Number.isFinite(v));
    const mine = values.find(([abbrev]) => abbrev === 'MIN')?.[1];
    if (mine === undefined) return '';
    const better = values.filter(([, v]) => higherIsBetter ? v > mine : v < mine).length;
    const tied = values.filter(([abbrev, v]) => abbrev !== 'MIN' && v === mine).length > 0;
    return `${tied ? 'T-' : ''}${ordinal(better + 1)} in NHL`;
}

const flowPct = r => r.gp ? (r.w * 2 + r.otl) / (r.gp * 2) : null;
const share = (n, of) => of ? `${Math.round((n / of) * 100)}%` : '—';

function fmtClock(seconds) { // minutes:seconds, e.g. 34:42 or 1,012:05
    const s = Math.round(seconds);
    return `${Math.floor(s / 60).toLocaleString('en-US')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtThrough(date) {
    if (!date) return '';
    const d = new Date(`${date}T12:00:00Z`);
    return ` through ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

function buildGameFlow(gameFlow) {
    const teams = gameFlow?.teams ?? {};
    const t = teams.MIN;
    if (!t || t.gp === 0) return '';
    // Earlier days still being fetched (first backfill, or a failed day): partial totals would
    // undercount, so show nothing rather than wrong numbers
    if (gameFlow.complete === false) {
        return `<h3 class="subsection-title">First Goal and Time With the Lead</h3>
      <p class="season-section-note">These stats are still loading for earlier games. Check back in a few minutes.</p>`;
    }

    const card = (label, value, subs, cls = '') => `
        <div class="season-glance-card">
          <div class="glance-label">${label}</div>
          <div class="glance-value${cls}">${value}</div>
          ${subs.filter(Boolean).map(text => `<div class="glance-sub">${text}</div>`).join('')}
        </div>`;

    // First goal: how often, and the record in each case
    const firstCards = `
      <div class="season-glance-grid flow-first-cards">
        ${card('Scored First', t.scoredFirst.gp, [`${share(t.scoredFirst.gp, t.gp)} of games`, flowRank(teams, x => x.gp ? x.scoredFirst.gp / x.gp : null)])}
        ${card('Scored Second', t.scoredSecond.gp, [`${share(t.scoredSecond.gp, t.gp)} of games`])}
        ${card('No Goals', t.noGoals.gp, [`${share(t.noGoals.gp, t.gp)} of games`, flowRank(teams, x => x.gp ? x.noGoals.gp / x.gp : null, false)])}
      </div>`;

    const recordRow = (label, key, cls, ranked = true) => {
        const r = t[key];
        return `<tr>
          <td class="sit-label ${cls}">${label}</td>
          <td>${r.gp}</td>
          <td>${r.gp ? fmtRecord(r.w, r.l, r.otl) : '—'}</td>
          <td>${fmtPct(flowPct(r))}</td>
          <td class="flow-rank">${ranked && r.gp ? flowRank(teams, x => flowPct(x[key])).replace(' in NHL', '') : '—'}</td>
        </tr>`;
    };
    const recordTable = `
      <div class="season-table-wrap">
        <table class="season-table situation-table flow-record-table">
          <thead>
            <tr><th>First Goal</th><th>GP</th><th>Record</th><th>Pts%</th><th>Rank</th></tr>
          </thead>
          <tbody>
            ${recordRow('Scored first', 'scoredFirst', 'sit-label-leading')}
            ${recordRow('Scored second', 'scoredSecond', 'sit-label-trailing')}
            ${recordRow('No goals', 'noGoals', 'sit-label-tied', false)}
          </tbody>
        </table>
      </div>`;

    // Time with the lead: season split, then totals and per-game averages
    const tied = Math.max(0, t.playedSeconds - t.leadSeconds - t.trailSeconds);
    const pctOf = sec => t.playedSeconds ? (sec / t.playedSeconds) * 100 : 0;
    const segment = (cls, label, sec) => {
        const pct = pctOf(sec);
        return pct > 0 ? `<div class="flow-bar-seg ${cls}" style="width:${pct.toFixed(2)}%" title="${label}: ${Math.round(pct)}%"></div>` : '';
    };
    const legend = (cls, label, sec) => `<span class="flow-legend-item"><span class="flow-swatch ${cls}"></span>${label} <strong>${Math.round(pctOf(sec))}%</strong></span>`;
    const splitBar = `
      <div class="flow-split" role="img" aria-label="Share of game time: leading ${Math.round(pctOf(t.leadSeconds))}%, tied ${Math.round(pctOf(tied))}%, trailing ${Math.round(pctOf(t.trailSeconds))}%">
        <div class="flow-bar">
          ${segment('flow-lead', 'Leading', t.leadSeconds)}
          ${segment('flow-tied', 'Tied', tied)}
          ${segment('flow-trail', 'Trailing', t.trailSeconds)}
        </div>
        <div class="flow-legend" aria-hidden="true">
          ${legend('flow-lead', 'Leading', t.leadSeconds)}
          ${legend('flow-tied', 'Tied', tied)}
          ${legend('flow-trail', 'Trailing', t.trailSeconds)}
        </div>
      </div>`;

    const timeCards = `
      <div class="season-glance-grid flow-time-cards">
        ${card('Time Leading', fmtClock(t.leadSeconds), [flowRank(teams, x => x.leadSeconds)], ' glance-positive')}
        ${card('Time Trailing', fmtClock(t.trailSeconds), [flowRank(teams, x => x.trailSeconds, false)], ' glance-negative')}
        ${card('Avg Leading per Game', fmtClock(t.leadSeconds / t.gp), [flowRank(teams, x => x.gp ? x.leadSeconds / x.gp : null)], ' glance-positive')}
        ${card('Avg Trailing per Game', fmtClock(t.trailSeconds / t.gp), [flowRank(teams, x => x.gp ? x.trailSeconds / x.gp : null, false)], ' glance-negative')}
      </div>`;

    return `
      <h3 class="subsection-title">First Goal</h3>
      <p class="season-section-note">Who scored the game's first goal, in ${t.gp} games${fmtThrough(gameFlow.through)}. Scored second means the Wild answered after allowing the first; shootouts don't count.</p>
      ${firstCards}
      ${recordTable}
      <h3 class="subsection-title">Time With the Lead</h3>
      <p class="season-section-note">Game time spent leading, tied and trailing, including overtime. For time trailing, 1st in NHL means the least.</p>
      ${splitBar}
      ${timeCards}`;
}

// ─── Section: Back-to-Back Performance ─────────────────────────────────────

function buildBackToBack(games) {
    const b2bGames  = games.filter(g => g.isB2B);
    const regGames  = games.filter(g => !g.isB2B);
    const b2bHome   = b2bGames.filter(g => g.isHome);
    const b2bAway   = b2bGames.filter(g => !g.isHome);

    const overall = computeRecord(games);
    const b2b     = computeRecord(b2bGames);
    const b2bH    = computeRecord(b2bHome);
    const b2bA    = computeRecord(b2bAway);
    const reg     = computeRecord(regGames);

    const row = (label, r, note = '') => `<tr>
      <td>${label}${note ? `<span class="sit-pct"> ${note}</span>` : ''}</td>
      <td>${r.GP}</td>
      <td>${fmtRecord(r.W, r.L, r.OTL)}</td>
      <td>${fmtPct(r.pct)}</td>
      <td>${r.GF > 0 || r.GA > 0 ? `${r.GF}–${r.GA}` : '—'}</td>
    </tr>`;

    return `
    <div class="season-section">
      <h2 class="section-title">Back-to-Back Performance</h2>
      <div class="season-table-wrap">
        <table class="season-table">
          <thead>
            <tr>
              <th>Situation</th>
              <th>GP</th>
              <th>Record</th>
              <th>Pts%</th>
              <th>GF–GA</th>
            </tr>
          </thead>
          <tbody>
            ${row('All Games (Season)', overall)}
            ${row('Non B2B Games', reg)}
            ${row('B2B 2nd Games', b2b)}
            ${row('B2B at Home', b2bH)}
            ${row('B2B on Road', b2bA)}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── Section: Division & Conference Records ─────────────────────────────────

function buildDivisionConferenceRecords(games) {
    const divs = ['Central', 'Pacific', 'Atlantic', 'Metropolitan'];
    const divTeams = {};
    divs.forEach(d => { divTeams[d] = new Set(DIVISIONS[d].filter(a => a !== 'MIN')); });

    const vsDiv = (div) => games.filter(g => divTeams[div].has(g.opponent));

    const westernTeams = new Set(Object.entries(ALL_TEAMS)
        .filter(([, t]) => t.conf === 'W' && t !== 'MIN').map(([a]) => a));
    const easternTeams = new Set(Object.entries(ALL_TEAMS)
        .filter(([, t]) => t.conf === 'E').map(([a]) => a));

    const row = (label, gList, isHeader = false) => {
        const all  = computeRecord(gList);
        const home = computeRecord(gList.filter(g => g.isHome));
        const away = computeRecord(gList.filter(g => !g.isHome));
        const cls  = isHeader ? ' class="div-header-row"' : '';
        return `<tr${cls}>
          <td>${label}</td>
          <td>${all.GP}</td>
          <td>${fmtRecord(all.W, all.L, all.OTL)}</td>
          <td>${fmtPct(all.pct)}</td>
          <td>${fmtRecord(home.W, home.L, home.OTL)}</td>
          <td>${fmtRecord(away.W, away.L, away.OTL)}</td>
        </tr>`;
    };

    return `
    <div class="season-section">
      <h2 class="section-title">Division &amp; Conference Records</h2>
      <div class="season-table-wrap">
        <table class="season-table">
          <thead>
            <tr>
              <th>Opponent</th>
              <th>GP</th>
              <th>Overall</th>
              <th>Pts%</th>
              <th>Home</th>
              <th>Away</th>
            </tr>
          </thead>
          <tbody>
            <tr class="div-section-row"><td colspan="6">— Divisions —</td></tr>
            ${row('vs Central', vsDiv('Central'))}
            ${row('vs Pacific', vsDiv('Pacific'))}
            ${row('vs Atlantic', vsDiv('Atlantic'))}
            ${row('vs Metropolitan', vsDiv('Metropolitan'))}
            <tr class="div-section-row"><td colspan="6">— Conferences —</td></tr>
            ${row('vs Western', games.filter(g => westernTeams.has(g.opponent)))}
            ${row('vs Eastern', games.filter(g => easternTeams.has(g.opponent)))}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── Section: Record vs Playoff Teams ──────────────────────────────────────

function buildPlayoffTeamRecords(games, standings) {
    if (!standings.length) {
        return `<div class="season-section">
          <h2 class="section-title">Record vs Playoff Teams</h2>
          <p class="season-no-data">Standings data unavailable.</p>
        </div>`;
    }

    // Identify playoff teams (top 3 per division + 2 wildcards per conference)
    const playoffAbbrevs = new Set();
    standings.forEach(t => {
        if (t.divisionSequence <= 3 || t.wildcardSequence <= 2) {
            playoffAbbrevs.add(t.teamAbbrev?.default ?? t.teamAbbrev);
        }
    });
    playoffAbbrevs.delete('MIN');

    const vsPlayoff = games.filter(g => playoffAbbrevs.has(g.opponent));
    const vsNonPlay = games.filter(g => !playoffAbbrevs.has(g.opponent));

    const row = (label, gList) => {
        const r = computeRecord(gList);
        const h = computeRecord(gList.filter(g => g.isHome));
        const a = computeRecord(gList.filter(g => !g.isHome));
        return `<tr>
          <td>${label}</td>
          <td>${r.GP}</td>
          <td>${fmtRecord(r.W, r.L, r.OTL)}</td>
          <td>${fmtPct(r.pct)}</td>
          <td>${fmtRecord(h.W, h.L, h.OTL)}</td>
          <td>${fmtRecord(a.W, a.L, a.OTL)}</td>
        </tr>`;
    };

    // Show opponent breakdown for playoff teams
    const playoffOpps = [...playoffAbbrevs].sort();
    const oppRows = playoffOpps.map(abbrev => {
        const gList = games.filter(g => g.opponent === abbrev);
        if (gList.length === 0) return '';
        const r = computeRecord(gList);
        const name = ALL_TEAMS[abbrev]?.name ?? abbrev;
        return `<tr class="playoff-opp-row">
          <td><img class="playoff-opp-logo" src="https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg" alt="${abbrev}" width="24" height="24"> <span class="team-name-full">${name}</span></td>
          <td>${r.GP}</td>
          <td>${fmtRecord(r.W, r.L, r.OTL)}</td>
          <td>${fmtPct(r.pct)}</td>
          <td>${computeRecord(gList.filter(g => g.isHome)).W}-${computeRecord(gList.filter(g => g.isHome)).L}-${computeRecord(gList.filter(g => g.isHome)).OTL}</td>
          <td>${computeRecord(gList.filter(g => !g.isHome)).W}-${computeRecord(gList.filter(g => !g.isHome)).L}-${computeRecord(gList.filter(g => !g.isHome)).OTL}</td>
        </tr>`;
    }).join('');

    return `
    <div class="season-section">
      <h2 class="section-title">Record vs Playoff Teams</h2>
      <p class="season-section-note">Based on teams currently holding a playoff position (${playoffAbbrevs.size} teams).</p>
      <div class="season-table-wrap">
        <table class="season-table">
          <thead>
            <tr>
              <th>Opponent</th>
              <th>GP</th>
              <th>Overall</th>
              <th>Pts%</th>
              <th>Home</th>
              <th>Away</th>
            </tr>
          </thead>
          <tbody>
            <tr class="div-section-row"><td colspan="6">— Summary —</td></tr>
            ${row('vs Playoff Teams', vsPlayoff)}
            ${row('vs Non-Playoff Teams', vsNonPlay)}
            <tr class="div-section-row"><td colspan="6">— vs Each Playoff Team —</td></tr>
            ${oppRows}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── Section: Overtime & Shootout ──────────────────────────────────────────

function buildOTShootout(games, wildStats, soScorers, seasonBreakdown = {}) {
    const otGames = games.filter(g => g.lastPeriod === 'OT');
    const soGames = games.filter(g => g.lastPeriod === 'SO');

    const otW  = otGames.filter(g => g.result === 'W').length;
    const otL  = otGames.filter(g => g.result === 'OTL').length;
    const soW  = soGames.filter(g => g.result === 'W').length;
    const soL  = soGames.filter(g => g.result === 'OTL').length;

    const skaters = wildStats.skaters ?? [];
    const goalies = wildStats.goalies ?? [];

    // OT scorers from club-stats overtimeGoals field
    const otScorers = skaters
        .filter(s => (s.overtimeGoals ?? 0) > 0)
        .sort((a, b) => b.overtimeGoals - a.overtimeGoals)
        .slice(0, 10);

    // SO scorers from play-by-play data (soScorers = playerId → { goals, attempts })
    const playerMap = Object.fromEntries(
        skaters.map(s => [String(s.playerId), s])
    );
    const soScorerList = Object.entries(soScorers)
        .map(([id, stat]) => {
            const goals    = typeof stat === 'object' ? (stat.goals    ?? 0) : stat;
            const attempts = typeof stat === 'object' ? (stat.attempts ?? goals) : goals;
            return { player: playerMap[id], goals, attempts };
        })
        .filter(e => e.player)
        .sort((a, b) => b.goals - a.goals || b.attempts - a.attempts);

    const otScorerRows = otScorers.map(s => `<tr>
      <td>${s.firstName?.default ?? ''} ${s.lastName?.default ?? ''}</td>
      <td>${s.positionCode ?? '—'}</td>
      <td class="stat-highlight">${s.overtimeGoals}</td>
      <td>${s.goals ?? 0}</td>
      <td>${s.points ?? 0}</td>
    </tr>`).join('') || `<tr><td colspan="5" class="no-data-cell">No OT goals recorded</td></tr>`;

    const soScorerRows = soScorerList.map(({ player: s, goals, attempts }) => `<tr>
      <td>${s.firstName?.default ?? ''} ${s.lastName?.default ?? ''}</td>
      <td>${s.positionCode ?? '—'}</td>
      <td class="stat-highlight">${goals}/${attempts}</td>
      <td>${attempts > 0 ? (goals / attempts * 100).toFixed(0) + '%' : '—'}</td>
    </tr>`).join('') || `<tr><td colspan="4" class="no-data-cell">No SO attempts this season</td></tr>`;

    // Goalie home/away records + GA by period (from R2 season-breakdown data)
    const { goalieSeasonGA = {}, goalieDecisions = {} } = seasonBreakdown;
    const goalieMap = Object.fromEntries(
        goalies.filter(g => (g.gamesStarted ?? 0) > 0).map(g => [String(g.playerId), g])
    );
    const goalieIds = Object.keys(goalieDecisions).filter(id => goalieMap[id]);

    const goalieSection = goalieIds.length > 0 ? `
      <h3 class="subsection-title">Goalie Records &amp; Goals Against by Period</h3>
      <div class="season-table-wrap">
        <table class="season-table">
          <thead>
            <tr>
              <th>Goalie</th>
              <th>Home</th>
              <th>Away</th>
              <th>1st</th>
              <th>2nd</th>
              <th>3rd</th>
              <th>OT</th>
              <th>SO</th>
              <th>Total GA</th>
            </tr>
          </thead>
          <tbody>
            ${goalieIds.sort((a, b) => {
                const da = goalieDecisions[a], db = goalieDecisions[b];
                return (db.homeW + db.awayW) - (da.homeW + da.awayW);
            }).map(id => {
                const g = goalieMap[id];
                const d = goalieDecisions[id];
                const ga = goalieSeasonGA[id] ?? {};
                const p1 = ga.P1 ?? 0, p2 = ga.P2 ?? 0, p3 = ga.P3 ?? 0;
                const ot = ga.OT ?? 0, so = ga.SO ?? 0;
                const total = p1 + p2 + p3 + ot + so;
                const name = `${g.firstName?.default ?? ''} ${g.lastName?.default ?? ''}`;
                const homeRec = `${d.homeW}-${d.homeL}-${d.homeOT}`;
                const awayRec = `${d.awayW}-${d.awayL}-${d.awayOT}`;
                return `<tr>
                  <td>${name}</td>
                  <td>${homeRec}</td>
                  <td>${awayRec}</td>
                  <td>${p1}</td>
                  <td>${p2}</td>
                  <td>${p3}</td>
                  <td>${ot || '—'}</td>
                  <td>${so || '—'}</td>
                  <td class="stat-highlight">${total}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '';

    return `
    <div class="season-section">
      <h2 class="section-title">Overtime &amp; Shootout</h2>
      <div class="ot-summary-row">
        <div class="ot-summary-card">
          <div class="glance-label">OT Record</div>
          <div class="glance-value">${otW}-${otL}</div>
          <div class="glance-sub">${otGames.length} OT games</div>
        </div>
        <div class="ot-summary-card">
          <div class="glance-label">Shootout Record</div>
          <div class="glance-value">${soW}-${soL}</div>
          <div class="glance-sub">${soGames.length} shootouts</div>
        </div>
        <div class="ot-summary-card">
          <div class="glance-label">OT/SO Points</div>
          <div class="glance-value">${otW + soW + otL + soL}</div>
          <div class="glance-sub">earned in extra time</div>
        </div>
      </div>

      <div class="ot-tables-grid">
        <div>
          <h3 class="subsection-title">OT Goal Scorers (${getSeasonLabel().replace('-', '–')})</h3>
          <div class="season-table-wrap">
            <table class="season-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Pos</th>
                  <th>OT G</th>
                  <th>Goals</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>${otScorerRows}</tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 class="subsection-title">Shootout Scorers (${getSeasonLabel().replace('-', '–')})</h3>
          <div class="season-table-wrap">
            <table class="season-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Pos</th>
                  <th>G/ATT</th>
                  <th>Pct</th>
                </tr>
              </thead>
              <tbody>${soScorerRows}</tbody>
            </table>
          </div>
        </div>
      </div>
      ${goalieSection}
    </div>`;
}

// ─── Data helpers: points percentage ───────────────────────────────────────

function toPctProgression(pointsData) {
    // Derive points % from existing points progression (skip game 0 since 0/0 is undefined)
    return pointsData.slice(1).map(d => ({ game: d.game, pct: d.points / (d.game * 2) }));
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

// Points axis that grows with the season: the leader's total plus ~15% headroom,
// rounded up to a gridline step that keeps 3–7 lines (every 5, 10 or 20 points)
function pointsScale(teams) {
    const maxPts = teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.points ?? 0), 0);
    const target = Math.max(maxPts * 1.15, maxPts + 2, 10);
    const step = target <= 20 ? 5 : target <= 60 ? 10 : 20;
    return { yMax: Math.ceil(target / step) * step, step };
}

// SVG ids must be unique in the whole page: the dashboard's chart stays in the DOM (hidden) on
// other views, and url(#id) resolves to the first match, so a hidden copy would blank the fill.
let svgIdCounter = 0;
const uniqueSvgId = prefix => `${prefix}-${++svgIdCounter}`;

export function buildChart(teams) {
    const areaId = uniqueSvgId('area');
    const xMax = teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.game ?? 0), 10);

    const { yMax, step: yStep } = pointsScale(teams);

    const plotBottom = M.top + PLOT_H;
    const plotRight  = M.left + PLOT_W;

    const yTicks = [];
    for (let p = 0; p <= yMax; p += yStep) yTicks.push(p);

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
    <linearGradient id="${areaId}-${t.abbrev}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.config.lineColor}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${t.config.lineColor}" stop-opacity="0"/>
    </linearGradient>`).join('');

    const teamPaths = teams.map(t => {
        const last = t.data[t.data.length - 1];
        const lx = sx(last.game, xMax);
        const ly = sy(last.points, yMax);
        const area = t.abbrev === 'MIN'
            ? `<path d="${areaPath(t.data, xMax, yMax)}" fill="url(#${areaId}-${t.abbrev})" stroke="none" pointer-events="none"/>`
            : '';
        return `
    <g class="team-group" data-team="${t.abbrev}">
    ${area}
    <path d="${linePath(t.data, xMax, yMax)}" fill="none" stroke="${t.config.lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" fill="${t.config.lineColor}" stroke="#111" stroke-width="1.5"/>
    <image href="https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg" x="${(lx + 5).toFixed(1)}" y="${(ly - LOGO_SIZE / 2).toFixed(1)}" width="${LOGO_SIZE}" height="${LOGO_SIZE}" style="cursor:pointer"/>
    </g>`;
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

// ─── Points percentage chart ────────────────────────────────────────────────

function buildPctChart(teams) {
    const areaId = uniqueSvgId('area-pct');
    const clipId = uniqueSvgId('pct-plot-area');
    const xMax = teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.game ?? 0), 10);

    // Wider left margin for pct chart — decimal labels like "0.500" are wider
    // than point labels ("80","100") and need clearance from the "Pts %" axis title
    const ML = 65;
    const PW = VB_W - ML - M.right;

    const plotBottom = M.top + PLOT_H;
    const plotRight  = ML + PW;

    const sxPct = (game, xMax) => ML + (game / xMax) * PW;
    const syPct = (pct) => M.top + PLOT_H - pct * PLOT_H;
    const linePathPct = (data, xMax) => data
        .map((d, i) => `${i === 0 ? 'M' : 'L'}${sxPct(d.game, xMax).toFixed(1)},${syPct(d.pct).toFixed(1)}`)
        .join(' ');

    const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

    const xTicks = [];
    for (let g = 10; g < xMax; g += 10) xTicks.push(g);
    xTicks.push(xMax);

    // Separate grid lines from label text so labels can be rendered last (always on top)
    const gridLineEls = [
        ...yTicks.map(p => {
            const y = syPct(p).toFixed(1);
            const isMid = p === 0.5;
            return `<line x1="${ML}" y1="${y}" x2="${plotRight}" y2="${y}" class="${isMid ? 'chart-midline' : 'chart-grid'}"/>`;
        }),
        ...xTicks.map(g => {
            const x = sxPct(g, xMax).toFixed(1);
            return `<line x1="${x}" y1="${M.top}" x2="${x}" y2="${plotBottom}" class="chart-grid"/>`;
        }),
    ].join('\n    ');

    const axisLabels = [
        ...yTicks.map(p => {
            const y = syPct(p).toFixed(1);
            const label = p === 0 ? '0' : p === 1 ? '1.0' : p.toFixed(2);
            return `<text x="${(ML - 8).toFixed(1)}" y="${y}" dy="0.35em" text-anchor="end" class="chart-label">${label}</text>`;
        }),
        ...xTicks.map(g => {
            const x = sxPct(g, xMax).toFixed(1);
            return `<text x="${x}" y="${(plotBottom + 16).toFixed(1)}" text-anchor="middle" class="chart-label">${g}</text>`;
        }),
    ].join('\n    ');

    const defs = teams.map(t => `
    <linearGradient id="${areaId}-${t.abbrev}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.config.lineColor}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${t.config.lineColor}" stop-opacity="0"/>
    </linearGradient>`).join('');

    // Lines and areas clipped to plot area; circles and logos unclipped and rendered after labels
    const teamGroups = teams.map(t => {
        const pctData = toPctProgression(t.data);
        if (pctData.length === 0) return '';
        const lx = sxPct(pctData[pctData.length - 1].game, xMax);
        const last = pctData[pctData.length - 1];
        const ly = syPct(last.pct);
        const area = t.abbrev === 'MIN'
            ? `<path d="${linePathPct(pctData, xMax)} L${lx.toFixed(1)},${syPct(0).toFixed(1)} L${sxPct(pctData[0].game, xMax).toFixed(1)},${syPct(0).toFixed(1)} Z" fill="url(#${areaId}-${t.abbrev})" stroke="none" clip-path="url(#${clipId})" pointer-events="none"/>`
            : '';
        return `<g class="team-group" data-team="${t.abbrev}">
    ${area}<path d="${linePathPct(pctData, xMax)}" fill="none" stroke="${t.config.lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${clipId})"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" fill="${t.config.lineColor}" stroke="#111" stroke-width="1.5"/>
    <image href="https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg" x="${(lx + 5).toFixed(1)}" y="${(ly - LOGO_SIZE / 2).toFixed(1)}" width="${LOGO_SIZE}" height="${LOGO_SIZE}" style="cursor:pointer"/>
    </g>`;
    }).join('\n    ');

    return `<svg class="points-chart" viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs}
    <clipPath id="${clipId}">
      <rect x="${ML}" y="${M.top}" width="${PW}" height="${PLOT_H}"/>
    </clipPath>
  </defs>
  ${gridLineEls}
  <line x1="${ML}" y1="${M.top}" x2="${ML}" y2="${plotBottom}" class="chart-axis"/>
  <line x1="${ML}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" class="chart-axis"/>
  ${teamGroups}
  ${axisLabels}
  <text x="${(ML + PW / 2).toFixed(1)}" y="${(VB_H - 6).toFixed(1)}" text-anchor="middle" class="chart-axis-title">Games Played</text>
  <text x="12" y="${(M.top + PLOT_H / 2).toFixed(1)}" text-anchor="middle" transform="rotate(-90,12,${(M.top + PLOT_H / 2).toFixed(1)})" class="chart-axis-title">Pts %</text>
</svg>`;
}

// ─── Playoff line chart: points above/below the conference's 2nd wild card ──

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = date => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY_MS;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = date => `${MONTHS[+date.slice(5, 7) - 1]} ${+date.slice(8, 10)}`;

let playoffLineCache = null; // { W: series, E: series } built once from the all-team schedules

const DIV_SHORT = { Central: 'Central', Pacific: 'Pacific', Atlantic: 'Atlantic', Metropolitan: 'Metro' };

// NHL standings order: points, then fewer games played, regulation wins, regulation + OT wins,
// total wins, goal differential, goals for. (Head-to-head, between ROW and goal differential in
// the real rules, is skipped — it only matters when every earlier tiebreaker is level.)
function compareStandings(a, b) {
    return (b.pts - a.pts) || (a.gp - b.gp) || (b.rw - a.rw) || (b.row - a.row) || (b.w - a.w)
        || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf);
}

// One day's playoff picture for a conference: who holds each spot, and the 2nd wild card's
// points (the playoff line). Tied teams have equal points, so tiebreakers can't change the
// line itself — only which team sits on it, which the spot labels need.
function conferencePicture(stats, conf) {
    const divs = Object.keys(DIVISIONS).filter(d => ALL_TEAMS[DIVISIONS[d][0]].conf === conf);
    const spot = {};
    const pool = [];
    divs.forEach(d => {
        [...DIVISIONS[d]].sort((a, b) => compareStandings(stats[a], stats[b])).forEach((t, i) => {
            if (i < 3) spot[t] = { kind: 'div', label: `${ordinal(i + 1)} in ${DIV_SHORT[d]}` };
            else pool.push(t);
        });
    });
    pool.sort((a, b) => compareStandings(stats[a], stats[b]));
    pool.forEach((t, i) => {
        spot[t] = i < 2 ? { kind: 'wc', label: `Wild card ${i + 1}` } : { kind: 'out', label: 'Out' };
    });
    return { cutoff: stats[pool[1]].pts, spot };
}

// Replay every completed regular-season game in date order and, at the end of each day with
// games, record each team's points minus its conference's wild card cutoff plus the spot it holds.
// Returns { W: { [abbrev]: [{ x, date, diff, spot, divBelow }] }, E: { ... } }, x = days since the
// first game. divBelow marks a team holding a division spot while below the playoff line.
function computePlayoffLines(allSchedules) {
    const games = new Map();
    Object.values(allSchedules).flat().forEach(g => {
        if (g.gameType === 2 && (g.gameState === 'FINAL' || g.gameState === 'OFF')) games.set(g.id, g);
    });
    const sorted = [...games.values()].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
    const abbrevs = Object.keys(ALL_TEAMS);
    const stats = Object.fromEntries(abbrevs.map(a => [a, { pts: 0, gp: 0, w: 0, rw: 0, row: 0, gf: 0, ga: 0 }]));
    const result = { W: {}, E: {} };
    abbrevs.forEach(a => { result[ALL_TEAMS[a].conf][a] = []; });
    if (!sorted.length) return result;

    const firstDay = dayNumber(sorted[0].gameDate);
    const recordDay = date => {
        const pic = { W: conferencePicture(stats, 'W'), E: conferencePicture(stats, 'E') };
        const x = dayNumber(date) - firstDay;
        abbrevs.forEach(a => {
            const { cutoff, spot } = pic[ALL_TEAMS[a].conf];
            const diff = stats[a].pts - cutoff;
            result[ALL_TEAMS[a].conf][a].push({ x, date, diff, spot: spot[a].label, divBelow: spot[a].kind === 'div' && diff < 0 });
        });
    };

    sorted.forEach((g, i) => {
        const home = stats[g.homeTeam.abbrev];
        const away = stats[g.awayTeam.abbrev];
        if (home && away) {
            const homeWon = g.homeTeam.score > g.awayTeam.score;
            const [win, lose] = homeWon ? [home, away] : [away, home];
            const lastPeriod = g.gameOutcome?.lastPeriodType ?? 'REG';
            home.gp++; away.gp++;
            home.gf += g.homeTeam.score; home.ga += g.awayTeam.score;
            away.gf += g.awayTeam.score; away.ga += g.homeTeam.score;
            win.pts += 2; win.w++;
            if (lastPeriod === 'REG') win.rw++;
            if (lastPeriod !== 'SO') win.row++;
            if (lastPeriod !== 'REG') lose.pts += 1;
        }
        if (sorted[i + 1]?.gameDate !== g.gameDate) recordDay(g.gameDate);
    });
    return result;
}

async function loadPlayoffLines() {
    if (!playoffLineCache) playoffLineCache = computePlayoffLines(await getAllTeamSchedules());
    return playoffLineCache;
}

// Scale shared by the chart builder and the hover handler
function playoffLineScale(teams) {
    const all = teams.flatMap(t => t.data);
    const xMax = Math.max(all.reduce((m, d) => Math.max(m, d.x), 0), 7);
    const lo = Math.min(0, ...all.map(d => d.diff));
    const hi = Math.max(0, ...all.map(d => d.diff));
    const range = Math.max(hi - lo, 4);
    const step = range <= 12 ? 2 : range <= 30 ? 5 : 10;
    const yMin = Math.floor((lo - range * 0.08) / step) * step;
    const yMax = Math.ceil((hi + range * 0.08) / step) * step;
    const ML = 55;
    const PW = VB_W - ML - M.right;
    return {
        xMax, yMin, yMax, step, ML, PW,
        sx: x => ML + (x / xMax) * PW,
        sy: v => M.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H,
        invX: svgX => (svgX - ML) / PW * xMax,
    };
}

function buildPlayoffLineChart(teams) {
    const clipId = uniqueSvgId('pl-plot-area');
    const s = playoffLineScale(teams);
    const plotBottom = M.top + PLOT_H;
    const plotRight  = s.ML + s.PW;
    const firstDate = teams.find(t => t.data.length)?.data[0].date;

    const yTicks = [];
    for (let v = s.yMin; v <= s.yMax; v += s.step) yTicks.push(v);

    // Month ticks on the 1st of each month inside the plotted range
    const xTicks = [];
    if (firstDate) {
        const first = dayNumber(firstDate);
        let y = +firstDate.slice(0, 4), m = +firstDate.slice(5, 7); // next month after the first game
        for (;;) {
            if (++m > 12) { m = 1; y++; }
            const x = Date.UTC(y, m - 1, 1) / DAY_MS - first;
            if (x > s.xMax) break;
            xTicks.push({ x, label: MONTHS[m - 1] });
        }
    }

    const gridLineEls = [
        ...yTicks.filter(v => v !== 0).map(v =>
            `<line x1="${s.ML}" y1="${s.sy(v).toFixed(1)}" x2="${plotRight}" y2="${s.sy(v).toFixed(1)}" class="chart-grid"/>`),
        ...xTicks.map(t =>
            `<line x1="${s.sx(t.x).toFixed(1)}" y1="${M.top}" x2="${s.sx(t.x).toFixed(1)}" y2="${plotBottom}" class="chart-grid"/>`),
    ].join('\n    ');

    const zeroY = s.sy(0).toFixed(1);
    const playoffLine = `<line x1="${s.ML}" y1="${zeroY}" x2="${plotRight}" y2="${zeroY}" class="chart-playoff-line"/>
`;
    // Key for the dashed line sits under the x-axis, clear of every team's line
    const showRingKey = teams.some(t => t.data[t.data.length - 1]?.divBelow);
    const keyX = s.ML + s.PW / 2 - (showRingKey ? 150 : 50);
    const keyY = VB_H - 8;
    const playoffKey = `<line x1="${keyX.toFixed(1)}" y1="${keyY}" x2="${(keyX + 24).toFixed(1)}" y2="${keyY}" class="chart-playoff-line"/>
  <text x="${(keyX + 30).toFixed(1)}" y="${keyY}" dy="0.35em" class="chart-playoff-line-label">Playoff line</text>${showRingKey ? `
  <circle cx="${(keyX + 136).toFixed(1)}" cy="${keyY}" r="4" fill="#111" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
  <text x="${(keyX + 146).toFixed(1)}" y="${keyY}" dy="0.35em" class="chart-playoff-line-label">In on a division spot</text>` : ''}`;

    const axisLabels = [
        ...yTicks.map(v => `<text x="${(s.ML - 8).toFixed(1)}" y="${s.sy(v).toFixed(1)}" dy="0.35em" text-anchor="end" class="chart-label">${v > 0 ? '+' : ''}${v}</text>`),
        ...xTicks.map(t => `<text x="${s.sx(t.x).toFixed(1)}" y="${(plotBottom + 16).toFixed(1)}" text-anchor="middle" class="chart-label">${t.label}</text>`),
    ].join('\n    ');

    const linePathPl = data => data
        .map((d, i) => `${i === 0 ? 'M' : 'L'}${s.sx(d.x).toFixed(1)},${s.sy(d.diff).toFixed(1)}`)
        .join(' ');

    const teamGroups = teams.filter(t => t.data.length).map(t => {
        const last = t.data[t.data.length - 1];
        const lx = s.sx(last.x);
        const ly = s.sy(last.diff);
        // Wild: shade the gap between its line and the playoff line
        const area = t.abbrev === 'MIN'
            ? `<path d="${linePathPl(t.data)} L${lx.toFixed(1)},${zeroY} L${s.sx(t.data[0].x).toFixed(1)},${zeroY} Z" fill="${t.config.lineColor}" fill-opacity="0.12" stroke="none" clip-path="url(#${clipId})" pointer-events="none"/>`
            : '';
        return `<g class="team-group" data-team="${t.abbrev}">
    ${area}<path d="${linePathPl(t.data)}" fill="none" stroke="${t.config.lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${clipId})"/>
    ${last.divBelow
        ? `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="#111" stroke="${t.config.lineColor}" stroke-width="2"/>`
        : `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" fill="${t.config.lineColor}" stroke="#111" stroke-width="1.5"/>`}
    <image href="https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg" x="${(lx + 5).toFixed(1)}" y="${(ly - LOGO_SIZE / 2).toFixed(1)}" width="${LOGO_SIZE}" height="${LOGO_SIZE}" style="cursor:pointer"/>
    </g>`;
    }).join('\n    ');

    return `<svg class="points-chart" viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${s.ML}" y="${M.top}" width="${s.PW}" height="${PLOT_H}"/>
    </clipPath>
  </defs>
  ${gridLineEls}
  <line x1="${s.ML}" y1="${M.top}" x2="${s.ML}" y2="${plotBottom}" class="chart-axis"/>
  <line x1="${s.ML}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" class="chart-axis"/>
  ${playoffLine}
  ${teamGroups}
  ${axisLabels}
  ${playoffKey}
  <text x="12" y="${(M.top + PLOT_H / 2).toFixed(1)}" text-anchor="middle" transform="rotate(-90,12,${(M.top + PLOT_H / 2).toFixed(1)})" class="chart-axis-title">Pts vs Wild Card</text>
</svg>`;
}

// ─── Chart hover: dim others, bring hovered to front, show tooltip ─────────

export function attachChartHoverHandlers(svg, teams, mode) {
    const groups = svg.querySelectorAll('.team-group');
    let hoveredTeam = null;

    // Chart coordinate params (mirrors buildChart / buildPctChart / buildPlayoffLineChart)
    const isLine = mode === 'line';
    const pl = isLine ? playoffLineScale(teams) : null;
    const xMax = isLine ? pl.xMax : teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.game ?? 0), 10);
    const ML_PCT = 65;
    const PW_PCT = VB_W - ML_PCT - M.right;

    const { yMax } = isLine ? { yMax: 0 } : pointsScale(teams);

    // x position of a data point ("game" on the points/pct charts, days into the season on the playoff line)
    const xOf = d => isLine ? d.x : d.game;

    const gameToSvgX = (game) => isLine ? pl.sx(game)
        : mode === 'pct' ? ML_PCT + (game / xMax) * PW_PCT
        : sx(game, xMax);

    const dataToSvgY = (d) => isLine ? pl.sy(d.diff)
        : mode === 'pct' ? M.top + PLOT_H - d.pct * PLOT_H
        : sy(d.points, yMax);

    const getTeamData = (team) => mode === 'pct' ? toPctProgression(team.data) : team.data;

    const formatLabel = (d) => isLine ? `${shortDate(d.date)}: ${d.diff > 0 ? '+' : ''}${d.diff} · ${d.spot}`
        : mode === 'pct' ? d.pct.toFixed(3)
        : `${d.points}`;

    // Build tooltip elements
    const NS = 'http://www.w3.org/2000/svg';
    const tooltipG = document.createElementNS(NS, 'g');
    tooltipG.setAttribute('class', 'chart-tooltip');
    tooltipG.style.display = 'none';
    tooltipG.style.pointerEvents = 'none';

    const tooltipRect = document.createElementNS(NS, 'rect');
    tooltipRect.setAttribute('class', 'chart-tooltip-bg');
    tooltipRect.setAttribute('rx', '4');
    tooltipRect.setAttribute('ry', '4');

    const tooltipText = document.createElementNS(NS, 'text');
    tooltipText.setAttribute('class', 'chart-tooltip-text');
    tooltipText.setAttribute('text-anchor', 'middle');
    tooltipText.setAttribute('dy', '0.35em');

    tooltipG.appendChild(tooltipRect);
    tooltipG.appendChild(tooltipText);
    svg.appendChild(tooltipG);

    function getSvgCoords(evt) {
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    function updateTooltip(team, svgX) {
        const data = getTeamData(team);
        if (!data.length) { tooltipG.style.display = 'none'; return; }

        const rawGame = isLine ? pl.invX(svgX)
            : mode === 'pct' ? (svgX - ML_PCT) / PW_PCT * xMax
            : (svgX - M.left) / PLOT_W * xMax;

        const nearest = data.reduce((best, d) =>
            Math.abs(xOf(d) - rawGame) < Math.abs(xOf(best) - rawGame) ? d : best
        );

        const cx = gameToSvgX(xOf(nearest));
        const cy = dataToSvgY(nearest);
        const label = formatLabel(nearest);

        const charW = 5.5;
        const padX = 8;
        const rH = 16;
        const rW = label.length * charW + padX * 2;

        // Clamp horizontally to stay inside SVG
        const leftBound = isLine ? pl.ML : mode === 'pct' ? ML_PCT : M.left;
        const rightBound = isLine ? (pl.ML + pl.PW) : mode === 'pct' ? (ML_PCT + PW_PCT) : (M.left + PLOT_W);
        const rx = Math.min(Math.max(cx - rW / 2, leftBound), rightBound - rW);
        const ry = Math.max(cy - rH - 8, M.top);

        tooltipRect.setAttribute('x', rx.toFixed(1));
        tooltipRect.setAttribute('y', ry.toFixed(1));
        tooltipRect.setAttribute('width', rW.toFixed(1));
        tooltipRect.setAttribute('height', rH.toFixed(1));
        tooltipText.setAttribute('x', (rx + rW / 2).toFixed(1));
        tooltipText.setAttribute('y', (ry + rH / 2).toFixed(1));
        tooltipText.textContent = label;

        tooltipG.style.display = '';
    }

    // Highlight one team: grey out the rest and bring its line to the front
    function highlight(abbrev) {
        hoveredTeam = teams.find(t => t.abbrev === abbrev) ?? null;
        groups.forEach(g => {
            const isTeam = g.dataset.team === abbrev;
            g.style.filter = isTeam ? '' : 'grayscale(1)';
            g.style.opacity = isTeam ? '' : '0.35';
            if (isTeam) g.parentNode.appendChild(g);
        });
        legendButtons.forEach(b => b.classList.toggle('dimmed', b.dataset.team !== abbrev));
        // Keep tooltip on top of everything
        svg.appendChild(tooltipG);
    }

    function reset() {
        groups.forEach(g => {
            g.style.filter = '';
            g.style.opacity = '';
        });
        legendButtons.forEach(b => b.classList.remove('dimmed', 'active'));
        hoveredTeam = null;
        tooltipG.style.display = 'none';
    }

    // Row of team logos under the chart — a second way to highlight a team,
    // and the only way to reach one whose logo is covered by another on the chart
    svg.parentNode.querySelector('.chart-team-legend')?.remove();
    const legend = document.createElement('div');
    legend.className = 'chart-team-legend';
    const lastPoints = t => (isLine ? t.data[t.data.length - 1]?.diff : t.data[t.data.length - 1]?.points) ?? 0;
    legend.innerHTML = [...teams]
        .sort((a, b) => lastPoints(b) - lastPoints(a))
        .map(t => `<button type="button" class="chart-legend-team" data-team="${t.abbrev}" aria-label="Highlight ${t.config?.name || t.abbrev}">
            <img src="https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg" alt="" width="28" height="28">
        </button>`)
        .join('');
    svg.after(legend);
    const legendButtons = legend.querySelectorAll('.chart-legend-team');

    // From the legend, show the tooltip at the team's latest point
    const highlightFromLegend = abbrev => {
        highlight(abbrev);
        const data = getTeamData(hoveredTeam);
        if (data.length) updateTooltip(hoveredTeam, gameToSvgX(xOf(data[data.length - 1])));
    };

    legendButtons.forEach(b => {
        b.addEventListener('mouseenter', () => highlightFromLegend(b.dataset.team));
        b.addEventListener('focus', () => highlightFromLegend(b.dataset.team));
        b.addEventListener('mouseleave', reset);
        b.addEventListener('blur', reset);
        // Touch: tap to highlight, tap again to clear
        b.addEventListener('click', () => {
            if (hoveredTeam?.abbrev === b.dataset.team && b.classList.contains('active')) {
                b.classList.remove('active');
                reset();
            } else {
                legendButtons.forEach(o => o.classList.remove('active'));
                b.classList.add('active');
                highlightFromLegend(b.dataset.team);
            }
        });
    });

    groups.forEach(g => {
        g.addEventListener('mouseenter', () => highlight(g.dataset.team));
    });

    svg.addEventListener('mousemove', (evt) => {
        if (!hoveredTeam) { tooltipG.style.display = 'none'; return; }
        const { x: svgX } = getSvgCoords(evt);
        updateTooltip(hoveredTeam, svgX);
    });

    svg.addEventListener('mouseleave', reset);
}

// ─── Points progression chart (Standings › Points Progression Chart) ─────────

let chartRoot = null; // element the chart page is mounted in
let refreshId = 0;     // latest redraw; an older one finishing late is dropped

async function refreshChart() {
    const chartWrap = chartRoot?.querySelector('.points-chart-wrap');
    if (!chartWrap) return;
    chartWrap.innerHTML = '<div class="chart-loading">Loading…</div>';
    const id = ++refreshId;

    try {
        if (chartMode === 'line') {
            const lines = await loadPlayoffLines();
            if (id !== refreshId) return;
            const entries = playoffConf === 'MIN' ? [['MIN', lines.W.MIN]] : Object.entries(lines[playoffConf]);
            const teams = entries.map(([abbrev, data]) => ({ abbrev, config: ALL_TEAMS[abbrev], data }));
            chartWrap.innerHTML = buildPlayoffLineChart(teams);
            const svg = chartWrap.querySelector('svg');
            if (svg) attachChartHoverHandlers(svg, teams, 'line');
            return;
        }
        const abbrevs = [...new Set([...(alwaysShowWild ? ['MIN'] : []), ...[...activeToggles].flatMap(div => DIVISIONS[div])])];
        const teams = await Promise.all(
            abbrevs.map(async abbrev => ({
                abbrev,
                config: ALL_TEAMS[abbrev],
                data: await loadTeamData(abbrev),
            }))
        );
        if (id !== refreshId) return;
        chartWrap.innerHTML = chartMode === 'pct' ? buildPctChart(teams) : buildChart(teams);
        const svg = chartWrap.querySelector('svg');
        if (svg) attachChartHoverHandlers(svg, teams, chartMode);
    } catch (err) {
        console.error('Error refreshing chart:', err);
        chartWrap.innerHTML = '<div class="error-message">Failed to load data.</div>';
    }
}

const CHART_INTROS = {
    standard: () => `How every NHL team has piled up points, game by game, through the ${getSeasonLabel()} regular season. Pick divisions to compare, or switch to points percentage to even out teams with games in hand.`,
    line: () => `How far each team has sat above or below its conference's second wild card spot on every day of the ${getSeasonLabel()} regular season. Above zero is a team holding a playoff spot. Raw points don't account for games in hand.`,
};

// Playoff line mode filters by conference; the other modes pick divisions (plus the Wild toggle)
function buildFilterToggles() {
    if (chartMode === 'line') {
        const wildOnly = `<button class="division-toggle wild-toggle${playoffConf === 'MIN' ? ' active' : ''}" data-conf="MIN" aria-pressed="${playoffConf === 'MIN'}" aria-label="Show only the Minnesota Wild"><img src="/logos/MIN_dark.svg" alt="" class="wild-toggle-logo"></button>`;
        return wildOnly + [['W', 'West'], ['E', 'East']].map(([conf, label]) =>
            `<button class="division-toggle${playoffConf === conf ? ' active' : ''}" data-conf="${conf}" aria-pressed="${playoffConf === conf}">${label}</button>`
        ).join('');
    }
    const wildToggle = `<button class="division-toggle wild-toggle${alwaysShowWild ? ' active' : ''}" data-wild aria-pressed="${alwaysShowWild}" aria-label="Always show the Minnesota Wild"><img src="/logos/MIN_dark.svg" alt="" class="wild-toggle-logo"></button>`;
    return wildToggle + Object.keys(DIVISIONS).map(div => {
        const isActive = activeToggles.has(div);
        return `<button class="division-toggle${isActive ? ' active' : ''}" data-division="${div}">${div}</button>`;
    }).join('');
}

function buildChartSection(initialChartHtml) {

    return `
        <div class="season-section">
            <h2 class="section-title">Points Progression</h2>
            <p class="points-chart-intro">${CHART_INTROS[chartMode === 'line' ? 'line' : 'standard']()}</p>
            <div class="points-chart-wrap">${initialChartHtml}</div>
            <div class="chart-controls">
                <div class="chart-mode-toggles">
                    <button class="division-toggle chart-mode-toggle${chartMode === 'points' ? ' active' : ''}" data-mode="points">Points</button>
                    <button class="division-toggle chart-mode-toggle${chartMode === 'pct' ? ' active' : ''}" data-mode="pct">Points Percentage</button>
                    <button class="division-toggle chart-mode-toggle${chartMode === 'line' ? ' active' : ''}" data-mode="line">Playoff Line</button>
                </div>
                <div class="division-toggles">${buildFilterToggles()}</div>
            </div>
        </div>`;
}

// Division / Wild / conference buttons — re-rendered when switching into or out of playoff line mode
function attachFilterHandlers() {
    chartRoot.querySelectorAll('.division-toggle[data-conf]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (playoffConf === btn.dataset.conf) return;
            playoffConf = btn.dataset.conf;
            chartRoot.querySelectorAll('.division-toggle[data-conf]').forEach(b => {
                b.classList.toggle('active', b === btn);
                b.setAttribute('aria-pressed', b === btn);
            });
            await refreshChart();
        });
    });

    chartRoot.querySelectorAll('.division-toggle[data-division]').forEach(btn => {
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

    chartRoot.querySelector('.wild-toggle[data-wild]')?.addEventListener('click', async e => {
        alwaysShowWild = !alwaysShowWild;
        e.currentTarget.classList.toggle('active', alwaysShowWild);
        e.currentTarget.setAttribute('aria-pressed', alwaysShowWild);
        await refreshChart();
    });
}

function attachToggleHandlers() {
    attachFilterHandlers();

    chartRoot.querySelectorAll('.chart-mode-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
            const mode = btn.dataset.mode;
            if (chartMode === mode) return;
            const filtersChange = (mode === 'line') !== (chartMode === 'line');
            chartMode = mode;
            updatePointsChartURL(mode);
            if (filtersChange) {
                chartRoot.querySelector('.division-toggles').innerHTML = buildFilterToggles();
                chartRoot.querySelector('.points-chart-intro').textContent = CHART_INTROS[mode === 'line' ? 'line' : 'standard']();
                attachFilterHandlers();
            }
            chartRoot.querySelectorAll('.chart-mode-toggle').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === mode);
            });
            await refreshChart();
        });
    });
}

let pageRenderId = 0; // latest page render; an older one finishing late is dropped

// Draw the full chart page into container: mode comes from the URL ('points' | 'pct' | 'line'),
// starting on the Central division (or the West, for the playoff line) with every toggle reset
export async function renderPointsProgressionPage(container, mode = 'points') {
    activeToggles = new Set(['Central']);
    chartMode = mode;
    playoffConf = 'W';
    alwaysShowWild = true;
    chartRoot = container;
    const id = ++pageRenderId;
    container.innerHTML = '<div class="loading">Loading chart…</div>';

    try {
        // One aggregated request holds every team's schedule; every chart mode draws from it
        await getAllTeamSchedules();
        if (id !== pageRenderId) return; // navigated again while loading

        container.innerHTML = buildChartSection('');
        attachToggleHandlers();
        await refreshChart();

        // Pre-populate the dataCache for every team so division toggles are instant
        Object.values(DIVISIONS).flat().forEach(abbrev => loadTeamData(abbrev).catch(() => {}));
    } catch (err) {
        console.error('Error loading points progression chart:', err);
        container.innerHTML = '<div class="error-message">Failed to load chart data.</div>';
    }
}

// ─── Load & render season stats sections ───────────────────────────────────

async function loadAndRenderStats(scheduleGames) {
    const statsEl = document.getElementById('season-extra-stats');
    if (!statsEl) return;

    const [standingsResult, breakdownResult, wildStatsResult, specialTeamsResult, gameFlowResult] = await Promise.allSettled([
        getStandings(),
        getWildSeasonBreakdown(),
        getWildStats(),
        getWildSpecialTeams(),
        getGameFlow(),
    ]);

    const standings       = standingsResult.value?.standings ?? [];
    const seasonBreakdown = breakdownResult.value ?? {};
    const periodScores    = seasonBreakdown.periodScores ?? {};
    const soScorers       = seasonBreakdown.soScorers ?? {};
    const wildStats       = wildStatsResult.value ?? {};

    const games = processGames(scheduleGames, periodScores);
    const slots = gameSlots(scheduleGames, games);

    statsEl.innerHTML = [
        buildAtAGlance(games, slots, standings),
        buildSpecialTeams(specialTeamsResult.value),
        buildPeriodScoring(games),
        buildSituationalRecords(games, gameFlowResult.value),
        buildBackToBack(games),
        buildDivisionConferenceRecords(games),
        // Playoff-race section — only shown in playoff mode
        PLAYOFF_MODE ? buildPlayoffTeamRecords(games, standings) : '',
        buildOTShootout(games, wildStats, soScorers, seasonBreakdown),
    ].join('');

    attachGameMarginsChart(statsEl, slots);
    if (specialTeamsResult.value) attachSpecialTeamsChart(statsEl, specialTeamsResult.value);
}

// ─── View init ─────────────────────────────────────────────────────────────

export async function init() {
    const container = document.getElementById('stats-season-view');
    container.innerHTML = '<div id="season-extra-stats"><div class="season-stats-loading">Loading statistics…</div></div>';

    try {
        const minSchedule = await getTeamSchedule('MIN');
        await loadAndRenderStats(minSchedule.games ?? []);
    } catch (err) {
        console.error('Error loading season view:', err);
        container.innerHTML = '<div class="error-message">Failed to load season data.</div>';
    }
}
