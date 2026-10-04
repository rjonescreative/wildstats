// Numbers view — every sweater number worn by a Wild player, who wore it, and for how many games
import { getSweaterNumbers, getWildStats } from '../api.js';

const VISIBLE_WEARERS = 5;   // wearers shown before "Show all"
const MAX_NUMBER_WIDTH = 58; // widest a number may be on the jersey (SVG units of the 100×100 graphic)

function formatSeason(s) {
    return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
}

function seasonSpan(first, last) {
    return first === last ? formatSeason(first) : `${formatSeason(first)} – ${formatSeason(last)}`;
}

// Jersey graphic with the number centered on the back (wheat fill, red outline)
function renderJersey(number) {
    return `
        <div class="number-jersey" role="img" aria-label="Number ${number}">
            <img src="/images/jersey-back.png" alt="" class="number-jersey-img">
            <svg class="number-jersey-num" viewBox="0 0 100 100" aria-hidden="true">
                <text x="50" y="67" text-anchor="middle">${number}</text>
            </svg>
        </div>`;
}

function renderWearer(w, currentSet) {
    const isCurrent = currentSet.has(Number(w.playerId));
    const playoffNote = w.playoffs > 0
        ? `<span class="number-wearer-split">${w.regular} + ${w.playoffs} playoffs</span>`
        : '';
    const attrs = isCurrent
        ? `class="number-wearer number-wearer--current player-hoverable" data-player-id="${w.playerId}" tabindex="0" role="button" aria-label="View ${w.name} stats"`
        : 'class="number-wearer"';

    return `
        <li ${attrs}>
            <div class="number-wearer-info">
                <span class="number-wearer-name">${w.name}</span>
                <span class="number-wearer-seasons">${seasonSpan(w.firstSeason, w.lastSeason)}</span>
            </div>
            <div class="number-wearer-games">
                <span class="number-wearer-gp">${w.games}<span class="number-wearer-gp-label"> GP</span></span>
                ${playoffNote}
            </div>
        </li>`;
}

function renderNumberCard({ number, wearers }, currentSet) {
    const hiddenCount = wearers.length - VISIBLE_WEARERS;
    const rows = wearers.map((w, i) => {
        const row = renderWearer(w, currentSet);
        return i < VISIBLE_WEARERS ? row : row.replace('<li ', '<li hidden data-extra ');
    }).join('');

    return `
        <article class="number-card" id="number-${number}">
            ${renderJersey(number)}
            <div class="number-wearers">
                <div class="number-wearers-count">${wearers.length} ${wearers.length === 1 ? 'player' : 'players'}</div>
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
                }))
                .sort((a, b) => b.games - a.games || b.lastSeason.localeCompare(a.lastSeason)),
        }))
        .sort((a, b) => a.number - b.number);
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
    container.innerHTML = '<div class="loading">Loading sweater numbers...</div>';

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
                <h2>Sweater Numbers</h2>
                <p class="numbers-intro">${list.length} numbers worn by ${totalWearers} players since 2000-01. Games played include the regular season and playoffs.</p>
            </div>
            <div class="numbers-grid">
                ${list.map(n => renderNumberCard(n, currentSet)).join('')}
            </div>`;

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
        container.innerHTML = '<div class="loading">Error loading sweater numbers.</div>';
    }
}
