#!/usr/bin/env node
/**
 * Milestones Data Pipeline
 *
 * Fetches Wild player stats for every season, aggregates franchise career totals
 * and single-season records, and stores the result in Cloudflare R2.
 *
 * Usage:
 *   node scripts/update-milestones.js           # incremental: current season only
 *   node scripts/update-milestones.js --seed    # full seed: all seasons from scratch
 */

import 'dotenv/config';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// ─── Config ──────────────────────────────────────────────────────────────────

const TEAM = 'MIN';
const NHL_API = 'https://api-web.nhle.com/v1';
const R2_KEY = 'milestones/franchise-leaders.json';
const LEADERS_LIMIT = 50; // top N per category for career leaders (needs buffer for position filtering)
const RECORDS_LIMIT = 25; // top N per category for single-season records (needs buffer for position filtering)

const REQUIRED_ENV = ['CF_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
    console.error(`\n❌ Missing required environment variables:\n   ${missing.join(', ')}`);
    console.error('\n   For local dev: copy .env.example → .env and fill in your credentials.');
    console.error('   For GitHub Actions: add these as repository secrets.\n');
    process.exit(1);
}

const BUCKET = process.env.R2_BUCKET_NAME;

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// ─── Season helpers ───────────────────────────────────────────────────────────

function getCurrentSeasonStartYear() {
    const now = new Date();
    const year = now.getFullYear();
    return now.getMonth() + 1 >= 10 ? year : year - 1;
}

function getCurrentSeason() {
    const y = getCurrentSeasonStartYear();
    return `${y}${y + 1}`;
}

function getAllSeasons() {
    const currentYear = getCurrentSeasonStartYear();
    const seasons = [];
    for (let y = 2000; y <= currentYear; y++) {
        if (y === 2004) continue; // 2004-05 lockout
        seasons.push(`${y}${y + 1}`);
    }
    return seasons;
}

// ─── NHL API fetchers ─────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, retries = 4) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);
            if (res.status === 429) {
                const wait = 5000 * attempt;
                console.warn(`   ⚠️  Rate limited (429), waiting ${wait / 1000}s before retry ${attempt}/${retries}...`);
                await sleep(wait);
                continue;
            }
            if (!res.ok) {
                lastErr = new Error(`HTTP ${res.status}`);
                if (attempt < retries) await sleep(1000 * attempt);
                continue;
            }
            return await res.json();
        } catch (err) {
            lastErr = err;
            if (attempt < retries) await sleep(1000 * attempt);
        }
    }
    throw lastErr ?? new Error(`Failed after ${retries} retries: ${url}`);
}

async function fetchClubStats(season) {
    return fetchWithRetry(`${NHL_API}/club-stats/${TEAM}/${season}/2`);
}

async function fetchSchedule(season) {
    return fetchWithRetry(`${NHL_API}/club-schedule-season/${TEAM}/${season}`);
}

async function fetchPlayByPlay(gameId) {
    return fetchWithRetry(`${NHL_API}/gamecenter/${gameId}/play-by-play`);
}

// ─── R2 helpers ───────────────────────────────────────────────────────────────

