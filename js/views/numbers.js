// Numbers view — every jersey number worn by a Wild player, who wore it, and for how many games
import { getSweaterNumbers, getWildStats } from '../api.js';
import { buildJerseyStats, REVOLVING_DOOR_NOTE } from '../jerseyStats.js';

const VISIBLE_WEARERS = 5;   // wearers shown before "Show all"
const MAX_NUMBER_WIDTH = 58; // widest a number may be on the jersey (SVG units of the 100×100 graphic)

// Numbers the Wild have retired, keyed by number → honoree
const RETIRED_NUMBERS = new Map([
    [9, 'Mikko Koivu'],
]);

function formatSeason(s) {
    return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
}

function seasonSpan(first, last) {
    return first === last ? formatSeason(first) : `${formatSeason(first)} – ${formatSeason(last)}`;
}

// Next season ID after `season`, skipping the 2004-05 lockout (no games were played)
function nextSeason(season) {
    let start = Number(season.slice(0, 4)) + 1;
    if (start === 2004) start = 2005;
    return `${start}${start + 1}`;
}

// Group a player's seasons with a number into stints of consecutive seasons.
// Falls back to a single first–last stint when per-season counts are missing or incomplete
// (e.g. data written before they existed, then topped up with only newer games).
function buildStints(s) {
    const perSeason = Object.values(s.seasons ?? {});
    const complete = perSeason.length > 0 &&
        perSeason.reduce((n, x) => n + x.regular, 0) === s.regular &&
        perSeason.reduce((n, x) => n + x.playoffs, 0) === s.playoffs;
    if (!complete) {
        return [{ firstSeason: s.firstSeason, lastSeason: s.lastSeason, regular: s.regular, playoffs: s.playoffs }];
    }
    const stints = [];
    for (const season of Object.keys(s.seasons).sort()) {
        const { regular, playoffs } = s.seasons[season];
        const current = stints[stints.length - 1];
        if (current && nextSeason(current.lastSeason) === season) {
            current.lastSeason = season;
            current.regular += regular;
            current.playoffs += playoffs;
        } else {
            stints.push({ firstSeason: season, lastSeason: season, regular, playoffs });
        }
    }
    return stints;
}

// Jersey graphic with the number centered on the back (wheat fill, red outline)
function renderJersey(number) {
    return `
        <div class="number-jersey" role="img" aria-label="Number ${number}">
            <img src="/images/jersey-back.png" alt="" class="number-jersey-img">
            <svg class="number-jersey-num" viewBox="0 0 100 100" aria-hidden="true">
                <text x="50" y="60" text-anchor="middle">${number}</text>
            </svg>
        </div>`;
}

// One line per stint: season span on the left, games in that stint on the right.
// With a single stint the total GP above already covers it, so only a playoff split is shown.
function renderStint(stint, multiple) {
    let split = '';
    if (stint.playoffs > 0) split = `${stint.regular} + ${stint.playoffs} playoffs`;
    else if (multiple) split = `${stint.regular} GP`;
    return `
                <div class="number-wearer-stint">
                    <span class="number-wearer-seasons">${seasonSpan(stint.firstSeason, stint.lastSeason)}</span>
                    ${split ? `<span class="number-wearer-split">${split}</span>` : ''}
                </div>`;
}

function renderWearer(w, currentSet) {
    const isCurrent = currentSet.has(Number(w.playerId));
    const attrs = isCurrent
        ? `class="number-wearer number-wearer--current player-hoverable" data-player-id="${w.playerId}" tabindex="0" role="button" aria-label="View ${w.name} stats"`
        : 'class="number-wearer"';

    return `
        <li ${attrs}>
            <div class="number-wearer-main">
                <span class="number-wearer-name">${w.name}</span>
                <span class="number-wearer-gp">${w.games}<span class="number-wearer-gp-label"> GP</span></span>
            </div>
            ${w.stints.map(stint => renderStint(stint, w.stints.length > 1)).join('')}
        </li>`;
}

