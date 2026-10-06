// Jersey Stats: number trivia for the bottom of the Jersey Numbers page.
// Shared by the page script and the Cloudflare route function (pre-rendered copy for search engines).
// Takes [{ number, wearers: [{ name, games, firstSeason }] }], games including playoffs.

const ALL_NUMBERS = Array.from({ length: 99 }, (_, i) => i + 1);

// Revolving door only counts numbers with at least this many wearers
const REVOLVING_DOOR_MIN_WEARERS = 4;

// Top `count` rows by value (lowest first when `ascending`), keeping everyone tied with
// the last spot; ranks show ties as "T2"
function topWithTies(rows, count, ascending = false) {
    const order = ascending ? 1 : -1;
    const sorted = [...rows].sort((a, b) => order * (a.value - b.value) || a.number - b.number);
    const cutoff = sorted[count - 1]?.value;
    return sorted
        .filter((row, i) => i < count || row.value === cutoff)
        .map(row => {
            const rank = sorted.findIndex(r => r.value === row.value) + 1;
            const tied = sorted.filter(r => r.value === row.value).length > 1;
            return { ...row, rank: tied ? `T${rank}` : `${rank}` };
        });
}

export function buildJerseyStats(list) {
    const totalGames = n => n.wearers.reduce((sum, w) => sum + w.games, 0);

    return {
        neverWorn: ALL_NUMBERS.filter(n => !list.some(item => item.number === n)),

        mostPlayers: topWithTies(list.map(n => ({ number: n.number, value: n.wearers.length })), 5),

        mostGames: topWithTies(list.map(n => ({ number: n.number, value: totalGames(n) })), 5),

        mostBySinglePlayer: topWithTies(
            list.flatMap(n => n.wearers.map(w => ({ number: n.number, name: w.name, value: w.games }))), 5),

        // Fewest games per wearer: the numbers nobody keeps for long
        revolvingDoor: topWithTies(
            list.filter(n => n.wearers.length >= REVOLVING_DOOR_MIN_WEARERS)
                .map(n => ({ number: n.number, players: n.wearers.length, value: totalGames(n) / n.wearers.length })),
            5, true),

        // Players who wore a number for exactly one game, most recent first
        oneAndDone: list
            .flatMap(n => n.wearers.filter(w => w.games === 1).map(w => ({ number: n.number, name: w.name, season: w.firstSeason })))
            .sort((a, b) => b.season.localeCompare(a.season) || a.number - b.number),
    };
}

export const REVOLVING_DOOR_NOTE = `Fewest games per player, numbers with ${REVOLVING_DOOR_MIN_WEARERS}+ players`;
