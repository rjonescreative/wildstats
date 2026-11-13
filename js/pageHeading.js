// Each page has exactly one <h1> (#page-heading, visually hidden; the 404 view shows its own).
// Its text is the page title without the site suffix or SEO tail, e.g.
// "NHL Wildcard Standings 2026-27 | Minnesota Wild Playoff Race | Wild Hockey Hub" → "NHL Wildcard Standings 2026-27".
// Shared by the browser router and functions/[[route]].js so the served HTML has the same heading.
export function headingFromTitle(title) {
    return title.split(' | ')[0].split(' – ')[0].trim();
}

export function setPageHeading(text) {
    const heading = typeof document !== 'undefined' && document.getElementById('page-heading');
    if (heading) heading.textContent = text;
}