function renderNumberCard({ number, wearers }, currentSet) {
    const hiddenCount = wearers.length - VISIBLE_WEARERS;
    const rows = wearers.map((w, i) => {
        const row = renderWearer(w, currentSet);
        return i < VISIBLE_WEARERS ? row : row.replace('<li ', '<li hidden data-extra ');
    }).join('');

    const totalGames = wearers.reduce((sum, w) => sum + w.games, 0);
    const retiredFor = RETIRED_NUMBERS.get(number);
    const retiredBadge = retiredFor
        ? `<span class="number-retired" title="Retired in honor of ${retiredFor}">Retired</span>`
        : '';

    return `
        <article class="number-card${retiredFor ? ' number-card--retired' : ''}" id="number-${number}">
            ${renderJersey(number)}
            <div class="number-wearers">
                <div class="number-wearers-count">${wearers.length} ${wearers.length === 1 ? 'player' : 'players'} · ${totalGames.toLocaleString()} ${totalGames === 1 ? 'game' : 'games'}${retiredBadge}</div>
                <ol class="number-wearer-list">${rows}</ol>
                ${hiddenCount > 0 ? `<button class="number-show-all text-link" data-toggle-number="${number}" aria-expanded="false">Show all ${wearers.length}</button>` : ''}
            </div>
        </article>`;
}

// Flatten the API payload into [{ number, wearers: [...] }] sorted by number, wearers by games
function buildNumberList(data) {
    return Object.entries(data.numbers ?? {})
        .map(([number, byPlayer]) => ({
            number: Number(number),
            wearers: Object.entries(byPlayer)
                .map(([playerId, s]) => ({
                    playerId,
                    name: data.players?.[playerId]?.name || 'Unknown player',
                    regular: s.regular,
                    playoffs: s.playoffs,
                    games: s.regular + s.playoffs,
                    firstSeason: s.firstSeason,
                    lastSeason: s.lastSeason,
                    stints: buildStints(s),
                }))
                .sort((a, b) => b.games - a.games || b.lastSeason.localeCompare(a.lastSeason)),
        }))
        .sort((a, b) => a.number - b.number);
}

// ─── Jersey Stats ────────────────────────────────────────────────────────────

const numberLink = number => `<a href="#number-${number}" class="jersey-stat-number text-link" data-jump-number="${number}">#${number}</a>`;

// One ranked list card. `value` formats a row's stat; rows past `visible` sit behind "Show all"
function renderStatCard(title, rows, { note = '', value, rank = true, visible = Infinity }) {
    const items = rows.map((r, i) => `
                <li class="jersey-stat-row${rank ? '' : ' jersey-stat-row--unranked'}"${i >= visible ? ' hidden data-extra' : ''}>
                    ${rank ? `<span class="jersey-stat-rank">${r.rank}</span>` : ''}
                    ${numberLink(r.number)}
                    <span class="jersey-stat-name">${r.name ?? ''}</span>
                    <span class="jersey-stat-value">${value(r)}</span>
                </li>`).join('');
    const showAll = rows.length > visible
        ? `<button class="number-show-all text-link" data-toggle-stat aria-expanded="false">Show all ${rows.length}</button>`
        : '';
    return `
        <article class="jersey-stat-card">
            <h3 class="jersey-stat-title">${title}</h3>
            ${note ? `<p class="jersey-stat-note">${note}</p>` : ''}
            <ol class="jersey-stat-list">${items}</ol>
            ${showAll}
        </article>`;
}

const stat = (amount, unit) => `${amount}<span class="jersey-stat-unit"> ${unit}</span>`;

