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
const LEADERS_LIMIT = 20; // top N per category for career leaders
const RECORDS_LIMIT = 10; // top N per category for single-season records

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
            // Keep most recent name/headshot
            acc.name = playerName(p);
            acc.headshot = p.headshot ?? acc.headshot;
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

async function buildPayload(seasonData) {
    const { skaters, goalies } = aggregateCareerTotals(seasonData);

    // Build with a 2× buffer so corrections can shift rankings without dropping true leaders
    const BUFFER = RECORDS_LIMIT * 2;

    const skaterSeasonRecords = buildSingleSeasonRecords(seasonData, SKATER_SEASON_CATS, 'skaters', BUFFER);
    console.log('   Checking single-season skater records for split seasons...');
    await correctSplitSeasonRecords(skaterSeasonRecords, SKATER_LANDING_STAT_MAP);
    for (const cat of Object.keys(skaterSeasonRecords)) {
        skaterSeasonRecords[cat] = skaterSeasonRecords[cat].slice(0, RECORDS_LIMIT);
    }

    const goalieSeasonRecords = buildSingleSeasonRecords(seasonData, GOALIE_SEASON_CATS, 'goalies', BUFFER);
    console.log('   Checking single-season goalie records for split seasons...');
    await correctSplitSeasonRecords(goalieSeasonRecords, GOALIE_LANDING_STAT_MAP);
    for (const cat of Object.keys(goalieSeasonRecords)) {
        goalieSeasonRecords[cat] = goalieSeasonRecords[cat].slice(0, RECORDS_LIMIT);
    }

    return {
        lastUpdated: new Date().toISOString(),
        seasonData,
        skaters: {
            careerLeaders: buildLeaders(skaters, SKATER_CAREER_CATS, LEADERS_LIMIT),
            singleSeasonRecords: skaterSeasonRecords,
        },
        goalies: {
            careerLeaders: buildLeaders(goalies, GOALIE_CAREER_CATS, LEADERS_LIMIT),
            singleSeasonRecords: goalieSeasonRecords,
        },
    };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function main() {
    const isSeed = process.argv.includes('--seed');

    console.log(`\n🏒 Wild Milestones Data Pipeline`);
    console.log(`   Mode: ${isSeed ? 'SEED (all seasons)' : 'INCREMENTAL (current season)'}\n`);

    // Load existing data from R2 (for incremental merge)
    let seasonData = {};
    if (!isSeed) {
        console.log('📦 Loading existing data from R2...');
        const existing = await readFromR2();
        seasonData = existing?.seasonData ?? {};
        if (Object.keys(seasonData).length === 0) {
            console.log('   No existing data found — falling back to full seed.\n');
        }
    }

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

    console.log('\n📊 Aggregating franchise records...');
    const payload = await buildPayload(seasonData);

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
