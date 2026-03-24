// All NHL teams except Minnesota Wild, sorted alphabetically by full name
export const NHL_TEAMS = [
    { abbrev: 'ANA', name: 'Anaheim Ducks',         slug: 'anaheim' },
    { abbrev: 'BOS', name: 'Boston Bruins',          slug: 'boston' },
    { abbrev: 'BUF', name: 'Buffalo Sabres',         slug: 'buffalo' },
    { abbrev: 'CGY', name: 'Calgary Flames',         slug: 'calgary' },
    { abbrev: 'CAR', name: 'Carolina Hurricanes',    slug: 'carolina' },
    { abbrev: 'CHI', name: 'Chicago Blackhawks',     slug: 'chicago' },
    { abbrev: 'COL', name: 'Colorado Avalanche',     slug: 'colorado' },
    { abbrev: 'CBJ', name: 'Columbus Blue Jackets',  slug: 'columbus' },
    { abbrev: 'DAL', name: 'Dallas Stars',           slug: 'dallas' },
    { abbrev: 'DET', name: 'Detroit Red Wings',      slug: 'detroit' },
    { abbrev: 'EDM', name: 'Edmonton Oilers',        slug: 'edmonton' },
    { abbrev: 'FLA', name: 'Florida Panthers',       slug: 'florida' },
    { abbrev: 'LAK', name: 'Los Angeles Kings',      slug: 'los-angeles' },
    { abbrev: 'MTL', name: 'Montréal Canadiens',     slug: 'montreal' },
    { abbrev: 'NSH', name: 'Nashville Predators',    slug: 'nashville' },
    { abbrev: 'NJD', name: 'New Jersey Devils',      slug: 'new-jersey' },
    { abbrev: 'NYI', name: 'New York Islanders',     slug: 'ny-islanders' },
    { abbrev: 'NYR', name: 'New York Rangers',       slug: 'ny-rangers' },
    { abbrev: 'OTT', name: 'Ottawa Senators',        slug: 'ottawa' },
    { abbrev: 'PHI', name: 'Philadelphia Flyers',    slug: 'philadelphia' },
    { abbrev: 'PIT', name: 'Pittsburgh Penguins',    slug: 'pittsburgh' },
    { abbrev: 'SJS', name: 'San Jose Sharks',        slug: 'san-jose' },
    { abbrev: 'SEA', name: 'Seattle Kraken',         slug: 'seattle' },
    { abbrev: 'STL', name: 'St. Louis Blues',        slug: 'st-louis' },
    { abbrev: 'TBL', name: 'Tampa Bay Lightning',    slug: 'tampa-bay' },
    { abbrev: 'TOR', name: 'Toronto Maple Leafs',    slug: 'toronto' },
    { abbrev: 'UTA', name: 'Utah Hockey Club',       slug: 'utah' },
    { abbrev: 'VAN', name: 'Vancouver Canucks',      slug: 'vancouver' },
    { abbrev: 'VGK', name: 'Vegas Golden Knights',   slug: 'vegas' },
    { abbrev: 'WSH', name: 'Washington Capitals',    slug: 'washington' },
    { abbrev: 'WPG', name: 'Winnipeg Jets',          slug: 'winnipeg' },
];

export function teamBySlug(slug) {
    return NHL_TEAMS.find(t => t.slug === slug) || NHL_TEAMS[0];
}
