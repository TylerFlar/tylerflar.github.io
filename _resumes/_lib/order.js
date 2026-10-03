"use strict";

// Newest first: the one order every dated list on the CV and the website
// follows. Anything still running comes first; then the later end month; then,
// on the same end month, the later start month. Two entries with the same start
// and end may stand either way.

/** A master.yaml date as a sortable month number; `present` sorts after every month. */
function monthKey(value, context = "date") {
    if (typeof value === "string" && value.toLowerCase() === "present") return Infinity;
    const match = /^(?:expected\s+)?(\d{4})-(\d{2})$/i.exec(String(value));
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
        throw new Error(
            `Invalid date "${value}" (${context}); expected "YYYY-MM", present or "expected YYYY-MM"`
        );
    }
    return Number(match[1]) * 12 + Number(match[2]) - 1;
}

// Larger first. Compared rather than subtracted: Infinity - Infinity is NaN.
const descending = (a, b) => (a === b ? 0 : a > b ? -1 : 1);

/** Sort comparator over `{ start, end }` in master.yaml form, newest first. */
function compareNewestFirst(a, b) {
    return (
        descending(monthKey(a.end), monthKey(b.end)) ||
        descending(monthKey(a.start), monthKey(b.start))
    );
}

const span = ({ start, end }) => `${start} – ${end}`;

/**
 * Fail unless a hand-ordered list already runs newest first, naming the entry
 * to move. The CV prints master.yaml in file order and the homepage timeline
 * prints website.yaml in its own, so when a role ends it has to move down past
 * the ones still running; this turns forgetting that into a build failure.
 * `datesOf` maps a list item to the `{ start, end }` it is dated by.
 */
function assertNewestFirst(entries, label, datesOf = (entry) => entry) {
    for (const entry of entries) {
        const { start, end } = datesOf(entry);
        const where = `${label} "${entry.id}"`;
        if (monthKey(start, `${where} start`) > monthKey(end, `${where} end`)) {
            throw new Error(`${where}: starts (${start}) after it ends (${end})`);
        }
    }
    for (let i = 1; i < entries.length; i++) {
        const [above, below] = [entries[i - 1], entries[i]];
        if (compareNewestFirst(datesOf(above), datesOf(below)) > 0) {
            throw new Error(
                `${label}: move "${below.id}" (${span(datesOf(below))}) above "${above.id}" ` +
                    `(${span(datesOf(above))}). Dated lists run newest first: still running, ` +
                    "then the latest end, then the latest start."
            );
        }
    }
}

module.exports = { monthKey, compareNewestFirst, assertNewestFirst };
