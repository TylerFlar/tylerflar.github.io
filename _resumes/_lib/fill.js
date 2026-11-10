"use strict";

/**
 * A page's fill in words, for the build's output: the room left on a
 * document's last page, or how far it runs past its page limit, counted in
 * lines of its text (a resume's bullets print \small, a letter's paragraphs at
 * body size). The fill itself comes from pdflatex.js. A count is approximate,
 * since a heading or the space between entries is taller than a line.
 */

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * "1 page, about 3 lines free", or "2 pages, about 30 lines free on the last".
 * Just the page count when the fill isn't known.
 */
function fillNote(pages, fill, lineHeight) {
    const label = plural(pages ?? "?", "page");
    if (!fill || fill.goal == null || !lineHeight) return label;
    const count = Math.floor(Math.max(0, fill.goal - fill.need) / lineHeight);
    const free = count < 1 ? "less than a line free" : `about ${plural(count, "line")} free`;
    return `${label}, ${free}${pages > 1 ? " on the last" : ""}`;
}

/**
 * A note for each page before the last that ends a line or more short, like
 * "page 1 ends about 5 lines short: the next entry didn't fit, so it starts
 * page 2". An entry never splits across pages, so an earlier page can stop
 * early, and the last page's fill wouldn't show it. `pageFills` is
 * pdflatex.js's readPages.
 */
function shortPageNotes(pageFills, lineHeight) {
    if (!lineHeight) return [];
    const last = Math.max(0, ...pageFills.map((fill) => fill.page));
    return pageFills
        .filter((fill) => fill.page < last)
        .map((fill) => ({
            ...fill,
            lines: Math.floor(Math.max(0, fill.goal - fill.used) / lineHeight)
        }))
        .filter((fill) => fill.lines >= 1)
        .map(
            (fill) =>
                `page ${fill.page} ends about ${plural(fill.lines, "line")} short: the next entry ` +
                `didn't fit, so it starts page ${fill.page + 1}`
        );
}

/** "about 13 lines too long", for the points past the limit, rounded up: a cut has to clear it. */
function overNote(points, lineHeight) {
    return `about ${plural(Math.max(1, Math.ceil(points / lineHeight)), "line")} too long`;
}

module.exports = { fillNote, overNote, shortPageNotes };
