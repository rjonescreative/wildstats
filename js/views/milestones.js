// Milestones view — approaching and achieved Wild franchise milestones
import { getMilestones, getWildStats, getCareerTotals } from '../api.js';

const APPROACHING_PCT = 0.95; // within 5% of target

// Round number targets for career Wild stats — multiples of 100 only
// gamesPlayed intentionally omitted: Wild-only GP rounds are not tracked;
// all-team career GP milestones are handled separately via ALL_TEAM_GP_ROUNDS.
const CAREER_ROUNDS = {
    goals:   [100, 200, 300, 400, 500],
    assists: [100, 200, 300, 400, 500, 600],
    points:  [100, 200, 300, 400, 500, 600, 700, 800],
    wins:    [100, 200, 300],
};

// Round number targets for all-team career NHL games played
const ALL_TEAM_GP_ROUNDS = [500, 600, 700, 800, 900, 1000];

function playerName(p) {
    if (p.firstName && p.lastName) {
        const first = typeof p.firstName === 'object' ? p.firstName.default : p.firstName;
        const last  = typeof p.lastName  === 'object' ? p.lastName.default  : p.lastName;
        return `${first} ${last}`;
    }
    return p.name || '';
}

function findNextRound(current, rounds) {
    return rounds.find(n => n > current) ?? null;
}

const APPROACHING_MAX_AWAY = 25;

function isApproaching(current, target) {
    return current < target && current >= target * APPROACHING_PCT && (target - current) <= APPROACHING_MAX_AWAY;
}

function crossedThisSeason(careerTotal, seasonContrib, target) {
    const before = careerTotal - seasonContrib;
    return before < target && careerTotal >= target;
}

// ─── Milestone computation ───────────────────────────────────────────────────

