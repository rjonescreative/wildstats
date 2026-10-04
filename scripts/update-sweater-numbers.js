#!/usr/bin/env node
/**
 * Sweater Numbers Data Pipeline
 *
 * Reads the box score for every completed Wild game (regular season and playoffs)
 * and counts how many games each player wore each sweater number. A game counts only when
 * the player's official NHL game log credits it, so totals match official games played
 * (a dressed backup goalie who never entered the game does not count).
 * Results are stored in Cloudflare R2.
 *
 * Usage:
 *   node scripts/update-sweater-numbers.js           # incremental: new games in the current season
 *   node scripts/update-sweater-numbers.js --seed    # full seed: every season from scratch
 */

import 'dotenv/config';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// ─── Config ──────────────────────────────────────────────────────────────────

const TEAM = 'MIN';
const NHL_API = 'https://api-web.nhle.com/v1';
const R2_KEY = 'numbers/sweater-numbers.json';
const FIRST_SEASON_YEAR = 2000;

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
    const seasons = [];
    for (let y = FIRST_SEASON_YEAR; y <= getCurrentSeasonStartYear(); y++) {
        if (y === 2004) continue; // 2004-05 lockout — no games played
        seasons.push(`${y}${y + 1}`);
    }
    return seasons;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 8) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);
            if (res.status === 429) {
                const wait = 15000 * attempt;
                console.warn(`   ⚠️  Rate limited (429), waiting ${wait / 1000}s before retry ${attempt}/${retries}...`);
                await sleep(wait);
                continue;
            }
            if (!res.ok) {
                lastErr = new Error(`HTTP ${res.status}`);
                if (attempt < retries) await sleep(2000 * attempt);
                continue;
            }
            return await res.json();
        } catch (err) {
            lastErr = err;
            if (attempt < retries) await sleep(2000 * attempt);
        }
    }
    throw lastErr ?? new Error(`Failed after ${retries} retries: ${url}`);
}

// ─── R2 ───────────────────────────────────────────────────────────────────────

async function readFromR2() {
    try {
        const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: R2_KEY }));
        return JSON.parse(await obj.Body.transformToString());
    } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
        throw err;
    }
}

async function writeToR2(payload) {
    await r2.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: R2_KEY,
        Body: JSON.stringify(payload),
        ContentType: 'application/json',
    }));
}

// ─── Box score processing ─────────────────────────────────────────────────────

// Official game logs decide who played: box scores list every dressed player, and a
// "00:00 / 0 shifts" line can be either credited or not, so the NHL's per-player game
// log is the source of truth. Logs are cached per player, season, and game type.
const gameLogCache = new Map();

async function officialGameIds(playerId, season, gameType) {
    const key = `${playerId}|${season}|${gameType}`;
    if (!gameLogCache.has(key)) {
        let ids = null;
        try {
            const log = await fetchWithRetry(`${NHL_API}/player/${playerId}/game-log/${season}/${gameType}`);
            ids = new Set((log.gameLog ?? []).filter(g => g.teamAbbrev === TEAM).map(g => g.gameId));
        } catch {
            // Log unavailable — fall back to ice time below
        }
        gameLogCache.set(key, ids);
        await sleep(100);
    }
    return gameLogCache.get(key);
}

// Fallback when the game isn't in the log (e.g. the log hasn't caught up to last night's game):
// count only real ice time, which rules out a dressed backup goalie
function hadIceTime(p) {
    return Boolean(p.toi) && p.toi !== '00:00';
}

/**
 * Adds one box score to the running totals.
 *   numbers[number][playerId] = { regular, playoffs, firstSeason, lastSeason,
 *                                 seasons: { [season]: { regular, playoffs } } }
 * The per-season counts let the page split a player's time into separate stints.
 */
async function countGame(boxscore, gameId, season, isPlayoffs, numbers, seenPlayers) {
    const side = boxscore.homeTeam?.abbrev === TEAM ? 'homeTeam' : 'awayTeam';
    const team = boxscore.playerByGameStats?.[side];
    if (!team) return 0;

    const players = [...(team.forwards ?? []), ...(team.defense ?? []), ...(team.goalies ?? [])];
    let counted = 0;
    for (const p of players) {
        if (p.sweaterNumber == null) continue;
        const logIds = await officialGameIds(p.playerId, season, isPlayoffs ? 3 : 2);
        if (!logIds?.has(gameId) && !hadIceTime(p)) continue;
        const num = String(p.sweaterNumber);
        const entry = ((numbers[num] ??= {})[p.playerId] ??= { regular: 0, playoffs: 0, firstSeason: season, lastSeason: season });
        const seasonEntry = ((entry.seasons ??= {})[season] ??= { regular: 0, playoffs: 0 });
        if (isPlayoffs) {
            entry.playoffs++;
            seasonEntry.playoffs++;
        } else {
            entry.regular++;
            seasonEntry.regular++;
        }
        if (season < entry.firstSeason) entry.firstSeason = season;
        if (season > entry.lastSeason) entry.lastSeason = season;
        seenPlayers.set(p.playerId, { season, position: p.position });
        counted++;
    }
    return counted;
}