function renderJerseyStats(list) {
    const stats = buildJerseyStats(list);
    return `
        <section class="jersey-stats">
            <h2 class="numbers-section-title">Jersey Stats</h2>
            <div class="jersey-stats-grid">
                <article class="jersey-stat-card">
                    <h3 class="jersey-stat-title">Never Worn</h3>
                    <p class="jersey-stat-note">${stats.neverWorn.length} numbers no Wild player has worn</p>
                    <ul class="jersey-never-worn">${stats.neverWorn.map(n => `<li>${n}</li>`).join('')}</ul>
                </article>
                ${renderStatCard('Most Worn – Players', stats.mostPlayers, { value: r => stat(r.value, 'players') })}
                ${renderStatCard('Most Worn – Games', stats.mostGames, { value: r => stat(r.value.toLocaleString(), 'GP') })}
                ${renderStatCard('Most Games by One Player', stats.mostBySinglePlayer, { value: r => stat(r.value.toLocaleString(), 'GP') })}
                ${renderStatCard('Revolving Door', stats.revolvingDoor.map(r => ({ ...r, name: `${r.players} players` })), {
                    note: REVOLVING_DOOR_NOTE,
                    value: r => stat(r.value.toFixed(1), 'GP each'),
                })}
                ${renderStatCard('One and Done', stats.oneAndDone, {
                    note: `${stats.oneAndDone.length} players wore a number for a single game`,
                    value: r => `<span class="jersey-stat-unit">${formatSeason(r.season)}</span>`,
                    rank: false,
                    visible: VISIBLE_WEARERS,
                })}
            </div>
        </section>`;
}

// Squeeze any number wider than the jersey back once the jersey font has loaded
async function fitJerseyNumbers(container) {
    await document.fonts.ready;
    container.querySelectorAll('.number-jersey-num text').forEach(text => {
        if (text.getComputedTextLength() > MAX_NUMBER_WIDTH) {
            text.setAttribute('textLength', MAX_NUMBER_WIDTH);
            text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
    });
}

export async function init() {
    const container = document.getElementById('stats-numbers-view');
    container.innerHTML = '<div class="loading">Loading jersey numbers...</div>';

    try {
        const [data, wildStats] = await Promise.all([getSweaterNumbers(), getWildStats()]);
        const currentSet = new Set([
            ...(wildStats.skaters || []).map(p => p.playerId),
            ...(wildStats.goalies || []).map(p => p.playerId),
        ]);
        const list = buildNumberList(data);
        const totalWearers = new Set(list.flatMap(n => n.wearers.map(w => w.playerId))).size;

        container.innerHTML = `
            <div class="numbers-header">
                <h2 class="numbers-section-title">Jersey Numbers</h2>
                <p class="numbers-intro">${list.length} numbers worn by ${totalWearers} players since 2000-01. Games played include the regular season and playoffs.</p>
            </div>
            <div class="numbers-grid">
                ${list.map(n => renderNumberCard(n, currentSet)).join('')}
            </div>
            ${renderJerseyStats(list)}`;

        container.querySelectorAll('[data-toggle-stat]').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.jersey-stat-card');
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                card.querySelectorAll('[data-extra]').forEach(li => { li.hidden = expanded; });
                btn.setAttribute('aria-expanded', String(!expanded));
                btn.textContent = expanded ? `Show all ${card.querySelectorAll('.jersey-stat-row').length}` : 'Show fewer';
            });
        });

        // Jersey Stats numbers scroll to that number's card (without changing the URL)
        container.querySelectorAll('[data-jump-number]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                document.getElementById(`number-${link.dataset.jumpNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });

        container.querySelectorAll('[data-toggle-number]').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.number-card');
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                card.querySelectorAll('[data-extra]').forEach(li => { li.hidden = expanded; });
                btn.setAttribute('aria-expanded', String(!expanded));
                btn.textContent = expanded ? `Show all ${card.querySelectorAll('.number-wearer').length}` : 'Show fewer';
            });
        });

        fitJerseyNumbers(container);
    } catch (err) {
        console.error('Error loading sweater numbers:', err);
        container.innerHTML = '<div class="loading">Error loading jersey numbers.</div>';
    }
}
