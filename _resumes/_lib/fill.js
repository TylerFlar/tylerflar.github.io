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

/** "about 13 lines too long", for the points past the limit, rounded up: a cut has to clear it. */
function overNote(points, lineHeight) {
    return `about ${plural(Math.max(1, Math.ceil(points / lineHeight)), "line")} too long`;
}

module.exports = { fillNote, overNote };
