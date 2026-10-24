"use strict";

/**
 * The CV's bullet budget: how many bullets each entry should print, so the work
 * reads even and no entry gets more weight than the work behind it. It's a
 * suggestion, not a cap: an entry over it still builds, and budgetNotes lists
 * it for `npm run cv` and the tests to show.
 *
 * The budget comes from how much work an entry was, in full-time months: the
 * months it ran (counted up to today while it's still going) times a typical
 * week, over 40 hours. The week defaults by the kind of work (industry 40
 * hours, research and projects 20, teaching and volunteering 10), and
 * `hoursPerWeek` on an entry overrides it. Each doubling of the work earns one
 * more bullet:
 *
 *   full-time months   under 1   1 to 3   3 to 7   7 to 15   15 and up
 *   bullets               1         2        3        4          5
 *
 * A role with subprojects counts its own bullets and every subproject's against
 * its one budget. `alt: true` bullets are website-only and don't count.
 */

const { monthKey } = require("./order.js");

const HOURS_BY_KIND = { industry: 40, research: 20, project: 20, teaching: 10, volunteer: 10 };
const FULL_TIME_HOURS = 40;
// The full-time months at which an entry earns its 2nd, 3rd, 4th and 5th bullet.
const STEPS = [1, 3, 7, 15];

function fail(message) {
    throw new Error(message);
}

const onCv = (bullets) => (bullets || []).filter((bullet) => !bullet.alt).length;

// A role's week follows its track (industry, research, teaching); a project's or
// a volunteering entry's follows its kind.
const workKind = (kind, entry) => (kind === "role" ? entry.track : kind);

function hoursPerWeek(kind, entry, label) {
    const hours = entry.hoursPerWeek;
    if (hours === undefined) {
        return (
            HOURS_BY_KIND[workKind(kind, entry)] ??
            fail(`${label}: no typical week for "${workKind(kind, entry)}"; set "hoursPerWeek"`)
        );
    }
    if (typeof hours !== "number" || !(hours > 0) || hours > 80) {
        fail(`${label}: "hoursPerWeek" is hours in a typical week, above 0 and at most 80`);
    }
    return hours;
}

/** Months an entry ran, counting both ends, up to today while it's still going. */
function monthsRun(entry, today, label) {
    const start = monthKey(entry.start, `${label} start`);
    const end = Math.min(monthKey(entry.end, `${label} end`), today);
    return Math.max(1, end - start + 1);
}

function entryBudget(kind, entry, today, label) {
    if (entry.tier !== undefined) {
        fail(
            `${label}: "tier" is gone. The budget comes from the dates now, so delete it, ` +
                `and set "hoursPerWeek" if a typical week wasn't ${HOURS_BY_KIND[workKind(kind, entry)] ?? 20} hours.`
        );
    }
    let count = onCv(entry.bullets);
    for (const sub of entry.subprojects || []) {
        for (const key of ["tier", "hoursPerWeek"]) {
            if (sub[key] !== undefined) {
                fail(`${label}/${sub.id}: a subproject shares its role's budget; remove "${key}"`);
            }
        }
        count += onCv(sub.bullets);
    }
    const months = monthsRun(entry, today, label);
    const hours = hoursPerWeek(kind, entry, label);
    const fte = (months * hours) / FULL_TIME_HOURS;
    const budget = 1 + STEPS.filter((step) => fte >= step).length;
    return { label, months, hours, fte, budget, count };
}

/** This month in monthKey's numbering. */
const currentMonth = (date = new Date()) => date.getFullYear() * 12 + date.getMonth();

/**
 * Every role, project and volunteering entry's budget, in file order:
 * { label, months, hours, fte, budget, count }. Pass `today` (a monthKey) to
 * pin the date; it's this month otherwise.
 */
function budgetRows(master, { today = currentMonth() } = {}) {
    const groups = [
        ["role", master.roles],
        ["project", master.projects],
        ["volunteer", master.volunteering]
    ];
    const rows = [];
    for (const [kind, entries] of groups) {
        for (const entry of entries || []) {
            rows.push(entryBudget(kind, entry, today, `${kind} "${entry.id}"`));
        }
    }
    return rows;
}

const oneDecimal = (value) => String(Math.round(value * 10) / 10);

/**
 * A note for every entry with more bullets than its work suggests. Throws only
 * on a setting that's wrong: a leftover `tier` or an impossible week.
 */
function budgetNotes(master, options) {
    return budgetRows(master, options)
        .filter((row) => row.count > row.budget)
        .map(
            (row) =>
                `${row.label}: ${row.count} CV bullets, over the ${row.budget} that ` +
                `${oneDecimal(row.fte)} full-time months suggest (${row.months} months at ` +
                `${row.hours} hours a week). Fine if that's on purpose, or cut the weakest.`
        );
}

module.exports = { budgetNotes, budgetRows, HOURS_BY_KIND, STEPS };