async function readFromR2() {
    try {
        const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: R2_KEY });
        const res = await r2.send(cmd);
        const text = await res.Body.transformToString();
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function writeToR2(payload) {
    const cmd = new PutObjectCommand({
        Bucket: BUCKET,
        Key: R2_KEY,
        Body: JSON.stringify(payload),
        ContentType: 'application/json',
    });
    await r2.send(cmd);
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

const SHOOTOUT_FIRST_SEASON_YEAR = 2005; // shootouts introduced in 2005-06

const SKATER_CAREER_CATS = [
    'goals', 'assists', 'points', 'gamesPlayed', 'penaltyMinutes',
    'powerPlayGoals', 'shorthandedGoals', 'gameWinningGoals', 'overtimeGoals',
];

const SKATER_SEASON_CATS = [
    'goals', 'assists', 'points', 'gamesPlayed', 'penaltyMinutes',
    'powerPlayGoals', 'shorthandedGoals', 'gameWinningGoals',
];

const GOALIE_CAREER_CATS = ['wins', 'gamesPlayed', 'shutouts'];
const GOALIE_SEASON_CATS = ['wins', 'gamesPlayed', 'shutouts'];

function playerName(p) {
    const first = p.firstName?.default ?? p.firstName ?? '';
    const last = p.lastName?.default ?? p.lastName ?? '';
    return `${first} ${last}`.trim();
}

function aggregateCareerTotals(seasonData) {
    // skaterMap: playerId → { ...accumulated stats, seasons: Set, name, headshot }
    const skaterMap = new Map();
    const goalieMap = new Map();

    for (const [season, { skaters = [], goalies = [] }] of Object.entries(seasonData)) {
        for (const p of skaters) {
            const id = p.playerId;
            if (!skaterMap.has(id)) {
                skaterMap.set(id, {
                    playerId: id,
                    name: playerName(p),
                    headshot: p.headshot ?? null,
                    positionCode: p.positionCode ?? null,
                    seasons: new Set(),
                    goals: 0, assists: 0, points: 0, gamesPlayed: 0,
                    penaltyMinutes: 0, powerPlayGoals: 0, shorthandedGoals: 0,
                    gameWinningGoals: 0, overtimeGoals: 0,
                });
            }
            const acc = skaterMap.get(id);
            acc.seasons.add(season);
            for (const cat of SKATER_CAREER_CATS) {
                acc[cat] = (acc[cat] ?? 0) + (p[cat] ?? 0);
            }
            // Keep most recent name/headshot/position
            acc.name = playerName(p);
            acc.headshot = p.headshot ?? acc.headshot;
            acc.positionCode = p.positionCode ?? acc.positionCode;
        }

        for (const p of goalies) {
            const id = p.playerId;
            if (!goalieMap.has(id)) {
                goalieMap.set(id, {
                    playerId: id,
                    name: playerName(p),
                    headshot: p.headshot ?? null,
                    seasons: new Set(),
                    wins: 0, gamesPlayed: 0, shutouts: 0,
                });
            }
            const acc = goalieMap.get(id);
            acc.seasons.add(season);
            for (const cat of GOALIE_CAREER_CATS) {
                acc[cat] = (acc[cat] ?? 0) + (p[cat] ?? 0);
            }
            acc.name = playerName(p);
            acc.headshot = p.headshot ?? acc.headshot;
        }
    }

    // Convert Set → count for serialization
    const finalSkaters = [...skaterMap.values()].map(p => ({ ...p, seasons: p.seasons.size }));
    const finalGoalies = [...goalieMap.values()].map(p => ({ ...p, seasons: p.seasons.size }));

    return { skaters: finalSkaters, goalies: finalGoalies };
}

function buildLeaders(players, categories, limit) {
    const result = {};
    for (const cat of categories) {
        result[cat] = [...players]
            .filter(p => (p[cat] ?? 0) > 0)
            .sort((a, b) => (b[cat] ?? 0) - (a[cat] ?? 0))
            .slice(0, limit)
            .map(p => ({
                playerId: p.playerId,
                name: p.name,
                headshot: p.headshot,
                positionCode: p.positionCode ?? null,
                seasons: p.seasons,
                value: p[cat] ?? 0,
            }));
    }
    return result;
}

function buildSingleSeasonRecords(seasonData, categories, playerType, limit) {
    // Flatten all season entries into {season, player} pairs, sort by value
    const result = {};
    for (const cat of categories) {
        const entries = [];
        for (const [season, data] of Object.entries(seasonData)) {
            const players = playerType === 'skaters' ? (data.skaters ?? []) : (data.goalies ?? []);
            for (const p of players) {
                if ((p[cat] ?? 0) > 0) {
                    entries.push({
                        playerId: p.playerId,
                        name: playerName(p),
                        headshot: p.headshot ?? null,
                        positionCode: p.positionCode ?? null,
                        season,
                        value: p[cat] ?? 0,
                    });
                }
            }
        }
        result[cat] = entries
            .sort((a, b) => b.value - a.value)
            .slice(0, limit);
    }
    return result;
}

// ─── Shootout goal pipeline ───────────────────────────────────────────────────

function getShootoutSeasons() {
    const currentYear = getCurrentSeasonStartYear();
    const seasons = [];
    for (let y = SHOOTOUT_FIRST_SEASON_YEAR; y <= currentYear; y++) {
        seasons.push(`${y}${y + 1}`);
    }
    return seasons;
}

/**
 * Builds a playerId → { name, headshot } lookup from all seasons in seasonData.
 * Used to resolve player info for shootout scorers found in play-by-play.
 */
function buildPlayerLookup(seasonData) {
    const map = new Map();
    for (const { skaters = [] } of Object.values(seasonData)) {
        for (const p of skaters) {
            map.set(p.playerId, { name: playerName(p), headshot: p.headshot ?? null, positionCode: p.positionCode ?? null });
        }
    }
    return map;
}

/**
 * Fetches play-by-play for all completed Wild games in the given seasons and
 * counts shootout goals by Wild players. Returns a map of:
 *   { [season]: { [playerId]: count } }
 *
 * Existing data for seasons NOT in `seasons` is preserved from `existing`.
 */
async function buildShootoutData(seasons, playerLookup, existing = {}) {
    const shootoutData = { ...existing };

    for (const season of seasons) {
        process.stdout.write(`   Fetching schedule for ${season}...`);
        let schedule;
        try {
            schedule = await fetchSchedule(season);
        } catch (err) {
            console.warn(` ⚠️  Failed: ${err.message}`);
            await sleep(200);
            continue;
        }

        const games = (schedule.games ?? []).filter(g =>
            g.gameState === 'OFF' || g.gameState === 'FINAL'
        );
        process.stdout.write(` ${games.length} completed games\n`);

        const seasonTotals = {}; // playerId → count

        // Fetch play-by-play in batches of 5 to avoid rate limiting
        const BATCH = 5;
        for (let i = 0; i < games.length; i += BATCH) {
            const batch = games.slice(i, i + BATCH);
            const results = await Promise.allSettled(
                batch.map(g => fetchPlayByPlay(g.id ?? g.gameId))
            );

            for (const result of results) {
                if (result.status !== 'fulfilled') continue;
                const pbp = result.value;

                // Identify the Wild's team ID in this game
                const wildTeam = pbp.homeTeam?.abbrev === TEAM ? pbp.homeTeam
                    : pbp.awayTeam?.abbrev === TEAM ? pbp.awayTeam
                    : null;
                if (!wildTeam) continue;

                // Find shootout goals by Wild players
                const soGoals = (pbp.plays ?? []).filter(p =>
                    p.typeDescKey === 'goal' &&
                    p.periodDescriptor?.periodType === 'SO' &&
                    p.details?.eventOwnerTeamId === wildTeam.id
                );

                for (const play of soGoals) {
                    const pid = play.details?.scoringPlayerId;
                    if (!pid) continue;
                    seasonTotals[pid] = (seasonTotals[pid] ?? 0) + 1;
                }
            }

            if (i + BATCH < games.length) await sleep(150);
        }

        const scorerCount = Object.keys(seasonTotals).length;
        process.stdout.write(`   ✓ ${season}: ${scorerCount} player(s) with SO goals\n`);
        shootoutData[season] = seasonTotals;
        await sleep(200);
    }

    return shootoutData;
}

function buildShootoutCareerLeaders(shootoutData, playerLookup, limit, posCodes = null) {
    const careerMap = new Map(); // playerId → { goals, name, headshot }

    for (const seasonTotals of Object.values(shootoutData)) {
        for (const [pidStr, goals] of Object.entries(seasonTotals)) {
            const pid = Number(pidStr);
            const info = playerLookup.get(pid) ?? { name: 'Unknown', headshot: null, positionCode: null };
            if (posCodes !== null && !posCodes.has(info.positionCode)) continue;
            if (!careerMap.has(pid)) {
                careerMap.set(pid, { playerId: pid, goals: 0, name: info.name, headshot: info.headshot, positionCode: info.positionCode ?? null });
            }
            careerMap.get(pid).goals += goals;
        }
    }

    return [...careerMap.values()]
        .sort((a, b) => b.goals - a.goals)
        .slice(0, limit)
        .map(p => ({ playerId: p.playerId, name: p.name, headshot: p.headshot, positionCode: p.positionCode ?? null, value: p.goals }));
}

function buildShootoutSeasonRecords(shootoutData, playerLookup, limit, posCodes = null) {
    const entries = [];
    for (const [season, seasonTotals] of Object.entries(shootoutData)) {
        for (const [pidStr, goals] of Object.entries(seasonTotals)) {
            const pid = Number(pidStr);
            const info = playerLookup.get(pid) ?? { name: 'Unknown', headshot: null, positionCode: null };
            if (posCodes !== null && !posCodes.has(info.positionCode)) continue;
            entries.push({
                playerId: pid,
                name: info.name,
                headshot: info.headshot,
                positionCode: info.positionCode ?? null,
                season,
                value: goals,
            });
        }
    }
    return entries.sort((a, b) => b.value - a.value).slice(0, limit);
}

/**
 * Fetches landing pages for all Wild goalies to find any goals they scored
 * while playing for the Wild. Returns { career: [...], season: [...] }.
 * Goalie goals are extremely rare (e.g. Gustavsson 2024-25).
 */
async function buildGoalieGoalLeaders(seasonData, limit) {
    // Build goalie info map from all seasons (keep most recent name/headshot)
    const goalieInfo = new Map();
    for (const { goalies = [] } of Object.values(seasonData)) {
        for (const g of goalies) {
            goalieInfo.set(g.playerId, {
                name: playerName(g),
                headshot: g.headshot ?? (goalieInfo.get(g.playerId)?.headshot ?? null),
            });
        }
    }

    // Map of season (int) → Set of goalie player IDs who played for the Wild that season
    // This ensures we only count goals in seasons the goalie was actually on the Wild roster.
    const wildGoaliesBySeason = new Map();
    for (const [season, { goalies = [] }] of Object.entries(seasonData)) {
        wildGoaliesBySeason.set(parseInt(season), new Set(goalies.map(g => g.playerId)));
    }

    const careerGoals = new Map(); // playerId → { total, name, headshot }
    const seasonGoals = [];

    let checked = 0;
    for (const [id, info] of goalieInfo) {
        try {
            const landing = await fetchWithRetry(`${NHL_API}/player/${id}/landing`);
            const totals = landing.seasonTotals ?? [];

            for (const entry of totals) {
                // Only count seasons where this goalie was actually on the Wild roster
                if (!wildGoaliesBySeason.get(entry.season)?.has(id)) continue;
                if (entry.gameTypeId !== 2) continue;
                if (entry.leagueAbbrev !== 'NHL') continue;

                // For split seasons, only count the Wild leg
                const sameSeasonEntries = totals.filter(e =>
                    e.season === entry.season && e.gameTypeId === 2 && e.leagueAbbrev === 'NHL'
                );
                if (sameSeasonEntries.length > 1 && entry.teamCommonName?.default !== 'Wild') continue;

                const goals = entry.goals ?? 0;
                if (goals <= 0) continue;

                const existing = careerGoals.get(id);
                if (existing) {
                    existing.total += goals;
                } else {
                    careerGoals.set(id, { total: goals, name: info.name, headshot: info.headshot });
                }
                seasonGoals.push({
                    playerId: id,
                    name: info.name,
                    headshot: info.headshot,
                    positionCode: 'G',
                    season: String(entry.season),
                    value: goals,
                });
            }
            checked++;
        } catch {
            // skip on error
        }
        await sleep(150);
    }

    console.log(`   ✓ Checked ${checked} goalie landing pages, found ${careerGoals.size} with Wild goal(s)`);

    const career = [...careerGoals.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, limit)
        .map(([id, data]) => ({
            playerId: id,
            name: data.name,
            headshot: data.headshot,
            positionCode: 'G',
            value: data.total,
        }));

    const season = seasonGoals.sort((a, b) => b.value - a.value).slice(0, limit);

    return { career, season };
}

// Maps from our stat category names → field names in the player landing seasonTotals
const SKATER_LANDING_STAT_MAP = {
    goals: e => e.goals ?? 0,
    assists: e => e.assists ?? 0,
    points: e => e.points ?? 0,
    gamesPlayed: e => e.gamesPlayed ?? 0,
    penaltyMinutes: e => e.pim ?? 0,
    powerPlayGoals: e => e.powerPlayGoals ?? 0,
    shorthandedGoals: e => e.shorthandedGoals ?? 0,
    gameWinningGoals: e => e.gameWinningGoals ?? 0,
};

const GOALIE_LANDING_STAT_MAP = {
    wins: e => e.wins ?? 0,
    gamesPlayed: e => e.gamesPlayed ?? 0,
    shutouts: e => e.shutouts ?? 0,
};

/**
 * For single-season records, the club-stats endpoint returns a player's full-season
 * totals even if they played part of the season with another team. This function fetches
 * player landing pages for all top-record candidates and substitutes Wild-only stats
 * wherever a split season is detected (multiple NHL entries for the same season).
 */
async function correctSplitSeasonRecords(records, statMap) {
    // Collect unique player IDs across all record categories
    const playerIds = new Set();
    for (const entries of Object.values(records)) {
        for (const e of entries) playerIds.add(e.playerId);
    }

    // Fetch landing pages for all unique players
    const landings = new Map(); // playerId → seasonTotals[]
    for (const id of playerIds) {
        try {
            const landing = await fetchWithRetry(`${NHL_API}/player/${id}/landing`);
            landings.set(id, landing.seasonTotals ?? []);
        } catch {
            landings.set(id, []);
        }
        await sleep(150);
    }

    // Correct entries where the player had a split season
    let corrected = 0;
    for (const [cat, entries] of Object.entries(records)) {
        const extractor = statMap[cat];
        if (!extractor) continue;

        for (const entry of entries) {
            const seasonTotals = landings.get(entry.playerId) ?? [];
            const seasonInt = parseInt(entry.season);

            // All NHL regular-season entries for this season
            const nhlEntries = seasonTotals.filter(s =>
                s.season === seasonInt &&
                s.gameTypeId === 2 &&
                s.leagueAbbrev === 'NHL'
            );

            // Only act when there are multiple NHL teams (genuine split season)
            if (nhlEntries.length < 2) continue;

            const wildEntry = nhlEntries.find(s => s.teamCommonName?.default === 'Wild');
            if (!wildEntry) continue;

            const correctedValue = extractor(wildEntry);
            if (correctedValue !== entry.value) {
                entry.value = correctedValue;
                corrected++;
            }
        }

        // Re-sort after corrections so rankings are accurate
        entries.sort((a, b) => b.value - a.value);
    }

    if (corrected > 0) {
        console.log(`   ✓ Corrected ${corrected} split-season stat(s) to Wild-only totals`);
    }
}

async function buildPayload(seasonData, shootoutData) {
    const { skaters, goalies } = aggregateCareerTotals(seasonData);
    const playerLookup = buildPlayerLookup(seasonData);

    const FORWARDS = new Set(['L', 'R', 'C']);
    const DEFENSE  = new Set(['D']);

    // ── Career leaders (split by position) ──────────────────────────────────
    const forwards = skaters.filter(p => FORWARDS.has(p.positionCode));
    const defense  = skaters.filter(p => DEFENSE.has(p.positionCode));

    const allCareer = buildLeaders(skaters,  SKATER_CAREER_CATS, LEADERS_LIMIT);
    const fwdCareer = buildLeaders(forwards, SKATER_CAREER_CATS, 25);
    const defCareer = buildLeaders(defense,  SKATER_CAREER_CATS, 25);

    // ── Single-season records: build a large all-skater pool, correct once ──
    // Buffer large enough to guarantee 20 forwards AND 20 defensemen after filtering
    const SEASON_BUFFER = 100;
    const allSkaterSeasonRaw = buildSingleSeasonRecords(seasonData, SKATER_SEASON_CATS, 'skaters', SEASON_BUFFER);
    console.log('   Checking single-season skater records for split seasons...');
    await correctSplitSeasonRecords(allSkaterSeasonRaw, SKATER_LANDING_STAT_MAP);

    // Derive position records from the corrected pool, then trim
    function sliceRecords(pool, limit) {
        const out = {};
        for (const [cat, entries] of Object.entries(pool)) out[cat] = entries.slice(0, limit);
        return out;
    }
    function filterRecords(pool, posCodes, limit) {
        const out = {};
        for (const [cat, entries] of Object.entries(pool)) {
            out[cat] = entries.filter(e => posCodes.has(e.positionCode)).slice(0, limit);
        }
        return out;
    }

    const allSkaterSeason = sliceRecords(allSkaterSeasonRaw, RECORDS_LIMIT);
    const fwdSeason       = filterRecords(allSkaterSeasonRaw, FORWARDS, 20);
    const defSeason       = filterRecords(allSkaterSeasonRaw, DEFENSE,  20);

    // ── Goalie season records ────────────────────────────────────────────────
    const goalieSeasonRecordsRaw = buildSingleSeasonRecords(seasonData, GOALIE_SEASON_CATS, 'goalies', RECORDS_LIMIT * 2);
    console.log('   Checking single-season goalie records for split seasons...');
    await correctSplitSeasonRecords(goalieSeasonRecordsRaw, GOALIE_LANDING_STAT_MAP);
    const goalieSeasonRecords = sliceRecords(goalieSeasonRecordsRaw, RECORDS_LIMIT);

    // ── Goalie goals (very rare — fetches landing pages) ────────────────────
    console.log('   Fetching goalie goal records...');
    const goalieGoalData = await buildGoalieGoalLeaders(seasonData, 20);

    // ── Shootout leaders (position-split) ───────────────────────────────────
    const allSOCareer = buildShootoutCareerLeaders(shootoutData, playerLookup, LEADERS_LIMIT);
    const fwdSOCareer = buildShootoutCareerLeaders(shootoutData, playerLookup, 25, FORWARDS);
    const defSOCareer = buildShootoutCareerLeaders(shootoutData, playerLookup, 25, DEFENSE);

    const allSOSeason = buildShootoutSeasonRecords(shootoutData, playerLookup, RECORDS_LIMIT);
    const fwdSOSeason = buildShootoutSeasonRecords(shootoutData, playerLookup, 20, FORWARDS);
    const defSOSeason = buildShootoutSeasonRecords(shootoutData, playerLookup, 20, DEFENSE);

    return {
        lastUpdated: new Date().toISOString(),
        seasonData,
        shootoutData,
        skaters: {
            careerLeaders: {
                all:     { ...allCareer, shootoutGoals: allSOCareer },
                forwards:{ ...fwdCareer, shootoutGoals: fwdSOCareer },
                defense: { ...defCareer, shootoutGoals: defSOCareer },
            },
            singleSeasonRecords: {
                all:     { ...allSkaterSeason, shootoutGoals: allSOSeason },
                forwards:{ ...fwdSeason,       shootoutGoals: fwdSOSeason },
                defense: { ...defSeason,        shootoutGoals: defSOSeason },
            },
        },
        goalies: {
            careerLeaders:     { ...buildLeaders(goalies, GOALIE_CAREER_CATS, LEADERS_LIMIT), goals: goalieGoalData.career },
            singleSeasonRecords: { ...goalieSeasonRecords, goals: goalieGoalData.season },
        },
    };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function main() {
    const isSeed = process.argv.includes('--seed');
    const isSeedShootout = process.argv.includes('--seed-shootout');
    const isRebuild = process.argv.includes('--rebuild');

    const modeLabel = isSeed ? 'SEED (all seasons)'
        : isSeedShootout ? 'SEED SHOOTOUT (all seasons, shootout only)'
        : isRebuild ? 'REBUILD (reprocess existing R2 data, no new fetches)'
        : 'INCREMENTAL (current season)';
    console.log(`\n🏒 Wild Milestones Data Pipeline`);
    console.log(`   Mode: ${modeLabel}\n`);

    // Load existing data from R2 (for incremental merge)
    let existing = null;
    let seasonData = {};
    let shootoutData = {};

    if (!isSeed) {
        console.log('📦 Loading existing data from R2...');
        existing = await readFromR2();
        seasonData = existing?.seasonData ?? {};
        shootoutData = existing?.shootoutData ?? {};
        if (Object.keys(seasonData).length === 0) {
            console.log('   No existing data found — falling back to full seed.\n');
        }
    }

    // Rebuild: skip all fetching, just reprocess existing R2 data
    if (isRebuild) {
        console.log(`📊 Rebuilding from existing data (${Object.keys(seasonData).length} seasons, ${Object.keys(shootoutData).length} shootout seasons)...`);
        const payload = await buildPayload(seasonData, shootoutData);
        console.log('\n💾 Writing to R2...');
        await writeToR2(payload);
        console.log('✅ Done.\n');
        return;
    }

    if (!isSeedShootout) {
        const seasons = isSeed ? getAllSeasons() : [getCurrentSeason()];
        console.log(`📅 Fetching ${seasons.length} season(s): ${seasons[0]} → ${seasons[seasons.length - 1]}`);

        let fetched = 0;
        let failed = 0;
        for (const season of seasons) {
            try {
                const data = await fetchClubStats(season);
                seasonData[season] = {
                    skaters: data.skaters ?? [],
                    goalies: data.goalies ?? [],
                };
                fetched++;
                process.stdout.write(`   ✓ ${season}\n`);
            } catch (err) {
                console.warn(`   ⚠️  ${season} failed: ${err.message}`);
                failed++;
            }
            // Brief delay to be polite to the NHL API
            if (seasons.length > 1) await sleep(200);
        }

        console.log(`\n   ${fetched} fetched, ${failed} failed`);
    }

    // Shootout data: seed all seasons or update current season only
    const shootoutSeasons = (isSeed || isSeedShootout) ? getShootoutSeasons() : [getCurrentSeason()];
    const existingShootout = (isSeed || isSeedShootout) ? {} : shootoutData;
    console.log(`\n🎯 Building shootout goal leaders (${shootoutSeasons.length} season(s))...`);
    const playerLookupForShootout = buildPlayerLookup(seasonData);
    shootoutData = await buildShootoutData(shootoutSeasons, playerLookupForShootout, existingShootout);

    console.log('\n📊 Aggregating franchise records...');
    const payload = await buildPayload(seasonData, shootoutData);

    const totalSkaters = Object.values(payload.skaters.careerLeaders)[0]?.length ?? 0;
    const totalGoalies = Object.values(payload.goalies.careerLeaders)[0]?.length ?? 0;
    console.log(`   Skater career leader entries: ${totalSkaters} per category`);
    console.log(`   Goalie career leader entries: ${totalGoalies} per category`);

    console.log('\n💾 Writing to R2...');
    await writeToR2(payload);

    console.log('✅ Done.\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
