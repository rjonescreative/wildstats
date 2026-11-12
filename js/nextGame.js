// "Are the Minnesota Wild playing tonight?" — the answer for search engines, built at the edge
// (functions/[[route]].js) from the Wild's schedule: the home page's meta description and
// SportsEvent structured data for the next game. Nothing here is shown on the page itself.
// Times are Central (the Wild's time zone), so the answer doesn't depend on where it's rendered.

const TZ = 'America/Chicago';
const DONE = new Set(['FINAL', 'OFF']);
const LIVE = new Set(['LIVE', 'CRIT']);

// Next regular season or playoff game that hasn't finished (a live game counts), or null
export function findNextGame(games = []) {
    return games
        .filter(g => (g.gameType === 2 || g.gameType === 3) && !DONE.has(g.gameState) && g.startTimeUTC)
        .sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC))[0] ?? null;
}

const teamName = team => `${team.placeName?.default ?? ''} ${team.commonName?.default ?? team.abbrev}`.trim();
const centralDate = d => d.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const centralTime = d => `${d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })} CT`;
const centralHour = d => Number(d.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }));

// Meta description answering the question, e.g.
// "Are the Minnesota Wild playing tonight? Yes – the Wild host the San Jose Sharks tonight at 7:00 PM CT. ..."
// The answer comes first; the tail is short so it fits Google's ~160-character snippet.
export function nextGameDescription(game, now = new Date()) {
    const isHome = game.homeTeam.abbrev === 'MIN';
    const opponent = teamName(isHome ? game.awayTeam : game.homeTeam);
    const start = new Date(game.startTimeUTC);
    const tail = ' Live scores, stats and standings.';
    const question = 'Are the Minnesota Wild playing tonight?';

    if (LIVE.has(game.gameState)) {
        return `${question} Yes – the Wild are playing the ${opponent} right now.${tail}`;
    }

    const today = centralDate(now);
    const gameDay = centralDate(start);
    const matchup = isHome ? `host the ${opponent}` : `visit the ${opponent}`;
    if (gameDay === today) {
        const when = centralHour(start) >= 17 ? 'tonight' : 'today';
        return `${question} Yes – the Wild ${matchup} ${when} at ${centralTime(start)}.${tail}`;
    }

    const tomorrow = centralDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    const day = gameDay === tomorrow
        ? 'tomorrow'
        : start.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' });
    return `${question} No – the Wild's next game is ${day} at ${centralTime(start)}, when they ${matchup}.${tail}`;
}

// Home arena city for each team, for the event's location address
const ARENA_CITY = {
    ANA: ['Anaheim', 'CA', 'US'], BOS: ['Boston', 'MA', 'US'], BUF: ['Buffalo', 'NY', 'US'],
    CGY: ['Calgary', 'AB', 'CA'], CAR: ['Raleigh', 'NC', 'US'], CHI: ['Chicago', 'IL', 'US'],
    COL: ['Denver', 'CO', 'US'], CBJ: ['Columbus', 'OH', 'US'], DAL: ['Dallas', 'TX', 'US'],
    DET: ['Detroit', 'MI', 'US'], EDM: ['Edmonton', 'AB', 'CA'], FLA: ['Sunrise', 'FL', 'US'],
    LAK: ['Los Angeles', 'CA', 'US'], MIN: ['Saint Paul', 'MN', 'US'], MTL: ['Montreal', 'QC', 'CA'],
    NSH: ['Nashville', 'TN', 'US'], NJD: ['Newark', 'NJ', 'US'], NYI: ['Elmont', 'NY', 'US'],
    NYR: ['New York', 'NY', 'US'], OTT: ['Ottawa', 'ON', 'CA'], PHI: ['Philadelphia', 'PA', 'US'],
    PIT: ['Pittsburgh', 'PA', 'US'], SJS: ['San Jose', 'CA', 'US'], SEA: ['Seattle', 'WA', 'US'],
    STL: ['St. Louis', 'MO', 'US'], TBL: ['Tampa', 'FL', 'US'], TOR: ['Toronto', 'ON', 'CA'],
    UTA: ['Salt Lake City', 'UT', 'US'], VAN: ['Vancouver', 'BC', 'CA'], VGK: ['Las Vegas', 'NV', 'US'],
    WSH: ['Washington', 'DC', 'US'], WPG: ['Winnipeg', 'MB', 'CA'],
};

const GAME_LENGTH_MS = 3 * 60 * 60 * 1000; // Typical NHL game with intermissions, for endDate

// schema.org SportsEvent for the game (as a JSON string for a ld+json script)
export function nextGameJsonLd(game, description) {
    const team = t => ({ '@type': 'SportsTeam', name: teamName(t) });
    const home = team(game.homeTeam);
    const away = team(game.awayTeam);
    const location = { '@type': 'Place', name: game.venue?.default ?? `${home.name} home arena` };
    const city = !game.neutralSite && ARENA_CITY[game.homeTeam.abbrev];
    if (city) {
        const [addressLocality, addressRegion, addressCountry] = city;
        location.address = { '@type': 'PostalAddress', addressLocality, addressRegion, addressCountry };
    }
    const endDate = new Date(new Date(game.startTimeUTC).getTime() + GAME_LENGTH_MS)
        .toISOString().replace(/\.\d{3}Z$/, 'Z');
    const event = {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: `${away.name} at ${home.name}`,
        description,
        sport: 'Ice Hockey',
        startDate: game.startTimeUTC,
        endDate,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location,
        image: ['https://wildhockey.win/apple-touch-icon.png'],
        organizer: { '@type': 'SportsOrganization', name: 'National Hockey League', url: 'https://www.nhl.com/' },
        homeTeam: home,
        awayTeam: away,
        competitor: [home, away],
        performer: [home, away],
        url: 'https://wildhockey.win/',
    };
    if (game.ticketsLink) {
        event.offers = { '@type': 'Offer', url: game.ticketsLink };
    }
    return JSON.stringify(event).replace(/</g, '\\u003c');
}
