#!/usr/bin/env node
/**
 * H2H Data Pipeline
 *
 * Fetches Wild head-to-head game data from the NHL API, aggregates stats,
 * and stores one JSON file per opponent in Cloudflare R2.
 *
 * Usage:
 *   node scripts/update-h2h-data.js           # incremental: current season only
 *   node scripts/update-h2h-data.js --seed    # full seed: all seasons, all opponents
 *   node scripts/update-h2h-data.js --opponent ANA  # single opponent (for testing)
 */

import 'dotenv/config';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { NHL_TEAMS } from '../js/teams.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const TEAM = 'MIN';
const NHL_API = 'https://api-web.nhle.com/v1';

// Validate required env vars up front
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

function getAllSeasons() {
    const currentYear = getCurrentSeasonStartYear();
    const seasons = [];
    for (let y = 2000; y <= currentYear; y++) {
        if (y === 2004) continue; // 2004-05 lockout — no games played
        seasons.push(`${y}${y + 1}`);
    }
    return seasons;
}

function getCurrentSeason() {
    const y = getCurrentSeasonStartYear();
    return `${y}${y + 1}`;
}

function getLastSeason() {
    const y = getCurrentSeasonStartYear() - 1;
    if (y === 2004) return `${y - 1}${y}`;
    return `${y}${y + 1}`;
}

function getLast5Seasons() {
    const current = getCurrentSeasonStartYear();
    const seasons = [];
    for (let y = current - 4; y <= current; y++) {
        if (y < 2000 || y === 2004) continue;
        seasons.push(`${y}${y + 1}`);
    }
    return seasons;
}

// ─── NHL API fetchers ─────────────────────────────────────────────────────────

async function fetchWithRetry(url, retries = 4) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);
            if (res.status === 429) {
                // Rate limited — back off progressively
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
            // Network error (ECONNRESET, ETIMEDOUT, etc.) — retry with back-off
            lastErr = err;
            if (attempt < retries) await sleep(1000 * attempt);
        }
    }
    throw lastErr ?? new Error(`Failed after ${retries} retries: ${url}`);
}

async function fetchSchedule(season) {
    return fetchWithRetry(`${NHL_API}/club-schedule-season/${TEAM}/${season}`);
}

