// Current Season view — team-level stats for 2025-26
import { getTeamSchedule, getStandings, getWildStats, getWildSeasonBreakdown } from '../api.js';

// ─── All 32 teams: division, name, chart color ─────────────────────────────
const ALL_TEAMS = {
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

const DIVISIONS = {
    Central:      ['CHI', 'COL', 'DAL', 'MIN', 'NSH', 'STL', 'UTA', 'WPG'],
    Pacific:      ['ANA', 'CGY', 'EDM', 'LAK', 'SJS', 'SEA', 'VAN', 'VGK'],
    Atlantic:     ['BOS', 'BUF', 'DET', 'FLA', 'MTL', 'OTT', 'TBL', 'TOR'],
    Metropolitan: ['CAR', 'CBJ', 'NJD', 'NYI', 'NYR', 'PHI', 'PIT', 'WSH'],
};

// ─── Module state ──────────────────────────────────────────────────────────
let activeToggles = new Set(['Central']);
let chartMode = 'points'; // 'points' | 'pct'
const dataCache = {}; // abbrev → points progression array

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

async function loadTeamData(abbrev) {
    if (dataCache[abbrev]) return dataCache[abbrev];
    const schedule = await getTeamSchedule(abbrev, '20252026');
    const data = computePointsProgression(schedule.games ?? [], abbrev);
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

function buildAtAGlance(games) {
    const r  = computeRecord(games);
    const hr = computeRecord(games.filter(g => g.isHome));
    const ar = computeRecord(games.filter(g => !g.isHome));
    const streak  = computeStreak(games);
    const gfPG = r.GP > 0 ? (r.GF / r.GP).toFixed(2) : '—';
    const gaPG = r.GP > 0 ? (r.GA / r.GP).toFixed(2) : '—';
    const gdiff  = r.GF - r.GA;
    const gdiffStr = gdiff > 0 ? `+${gdiff}` : `${gdiff}`;

    return `
    <div class="season-section">
      <h2 class="season-section-title">Season At a Glance</h2>
      <div class="season-glance-grid">
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
          <div class="glance-label">Goals For</div>
          <div class="glance-value">${r.GF}</div>
          <div class="glance-sub">${gfPG} per game</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">Goals Against</div>
          <div class="glance-value">${r.GA}</div>
          <div class="glance-sub">${gaPG} per game</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">Goal Diff</div>
          <div class="glance-value ${gdiff >= 0 ? 'glance-positive' : 'glance-negative'}">${gdiffStr}</div>
          <div class="glance-sub">${r.GP} games played</div>
        </div>
        <div class="season-glance-card">
          <div class="glance-label">Streak</div>
          <div class="glance-value">${streak}</div>
          <div class="glance-sub">current</div>
        </div>
      </div>
    </div>`;
}

// ─── Section: Period-by-Period Scoring ─────────────────────────────────────

function buildPeriodScoring(games) {
    const gamesWithPeriods = games.filter(g => g.periods.length > 0);
    if (gamesWithPeriods.length === 0) {
        return `<div class="season-section">
          <h2 class="season-section-title">Period-by-Period Scoring</h2>
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
      <h2 class="season-section-title">Period-by-Period Scoring</h2>
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

function buildSituationalRecords(games) {
    const gamesWithP1 = games.filter(g => g.stateAfterP1 !== null);
    const gamesWithP2 = games.filter(g => g.stateAfterP2 !== null);

    if (gamesWithP1.length === 0) {
        return `<div class="season-section">
          <h2 class="season-section-title">Situational Records</h2>
          <p class="season-no-data">Period data unavailable.</p>
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
      <h2 class="season-section-title">Situational Records</h2>
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
    </div>`;
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
      <h2 class="season-section-title">Back-to-Back Performance</h2>
      <p class="season-section-note">How the Wild perform on the second game of back-to-back sets.</p>
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
      <h2 class="season-section-title">Division &amp; Conference Records</h2>
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
          <h2 class="season-section-title">Record vs Playoff Teams</h2>
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
      <h2 class="season-section-title">Record vs Playoff Teams</h2>
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
      <h3 class="season-subsection-title">Goalie Records &amp; Goals Against by Period</h3>
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
      <h2 class="season-section-title">Overtime &amp; Shootout</h2>
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
          <h3 class="season-subsection-title">OT Goal Scorers (2025–26)</h3>
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
          <h3 class="season-subsection-title">Shootout Scorers (2025–26)</h3>
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

function buildChart(teams) {
    const xMax = teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.game ?? 0), 10);

    const maxPts = teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.points ?? 0), 40);
    const yMax   = Math.ceil((maxPts + 10) / 20) * 20;

    const plotBottom = M.top + PLOT_H;
    const plotRight  = M.left + PLOT_W;

    const yTicks = [];
    for (let p = 0; p <= yMax; p += 20) yTicks.push(p);

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
            ? `<path d="${areaPath(t.data, xMax, yMax)}" fill="url(#area-${t.abbrev})" stroke="none" pointer-events="none"/>`
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
    <linearGradient id="area-pct-${t.abbrev}" x1="0" y1="0" x2="0" y2="1">
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
            ? `<path d="${linePathPct(pctData, xMax)} L${lx.toFixed(1)},${syPct(0).toFixed(1)} L${sxPct(pctData[0].game, xMax).toFixed(1)},${syPct(0).toFixed(1)} Z" fill="url(#area-pct-${t.abbrev})" stroke="none" clip-path="url(#pct-plot-area)" pointer-events="none"/>`
            : '';
        return `<g class="team-group" data-team="${t.abbrev}">
    ${area}<path d="${linePathPct(pctData, xMax)}" fill="none" stroke="${t.config.lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#pct-plot-area)"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" fill="${t.config.lineColor}" stroke="#111" stroke-width="1.5"/>
    <image href="https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg" x="${(lx + 5).toFixed(1)}" y="${(ly - LOGO_SIZE / 2).toFixed(1)}" width="${LOGO_SIZE}" height="${LOGO_SIZE}" style="cursor:pointer"/>
    </g>`;
    }).join('\n    ');

    return `<svg class="points-chart" viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs}
    <clipPath id="pct-plot-area">
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

// ─── Chart hover: dim others, bring hovered to front, show tooltip ─────────

function attachChartHoverHandlers(svg, teams, mode) {
    const groups = svg.querySelectorAll('.team-group');
    let hoveredTeam = null;

    // Chart coordinate params (mirrors buildChart / buildPctChart)
    const xMax = teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.game ?? 0), 10);
    const ML_PCT = 65;
    const PW_PCT = VB_W - ML_PCT - M.right;

    const maxPts = teams.reduce((m, t) => Math.max(m, t.data[t.data.length - 1]?.points ?? 0), 40);
    const yMax = Math.ceil((maxPts + 10) / 20) * 20;

    const gameToSvgX = (game) => mode === 'pct'
        ? ML_PCT + (game / xMax) * PW_PCT
        : sx(game, xMax);

    const dataToSvgY = (d) => mode === 'pct'
        ? M.top + PLOT_H - d.pct * PLOT_H
        : sy(d.points, yMax);

    const getTeamData = (team) => mode === 'pct' ? toPctProgression(team.data) : team.data;

    const formatLabel = (d) => mode === 'pct'
        ? d.pct.toFixed(3)
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

        const rawGame = mode === 'pct'
            ? (svgX - ML_PCT) / PW_PCT * xMax
            : (svgX - M.left) / PLOT_W * xMax;

        const nearest = data.reduce((best, d) =>
            Math.abs(d.game - rawGame) < Math.abs(best.game - rawGame) ? d : best
        );

        const cx = gameToSvgX(nearest.game);
        const cy = dataToSvgY(nearest);
        const label = formatLabel(nearest);

        const charW = 5.5;
        const padX = 8;
        const rH = 16;
        const rW = label.length * charW + padX * 2;

        // Clamp horizontally to stay inside SVG
        const leftBound = mode === 'pct' ? ML_PCT : M.left;
        const rightBound = mode === 'pct' ? (ML_PCT + PW_PCT) : (M.left + PLOT_W);
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

    groups.forEach(g => {
        g.addEventListener('mouseenter', () => {
            hoveredTeam = teams.find(t => t.abbrev === g.dataset.team) ?? null;
            groups.forEach(other => {
                if (other !== g) {
                    other.style.filter = 'grayscale(1)';
                    other.style.opacity = '0.35';
                } else {
                    other.style.filter = '';
                    other.style.opacity = '';
                }
            });
            // Move hovered group to end of parent so it renders on top
            g.parentNode.appendChild(g);
            // Keep tooltip on top of everything
            svg.appendChild(tooltipG);
        });
    });

    svg.addEventListener('mousemove', (evt) => {
        if (!hoveredTeam) { tooltipG.style.display = 'none'; return; }
        const { x: svgX } = getSvgCoords(evt);
        updateTooltip(hoveredTeam, svgX);
    });

    svg.addEventListener('mouseleave', () => {
        groups.forEach(g => {
            g.style.filter = '';
            g.style.opacity = '';
        });
        hoveredTeam = null;
        tooltipG.style.display = 'none';
    });
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
        chartWrap.innerHTML = chartMode === 'pct' ? buildPctChart(teams) : buildChart(teams);
        const svg = chartWrap.querySelector('svg');
        if (svg) attachChartHoverHandlers(svg, teams, chartMode);
    } catch (err) {
        console.error('Error refreshing chart:', err);
        chartWrap.innerHTML = '<div class="error-message">Failed to load data.</div>';
    }
}