// ─── Player names ─────────────────────────────────────────────────────────────

/**
 * Box scores only have abbreviated names ("M. Gaborik"), so look up full names and
 * headshots: first from that season's Wild roster, then the player's landing page.
 */
async function resolvePlayers(seenPlayers, players) {
    const rosterCache = new Map();
    let resolved = 0;

    for (const [playerId, { season, position }] of seenPlayers) {
        if (players[playerId]?.name) continue;

        if (!rosterCache.has(season)) {
            try {
                const roster = await fetchWithRetry(`${NHL_API}/roster/${TEAM}/${season}`);
                const list = [...(roster.forwards ?? []), ...(roster.defensemen ?? []), ...(roster.goalies ?? [])];
                rosterCache.set(season, new Map(list.map(r => [r.id, r])));
            } catch {
                rosterCache.set(season, new Map());
            }
            await sleep(150);
        }

        let first = '', last = '', headshot = null, pos = position;
        const fromRoster = rosterCache.get(season).get(playerId);
        if (fromRoster) {
            first = fromRoster.firstName?.default ?? '';
            last = fromRoster.lastName?.default ?? '';
            headshot = fromRoster.headshot ?? null;
            pos = fromRoster.positionCode ?? pos;
        } else {
            try {
                const landing = await fetchWithRetry(`${NHL_API}/player/${playerId}/landing`);
                first = landing.firstName?.default ?? '';
                last = landing.lastName?.default ?? '';
                headshot = landing.headshot ?? null;
                pos = landing.position ?? pos;
            } catch {
                // Leave unnamed; the page falls back to "Unknown player"
            }
            await sleep(150);
        }

        players[playerId] = { name: `${first} ${last}`.trim(), headshot, position: pos ?? null };
        resolved++;
    }
    return resolved;
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function main() {
    const isSeed = process.argv.includes('--seed');
    console.log(`\n🏒 Wild Sweater Numbers Pipeline`);
    console.log(`   Mode: ${isSeed ? 'SEED (all seasons)' : 'INCREMENTAL (current season)'}\n`);

    let existing = null;
    if (!isSeed) {
        console.log('📦 Loading existing data from R2...');
        existing = await readFromR2();
        if (!existing) console.log('   No existing data found — falling back to full seed.\n');
    }
    const fullRun = isSeed || !existing;

    const numbers = fullRun ? {} : existing.numbers ?? {};
    const players = fullRun ? {} : existing.players ?? {};
    const processed = new Set(fullRun ? [] : existing.processedGameIds ?? []);
    const seenPlayers = new Map();

    const seasons = fullRun ? getAllSeasons() : [getCurrentSeason()];
    console.log(`📅 Checking ${seasons.length} season(s): ${seasons[0]} → ${seasons[seasons.length - 1]}`);

    let gamesAdded = 0;
    let failed = 0;
    for (const season of seasons) {
        let schedule;
        try {
            schedule = await fetchWithRetry(`${NHL_API}/club-schedule-season/${TEAM}/${season}`);
        } catch (err) {
            console.warn(`   ⚠️  ${season} schedule failed: ${err.message}`);
            failed++;
            continue;
        }

        const games = (schedule.games ?? []).filter(g =>
            (g.gameType === 2 || g.gameType === 3) &&
            (g.gameState === 'OFF' || g.gameState === 'FINAL') &&
            !processed.has(g.id)
        );

        let seasonCount = 0;
        for (const game of games) {
            try {
                const boxscore = await fetchWithRetry(`${NHL_API}/gamecenter/${game.id}/boxscore`);
                await countGame(boxscore, game.id, season, game.gameType === 3, numbers, seenPlayers);
                processed.add(game.id);
                seasonCount++;
                gamesAdded++;
            } catch (err) {
                console.warn(`   ⚠️  Game ${game.id} failed: ${err.message} (will retry next run)`);
                failed++;
            }
            await sleep(120);
        }
        console.log(`   ✓ ${season}: ${seasonCount} new game(s)`);
    }

    console.log(`\n👤 Resolving player names...`);
    const resolved = await resolvePlayers(seenPlayers, players);
    console.log(`   ✓ ${resolved} new player(s)`);

    const payload = {
        lastUpdated: new Date().toISOString(),
        processedGameIds: [...processed],
        players,
        numbers,
    };

    console.log(`\n   ${gamesAdded} game(s) added, ${failed} failure(s), ${Object.keys(numbers).length} numbers worn, ${Object.keys(players).length} players`);
    console.log('\n💾 Writing to R2...');
    await writeToR2(payload);
    console.log('✅ Done.\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
