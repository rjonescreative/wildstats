// Google Analytics tracking module for SPA

const GA_MEASUREMENT_ID = 'G-D1L5853ET7';

// Check if gtag is available
function isGtagAvailable() {
    return typeof gtag === 'function';
}

// Track page view (for SPA navigation)
export function trackPageView(path, title) {
    if (!isGtagAvailable()) return;

    gtag('config', GA_MEASUREMENT_ID, {
        page_path: path,
        page_title: title || document.title
    });
}

// Track custom events
export function trackEvent(eventName, params = {}) {
    if (!isGtagAvailable()) return;

    gtag('event', eventName, params);
}

// Track navigation between views
export function trackNavigation(fromView, toView) {
    trackEvent('navigation', {
        event_category: 'engagement',
        event_label: `${fromView} -> ${toView}`,
        from_view: fromView,
        to_view: toView
    });
}

// Track external link clicks
export function trackOutboundLink(url, linkText) {
    trackEvent('click', {
        event_category: 'outbound',
        event_label: linkText || url,
        link_url: url,
        transport_type: 'beacon'
    });
}

// Track standings view changes
export function trackStandingsView(viewType) {
    trackEvent('standings_view_change', {
        event_category: 'engagement',
        event_label: viewType,
        standings_type: viewType
    });
}

// Track player card interactions
export function trackPlayerCardView(playerName) {
    trackEvent('player_card_view', {
        event_category: 'engagement',
        event_label: playerName,
        player_name: playerName
    });
}

// Track easter egg usage
export function trackEasterEgg(type) {
    trackEvent('easter_egg', {
        event_category: 'engagement',
        event_label: type,
        easter_egg_type: type
    });
}

// Track news article clicks
export function trackNewsClick(headline) {
    trackEvent('news_click', {
        event_category: 'engagement',
        event_label: headline
    });
}

// Track table sorting
export function trackTableSort(table, column) {
    trackEvent('table_sort', {
        event_category: 'engagement',
        event_label: `${table}: ${column}`,
        table_name: table,
        sort_column: column
    });
}

// Initialize analytics - set up outbound link tracking
export function init() {
    // Track all external link clicks
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href^="http"]');
        if (link && !link.href.includes(window.location.hostname)) {
            trackOutboundLink(link.href, link.textContent?.trim());
        }
    });
}