function computeMilestones(milestonesData, wildStats, careerTotalsMap) {
    const approaching = [];
    const achieved    = [];

    const currentSkaterMap = new Map((wildStats.skaters || []).map(p => [p.playerId, p]));
    const currentGoalieMap = new Map((wildStats.goalies  || []).map(p => [p.playerId, p]));

    // Process a career leader list for a single stat category
    function processCareer(leaders, stat, label, rounds, playerMap) {
        if (!leaders || leaders.length === 0) return;

        const recordValue  = leaders[0].value;
        const recordHolder = leaders[0].name;

        leaders.forEach((entry, idx) => {
            if (!playerMap.has(entry.playerId)) return;

            const careerTotal    = entry.value;
            const currentPlayer  = playerMap.get(entry.playerId);
            const seasonContrib  = currentPlayer[stat] || 0;
            const isRecordHolder = idx === 0;

            const headshot = entry.headshot || currentPlayer.headshot;

            // Approaching the franchise career record
            if (!isRecordHolder && isApproaching(careerTotal, recordValue)) {
                const remaining = recordValue - careerTotal;
                approaching.push({
                    playerId: entry.playerId,
                    name:     entry.name,
                    headshot,
                    label:    `Approaching Wild ${label} Record`,
                    sublabel: `${remaining} more to tie ${recordHolder}'s all-time record of ${recordValue}`,
                    current:  careerTotal,
                    target:   recordValue,
                    stat,
                    type:     'career',
                });
            }

            // If the player's all-team NHL career total equals their Wild career total,
            // they've only played for the Wild in the NHL. "Career" takes precedence
            // over "Wild" — the all-team section will show these milestones with the
            // "Career NHL" label instead, so we skip the Wild-specific round numbers here.
            const nhlTotal = careerTotalsMap[entry.playerId]?.[stat] ?? null;
            // Allow a small tolerance (≤5) for data-freshness lag between the two API sources
            const nhlEqualsWild = nhlTotal !== null && Math.abs(nhlTotal - careerTotal) <= 5;

            if (!nhlEqualsWild) {
                // Approaching next round number (Wild career)
                const nextRound = findNextRound(careerTotal, rounds);
                if (nextRound && isApproaching(careerTotal, nextRound)) {
                    const remaining = nextRound - careerTotal;
                    approaching.push({
                        playerId: entry.playerId,
                        name:     entry.name,
                        headshot,
                        label:    `${nextRound} Career Wild ${label}`,
                        sublabel: `${remaining} more ${stat} to reach ${nextRound}`,
                        current:  careerTotal,
                        target:   nextRound,
                        stat,
                        type:     'career',
                    });
                }

                // Achieved: crossed a round number this season (Wild career)
                rounds.forEach(round => {
                    if (crossedThisSeason(careerTotal, seasonContrib, round)) {
                        achieved.push({
                            playerId: entry.playerId,
                            name:     entry.name,
                            headshot,
                            label:    `${round} Career Wild ${label}`,
                            value:    round,
                            stat,
                            type:     'career',
                        });
                    }
                });
            }

            // Achieved: current all-time #1 broke the previous franchise record this season
            // The previous record is leaders[1].value (the old record holder, now #2)
            if (isRecordHolder && leaders.length >= 2) {
                const prevRecord = leaders[1].value;
                if (crossedThisSeason(careerTotal, seasonContrib, prevRecord)) {
                    achieved.push({
                        playerId: entry.playerId,
                        name:     entry.name,
                        headshot,
                        label:    `New Wild All-Time ${label} Record`,
                        value:    careerTotal,
                        stat,
                        type:     'career',
                    });
                }
            }
        });
    }

    // Process single-season records for all current players
    function processSeason(records, stat, label, playerMap) {
        if (!records || records.length === 0) return;

        const recordValue  = records[0].value;
        const recordSeason = records[0].season || '';
        const recordHolder = records[0].name;
        const isThisSeason = recordSeason.startsWith('2025');

        // Determine the team's games-played benchmark — the highest GP among all
        // current Wild players. Two thresholds:
        //   APPROACHING — lenient (within 20 games): player has been with the Wild
        //     for the bulk of the season and is on pace for the record.
        //   ACHIEVED    — strict (within 5 games): player must have been with the
        //     Wild essentially the full season to claim a franchise season record.
        //     This filters out mid-season acquisitions (e.g. a player who spent
        //     part of the year on another team).
        const maxTeamGP = Math.max(...[...playerMap.values()].map(p => p.gamesPlayed || 0));
        const MIN_GP_APPROACHING = Math.max(1, maxTeamGP - 20);
        const MIN_GP_ACHIEVED    = Math.max(1, maxTeamGP - 5);

        playerMap.forEach((player, playerId) => {
            const seasonStat    = player[stat] || 0;
            const isRecordOwner = playerId === records[0].playerId;
            const playerGP      = player.gamesPlayed || 0;

            if (seasonStat === 0) return;

            // Approaching the single-season record (any non-holder within 5%)
            if (!isRecordOwner && playerGP >= MIN_GP_APPROACHING && isApproaching(seasonStat, recordValue)) {
                const remaining = recordValue - seasonStat;
                approaching.push({
                    playerId,
                    name:     playerName(player),
                    headshot: player.headshot,
                    label:    `Approaching Wild Season ${label} Record`,
                    sublabel: `${remaining} more to tie ${recordHolder}'s franchise record of ${recordValue}`,
                    current:  seasonStat,
                    target:   recordValue,
                    stat,
                    type:     'season',
                });
            }

            // Achieved: set a new single-season record this year.
            // Require the player to have been with the Wild essentially all season.
            if (isRecordOwner && isThisSeason && playerGP >= MIN_GP_ACHIEVED) {
                achieved.push({
                    playerId,
                    name:     playerName(player),
                    headshot: player.headshot,
                    label:    `New Wild Season ${label} Record`,
                    value:    seasonStat,
                    stat,
                    type:     'season',
                });
            }

            // Edge case: surpassed the record holder (stale seed data)
            if (!isRecordOwner && playerGP >= MIN_GP_ACHIEVED && seasonStat > recordValue) {
                achieved.push({
                    playerId,
                    name:     playerName(player),
                    headshot: player.headshot,
                    label:    `New Wild Season ${label} Record`,
                    value:    seasonStat,
                    stat,
                    type:     'season',
                });
            }
        });
    }

    const { skaters, goalies } = milestonesData;

    processCareer(skaters.careerLeaders.goals,      'goals',   'Goals',       CAREER_ROUNDS.goals,   currentSkaterMap);
    processCareer(skaters.careerLeaders.assists,    'assists', 'Assists',     CAREER_ROUNDS.assists, currentSkaterMap);
    processCareer(skaters.careerLeaders.points,     'points',  'Points',      CAREER_ROUNDS.points,  currentSkaterMap);
    processCareer(goalies.careerLeaders.wins,       'wins',    'Goalie Wins', CAREER_ROUNDS.wins,    currentGoalieMap);

    // Wild franchise Games Played record only — no Wild-only GP round numbers
    processCareer(skaters.careerLeaders.gamesPlayed, 'gamesPlayed', 'Games Played', [], currentSkaterMap);

    // All-team career NHL milestones — GP and scoring stats across all teams
    const allPlayers = new Map([...currentSkaterMap, ...currentGoalieMap]);

    function processAllTeam(stat, rounds, statLabel, unitLabel) {
        allPlayers.forEach((player, playerId) => {
            const totals      = careerTotalsMap[playerId];
            if (!totals) return;
            const careerStat  = totals[stat] ?? 0;
            const wildSeasStat = player[stat] || 0;
            if (careerStat === 0) return;

            const headshot = player.headshot;
            const name     = playerName(player);

            // Approaching a round number
            const nextRound = findNextRound(careerStat, rounds);
            if (nextRound && isApproaching(careerStat, nextRound)) {
                approaching.push({
                    playerId,
                    name,
                    headshot,
                    label:   `${nextRound} Career NHL ${statLabel}`,
                    sublabel:`${nextRound - careerStat} more ${unitLabel} to reach ${nextRound}`,
                    current: careerStat,
                    target:  nextRound,
                    stat:    `nhl_${stat}`,
                    type:    'allteam',
                });
            }

            // Achieved: crossed a round number this season
            const approxBeforeSeason = careerStat - wildSeasStat;
            rounds.forEach(round => {
                if (approxBeforeSeason < round && careerStat >= round) {
                    achieved.push({
                        playerId,
                        name,
                        headshot,
                        label: `${round} Career NHL ${statLabel}`,
                        value: round,
                        stat:  `nhl_${stat}`,
                        type:  'allteam',
                    });
                }
            });
        });
    }

    processAllTeam('gamesPlayed', ALL_TEAM_GP_ROUNDS,    'Games Played', 'games');
    processAllTeam('goals',       CAREER_ROUNDS.goals,   'Goals',        'goals');
    processAllTeam('assists',     CAREER_ROUNDS.assists,  'Assists',      'assists');
    processAllTeam('points',      CAREER_ROUNDS.points,   'Points',       'points');

    processSeason(skaters.singleSeasonRecords.goals,   'goals',   'Goals',   currentSkaterMap);
    processSeason(skaters.singleSeasonRecords.assists,  'assists', 'Assists', currentSkaterMap);
    processSeason(skaters.singleSeasonRecords.points,   'points',  'Points',  currentSkaterMap);

    // Deduplicate (same playerId + label)
    function dedup(list) {
        const seen = new Set();
        return list.filter(m => {
            const key = `${m.playerId}|${m.label}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // Group a list so all cards for the same player are adjacent,
    // preserving the order of each player's first appearance.
    function groupByPlayer(list) {
        const order  = [];
        const groups = new Map();
        list.forEach(m => {
            if (!groups.has(m.playerId)) {
                groups.set(m.playerId, []);
                order.push(m.playerId);
            }
            groups.get(m.playerId).push(m);
        });
        return order.flatMap(id => groups.get(id));
    }

    // Group by player, sort each player's cards by milestone value descending (biggest first),
    // then sort player groups by their largest milestone value descending.
    // Works for both approaching cards (uses `target`) and achieved cards (uses `value`).
    function groupAndSortBySize(list) {
        const key    = m => m.target ?? m.value ?? 0;
        const order  = [];
        const groups = new Map();
        dedup(list).forEach(m => {
            if (!groups.has(m.playerId)) {
                groups.set(m.playerId, []);
                order.push(m.playerId);
            }
            groups.get(m.playerId).push(m);
        });
        groups.forEach(cards => cards.sort((a, b) => key(b) - key(a)));
        order.sort((a, b) => {
            const maxA = Math.max(...groups.get(a).map(key));
            const maxB = Math.max(...groups.get(b).map(key));
            return maxB - maxA;
        });
        return order.flatMap(id => groups.get(id));
    }

    return { approaching: groupAndSortBySize(approaching), achieved: groupAndSortBySize(achieved) };
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderApproachingCard(m) {
    const pct        = Math.min(100, Math.round((m.current / m.target) * 100));
    const remaining  = m.target - m.current;
    const headshotHtml = m.headshot
        ? `<img src="${m.headshot}" alt="${m.name}" class="milestone-photo">`
        : `<div class="milestone-photo milestone-photo--placeholder"></div>`;

    return `
        <div class="milestone-card">
            <div class="milestone-photo-wrap">${headshotHtml}</div>
            <div class="milestone-info">
                <div class="milestone-player-name">${m.name}</div>
                <div class="milestone-label">${m.label}</div>
                <div class="milestone-number">${m.current.toLocaleString()}</div>
                <div class="milestone-progress-wrap">
                    <div class="milestone-progress-track">
                        <div class="milestone-progress-fill" style="width:${pct}%"></div>
                    </div>
                    <div class="milestone-progress-meta">
                        <span>${m.current.toLocaleString()} / ${m.target.toLocaleString()}</span>
                        <span>${remaining} away</span>
                    </div>
                </div>
            </div>
        </div>`;
}

function renderAchievedCard(m) {
    const headshotHtml = m.headshot
        ? `<img src="${m.headshot}" alt="${m.name}" class="milestone-photo">`
        : `<div class="milestone-photo milestone-photo--placeholder"></div>`;

    return `
        <div class="milestone-card milestone-card--achieved">
            <div class="milestone-photo-wrap">${headshotHtml}</div>
            <div class="milestone-info">
                <div class="milestone-player-name">${m.name}</div>
                <div class="milestone-label">${m.label}</div>
                <div class="milestone-number milestone-number--achieved">${m.value.toLocaleString()}</div>
            </div>
        </div>`;
}

function renderSection(title, cards, emptyMessage) {
    return `
        <div class="milestones-section">
            <h2 class="milestones-section-title">${title}</h2>
            ${cards.length > 0
                ? `<div class="milestones-grid">${cards.join('')}</div>`
                : `<p class="milestones-empty">${emptyMessage}</p>`}
        </div>`;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function init() {
    const container = document.getElementById('stats-milestones-view');
    container.innerHTML = '<div class="loading">Loading milestones...</div>';

    try {
        const [milestonesData, wildStats, careerTotalsMap] = await Promise.all([
            getMilestones(),
            getWildStats(),
            getCareerTotals(),
        ]);

        const { approaching, achieved } = computeMilestones(milestonesData, wildStats, careerTotalsMap);

        const approachingCards = approaching.map(renderApproachingCard);
        const achievedCards    = achieved.map(renderAchievedCard);

        container.innerHTML =
            renderSection(
                'Approaching Milestones',
                approachingCards,
                'No players are currently within 5% of a franchise milestone.'
            ) +
            renderSection(
                'Milestones Reached This Season',
                achievedCards,
                'No franchise milestones have been reached yet this season.'
            );

    } catch (err) {
        console.error('Error loading milestones:', err);
        container.innerHTML = '<div class="loading">Error loading milestones.</div>';
    }
}