// ─── Page HTML builder ─────────────────────────────────────────────────────

function buildPage(initialChartHtml) {
    const divisionNames = Object.keys(DIVISIONS);
    const divToggles = divisionNames.map(div => {
        const isActive = activeToggles.has(div);
        return `<button class="division-toggle${isActive ? ' active' : ''}" data-division="${div}">${div}</button>`;
    }).join('');

    return `
        <div class="season-section">
            <h2 class="season-section-title">Points Progression</h2>
            <div class="points-chart-wrap">${initialChartHtml}</div>
            <div class="chart-controls">
                <div class="chart-mode-toggles">
                    <button class="division-toggle chart-mode-toggle${chartMode === 'points' ? ' active' : ''}" data-mode="points">Points</button>
                    <button class="division-toggle chart-mode-toggle${chartMode === 'pct' ? ' active' : ''}" data-mode="pct">Points Percentage</button>
                </div>
                <div class="division-toggles">${divToggles}</div>
            </div>
        </div>
        <div id="season-extra-stats"><div class="season-stats-loading">Loading statistics…</div></div>`;
}

function attachToggleHandlers() {
    document.querySelectorAll('#stats-season-view .division-toggle[data-division]').forEach(btn => {
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

    document.querySelectorAll('#stats-season-view .chart-mode-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
            const mode = btn.dataset.mode;
            if (chartMode === mode) return;
            chartMode = mode;
            document.querySelectorAll('#stats-season-view .chart-mode-toggle').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === mode);
            });
            await refreshChart();
        });
    });
}

