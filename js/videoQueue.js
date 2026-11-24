// The videos a viewer can step through from the player's end screen: every video card visible on
// the page the clicked card is on, in page order (not any feed's order). Cards hidden behind
// "Show all", or in a closed Game-by-Game game, aren't visible and are skipped.

const CARD_SELECTOR = '.video-card, .highlight-card';

const isVisible = el => el.getClientRects().length > 0;

export function cardVideo(card) {
    const { brightcoveId, accountId, slug, title } = card.dataset;
    return {
        brightcoveId,
        accountId,
        slug,
        title,
        thumbnail: card.querySelector('img')?.src || '',
    };
}

/** [{ brightcoveId, accountId, slug, title, thumbnail }] for the visible cards around `card` */
export function videoQueueFrom(card) {
    const root = card.closest('.view') || document;
    return [...root.querySelectorAll(CARD_SELECTOR)]
        .filter(el => el.dataset.brightcoveId && isVisible(el))
        .map(cardVideo);
}