async function fetchRightRail(gameId) {
    return fetchWithRetry(`${NHL_API}/gamecenter/${gameId}/right-rail`);
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseTeamStats(stats, side) {
    if (!stats || !Array.isArray(stats)) return null;

    const get = (cat) => {
        const entry = stats.find(s => s.category === cat);
        return entry ? (side === 'home' ? entry.homeValue : entry.awayValue) : null;
    };

    // powerPlay: "1/4" format → goals / opportunities
    const ppRaw = get('powerPlay');
    let ppGoals = null, ppOpportunities = null;
    if (ppRaw != null) {
        const ppStr = String(ppRaw);
        if (ppStr.includes('/')) {
            const [g, o] = ppStr.split('/').map(Number);
            ppGoals = isNaN(g) ? null : g;
            ppOpportunities = isNaN(o) ? null : o;
        }
    }

    // faceoffWins: "26/55" format → wins / total faceoffs in the game
    const foRaw = get('faceoffWins');
    let faceoffWins = null, faceoffTotal = null;
    if (foRaw != null) {
        const foStr = String(foRaw);
        if (foStr.includes('/')) {
            const [fw, ft] = foStr.split('/').map(Number);
            faceoffWins = isNaN(fw) ? null : fw;
            faceoffTotal = isNaN(ft) ? null : ft;
        } else {
            faceoffWins = parseInt(foRaw, 10);
        }
    }

    const n = (v) => (v != null && v !== '' ? parseInt(v, 10) : null);

    return {
        sog: n(get('sog')),
        faceoffWins,
        faceoffTotal,
        ppGoals,
        ppOpportunities,
        pim: n(get('pim')),
        hits: n(get('hits')),
        blockedShots: n(get('blockedShots')),
        giveaways: n(get('giveaways')),
        takeaways: n(get('takeaways')),
    };
}

function parseGame(scheduleGame) {
    const { id, season, gameDate, gameState, gameType, gameOutcome, homeTeam, awayTeam } = scheduleGame;

    // Only completed regular season games
    if (gameType !== 2) return null;
    if (gameState !== 'OFF' && gameState !== 'FINAL') return null;
    if (!homeTeam?.score == null || !awayTeam?.score == null) return null;

    const isMinHome = homeTeam.abbrev === TEAM;
    const oppAbbrev = isMinHome ? awayTeam.abbrev : homeTeam.abbrev;
    if (oppAbbrev === TEAM) return null; // shouldn't happen

    return {
        gameId: id,
        season: String(season),
        date: gameDate,
        isMinHome,
        oppAbbrev,
        minScore: isMinHome ? (homeTeam.score ?? 0) : (awayTeam.score ?? 0),
        oppScore: isMinHome ? (awayTeam.score ?? 0) : (homeTeam.score ?? 0),
        lastPeriodType: gameOutcome?.lastPeriodType ?? 'REG',
        minStats: null,
        oppStats: null,
        faceoffTotal: null,
    };
}

async function enrichWithRightRail(game) {
    try {
        const data = await fetchRightRail(game.gameId);
        const stats = data.teamGameStats;
        const side = game.isMinHome ? 'home' : 'away';
        const oppSide = game.isMinHome ? 'away' : 'home';

        game.minStats = parseTeamStats(stats, side);
        game.oppStats = parseTeamStats(stats, oppSide);

        // faceoffTotal is the same from either side (total faceoffs in the game)
        game.faceoffTotal = game.minStats?.faceoffTotal ?? game.oppStats?.faceoffTotal ?? null;
    } catch {
        // Right-rail not available for this game — that's OK, we keep score data
    }
    return game;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function sumStat(games, statsKey, field) {
    const vals = games.map(g => g[statsKey]?.[field]).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

function aggregateSide(games, statsKey) {
    const isMin = statsKey === 'minStats';
    const scored = (g) => isMin ? g.minScore : g.oppScore;
    const conceded = (g) => isMin ? g.oppScore : g.minScore;
    const won = (g) => scored(g) > conceded(g);
    const lost = (g) => scored(g) < conceded(g);

    const statsGames = games.filter(g => g[statsKey] !== null);

    return {
        wins:         games.filter(won).length,
        regLosses:    games.filter(g => lost(g) && g.lastPeriodType === 'REG').length,
        otLosses:     games.filter(g => lost(g) && g.lastPeriodType !== 'REG').length,
        otWins:       games.filter(g => won(g)  && g.lastPeriodType === 'OT').length,
        otGameLosses: games.filter(g => lost(g) && g.lastPeriodType === 'OT').length,
        soWins:       games.filter(g => won(g)  && g.lastPeriodType === 'SO').length,
        soLosses:     games.filter(g => lost(g) && g.lastPeriodType === 'SO').length,
        goalsFor:     games.reduce((s, g) => s + scored(g), 0),
        statsGamesCount: statsGames.length,
        sog:           sumStat(statsGames, statsKey, 'sog'),
        faceoffWins:   sumStat(statsGames, statsKey, 'faceoffWins'),
        faceoffTotal:  statsGames.reduce((s, g) => s + (g.faceoffTotal ?? 0), 0) || null,
        ppGoals:       sumStat(statsGames, statsKey, 'ppGoals'),
        ppOpportunities: sumStat(statsGames, statsKey, 'ppOpportunities'),
        pim:           sumStat(statsGames, statsKey, 'pim'),
        hits:          sumStat(statsGames, statsKey, 'hits'),
        blockedShots:  sumStat(statsGames, statsKey, 'blockedShots'),
        giveaways:     sumStat(statsGames, statsKey, 'giveaways'),
        takeaways:     sumStat(statsGames, statsKey, 'takeaways'),
    };
}

function aggregateGames(games) {
    if (!games.length) return null;
    return {
        gamesPlayed: games.length,
        min: aggregateSide(games, 'minStats'),
        opp: aggregateSide(games, 'oppStats'),
    };
}

function buildPayload(oppAbbrev, allGames) {
    const currentSeason  = getCurrentSeason();
    const lastSeason     = getLastSeason();
    const last5Seasons   = getLast5Seasons();

    const filter = (seasons) => allGames.filter(g => seasons.includes(g.season));

    return {
        oppAbbrev,
        lastUpdated: new Date().toISOString(),
        games: allGames,
        thisSeason:   aggregateGames(filter([currentSeason])),
        lastSeason:   aggregateGames(filter([lastSeason])),
        last5Seasons: aggregateGames(filter(last5Seasons)),
        allTime:      aggregateGames(allGames),
    };
}

// ─── R2 helpers ───────────────────────────────────────────────────────────────

function r2Key(oppAbbrev) {
    return `h2h/MIN-${oppAbbrev}.json`;
}

async function readFromR2(oppAbbrev) {
    try {
        const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: r2Key(oppAbbrev) });
        const res = await r2.send(cmd);
        const text = await res.Body.transformToString();
        return JSON.parse(text);
    } catch {
        return null; // Not found or first run
    }
}

async function writeToR2(oppAbbrev, payload) {
    const cmd = new PutObjectCommand({
        Bucket: BUCKET,
        Key: r2Key(oppAbbrev),
        Body: JSON.stringify(payload),
        ContentType: 'application/json',
    });
    await r2.send(cmd);
}

// ─── Concurrency helpers ──────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function batchProcess(items, fn, concurrency = 10, delayMs = 100) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
        if (i + concurrency < items.length) await sleep(delayMs);
    }
    return results;
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function main() {
    const isSeed       = process.argv.includes('--seed');
    const oppFilter    = process.argv.find(a => a.startsWith('--opponent='))?.split('=')[1]?.toUpperCase();
    const targetTeams  = oppFilter
        ? NHL_TEAMS.filter(t => t.abbrev === oppFilter)
        : NHL_TEAMS;
    const seasons      = isSeed ? getAllSeasons() : [getCurrentSeason()];

    console.log(`\n🏒 Wild H2H Data Pipeline`);
    console.log(`   Mode:     ${isSeed ? 'SEED (all seasons)' : 'INCREMENTAL (current season)'}`);
    console.log(`   Seasons:  ${seasons[0]} → ${seasons[seasons.length - 1]} (${seasons.length} total)`);
    console.log(`   Opponents: ${oppFilter ?? `all ${targetTeams.length}`}\n`);

    // 1. Fetch all needed season schedules
    console.log(`📅 Fetching ${seasons.length} season schedule(s)...`);
    const schedules = await batchProcess(seasons, async (season) => {
        try {
            const data = await fetchSchedule(season);
            return { season, games: data.games ?? [] };
        } catch (err) {
            console.warn(`   ⚠️  Failed to fetch schedule for ${season}: ${err.message}`);
            return { season, games: [] };
        }
    }, 3, 400);

    // 2. Extract all completed H2H games from schedules
    const allH2HGames = {}; // oppAbbrev → game[]
    for (const { games } of schedules) {
        for (const rawGame of games) {
            const game = parseGame(rawGame);
            if (!game) continue;
            if (!allH2HGames[game.oppAbbrev]) allH2HGames[game.oppAbbrev] = [];
            allH2HGames[game.oppAbbrev].push(game);
        }
    }

    // 3. Process each opponent
    for (const team of targetTeams) {
        const { abbrev, name } = team;
        const newGames = allH2HGames[abbrev] ?? [];

        if (!newGames.length) {
            console.log(`   ${abbrev.padEnd(4)} — no games found, skipping`);
            continue;
        }

        // Load existing data from R2 (incremental mode reuses already-fetched right-rail)
        let existingGames = [];
        if (!isSeed) {
            const existing = await readFromR2(abbrev);
            existingGames = existing?.games ?? [];
        }

        // Determine which games need right-rail data fetched:
        // - Games not yet in R2 (new games)
        // - Games already in R2 but with null stats (right-rail failed previously)
        const existingMap = new Map(existingGames.map(g => [g.gameId, g]));
        const gamesToEnrich = newGames.filter(g => {
            const existing = existingMap.get(g.gameId);
            return !existing || existing.minStats === null;
        });

        if (gamesToEnrich.length) {
            process.stdout.write(`   ${abbrev.padEnd(4)} — fetching right-rail for ${gamesToEnrich.length} game(s)...`);
            // Low concurrency + generous delay to avoid NHL API rate limiting
            await batchProcess(gamesToEnrich, enrichWithRightRail, 3, 800);
            process.stdout.write(' done\n');
        } else {
            console.log(`   ${abbrev.padEnd(4)} — ${name} (${newGames.length} games, all up to date)`);
        }

        // Merge: existing games as base, new (freshly enriched) games overwrite
        const mergedMap = new Map(existingMap);
        for (const g of newGames) mergedMap.set(g.gameId, g); // new overwrites (includes enriched stats)
        const mergedGames = [...mergedMap.values()].sort((a, b) => a.date.localeCompare(b.date));

        // Build and upload payload
        const payload = buildPayload(abbrev, mergedGames);
        await writeToR2(abbrev, payload);
    }

    console.log('\n✅ Done.\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