// ─── Load & render season stats sections ───────────────────────────────────

async function loadAndRenderStats(scheduleGames) {
    const statsEl = document.getElementById('season-extra-stats');
    if (!statsEl) return;

    const [standingsResult, breakdownResult, wildStatsResult] = await Promise.allSettled([
        getStandings(),
        getWildSeasonBreakdown(),
        getWildStats(),
    ]);

    const standings       = standingsResult.value?.standings ?? [];
    const seasonBreakdown = breakdownResult.value ?? {};
    const periodScores    = seasonBreakdown.periodScores ?? {};
    const soScorers       = seasonBreakdown.soScorers ?? {};
    const wildStats       = wildStatsResult.value ?? {};

    const games = processGames(scheduleGames, periodScores);

    statsEl.innerHTML = [
        buildAtAGlance(games),
        buildPeriodScoring(games),
        buildSituationalRecords(games),
        buildBackToBack(games),
        buildDivisionConferenceRecords(games),
        buildPlayoffTeamRecords(games, standings),
        buildOTShootout(games, wildStats, soScorers, seasonBreakdown),
    ].join('');
}

// ─── View init ─────────────────────────────────────────────────────────────

export async function init() {
    activeToggles = new Set(['Central']);
    chartMode = 'points';

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
        const initSvg = container.querySelector('svg');
        if (initSvg) attachChartHoverHandlers(initSvg, teams, chartMode);

        // Pre-load other divisions in background for instant toggling.
        // Stagger requests to avoid rate-limiting the NHL API (50ms apart).
        // Errors are silenced — data loads on demand when a division is toggled.
        const otherAbbrevs = Object.values(DIVISIONS).flat().filter(a => !DIVISIONS.Central.includes(a));
        otherAbbrevs.forEach((abbrev, i) => {
            setTimeout(() => loadTeamData(abbrev).catch(() => {}), i * 50);
        });

        // Load stats sections using MIN schedule (already cached from chart)
        const minSchedule = await getTeamSchedule('MIN', '20252026');
        loadAndRenderStats(minSchedule.games ?? []);
    } catch (err) {
        console.error('Error loading season view:', err);
        container.innerHTML = '<div class="error-message">Failed to load season data.</div>';
    }
}
