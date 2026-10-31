"use strict";

/**
 * The bullet budget: how many bullets each entry may print on the CV or on a
 * resume, so the work reads even, nothing gets more weight than the work
 * behind it, and old work makes room for new. master.yaml is the record and
 * holds every bullet an entry has; the budget limits what a document picks
 * from it. A document fails (npm run cv for the CV, npm run apply for a
 * resume, and the tests for the CV) when it prints:
 *
 *   - an entry with more bullets than its budget,
 *   - an entry whose budget has reached 0, or
 *   - a skill that only out-of-budget work backs,
 *
 * and budgetProblems says what to cut. The site builds either way.
 *
 * Budgets are measured against the career, which runs from the earliest start
 * in master.yaml, education included, so the same work at the same point in a
 * career gets the same budget at year 5 as at year 25; each step just takes
 * more years later on.
 *
 * An entry earns its budget from its share of the career: the full-time months
 * behind it (the months it ran, counted up to today while it's still going,
 * times a typical week over 40 hours) over the career's months. The week
 * defaults by the kind of work (industry 40 hours, research and projects 20,
 * teaching and volunteering 10), and `hoursPerWeek` on an entry overrides it.
 * Each doubling of the share earns one more bullet, with no cap:
 *
 *   share of the career   under 1/64   1/64   3/64   7/64   15/64   31/64   63/64
 *   bullets earned            1          2      3      4       5       6       7
 *
 * Once it ends, an entry loses a bullet for each whole quarter of the career
 * that's passed since, so nothing is lost while it runs or for the first
 * quarter after. Its budget is what it earned less what it's lost, and at 0 no
 * document prints it, though it stays in master.yaml and on the site.
 *
 * A role with subprojects counts its own printed bullets and every
 * subproject's against its one budget. A website summary (`alt: true`) never
 * prints on the CV, and counts like any bullet when a resume picks it. A
 * degree's `skills` (the ones only its classes back, see skills.js) count as
 * one class, half a full-time month, ending when the degree does, and once
 * that runs out, those skills can't print.
 */

const { monthKey } = require("./order.js");
const { onlyBackedBy } = require("./skills.js");

const HOURS_BY_KIND = { industry: 40, research: 20, project: 20, teaching: 10, volunteer: 10 };
const FULL_TIME_HOURS = 40;
// 1/64 of the career earns an entry's 2nd bullet, and each doubling one more.
const CAREER_SHARE = 64;
// An entry loses a bullet for each whole quarter of the career since it ended.
const QUARTERS = 4;
// A degree's class-only skills count as one class, about half a full-time month.
const CLASS_FTE = 0.5;
// A budget due to drop within this many months shows as a note first.
const HEADS_UP_MONTHS = 3;

function fail(message) {
    throw new Error(message);
}

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

/** Bullets a share of the career earns: 1, then one more for each doubling past 1/64. */
const earnedBy = (share) => 1 + Math.floor(Math.log2(CAREER_SHARE * share + 1));

/** A monthKey as "YYYY-MM". */
const monthText = (key) => `${Math.floor(key / 12)}-${String((key % 12) + 1).padStart(2, "0")}`;

/** The month the career starts: the earliest start in master.yaml, education included. */
function careerStart(master) {
    const entries = [master.education, master.roles, master.projects, master.volunteering].flatMap(
        (list) => list || []
    );
    return Math.min(...entries.map((entry) => monthKey(entry.start, `"${entry.id}" start`)));
}

/** What an entry has earned and lost as of `today`, from its full-time months and its end. */
function decay(row, end, today, start) {
    const career = Math.max(1, today - start + 1);
    const age = today - Math.min(monthKey(end, `${row.label} end`), today);
    const share = row.fte / career;
    const earned = earnedBy(share);
    const lost = Math.floor((QUARTERS * age) / career);
    return { ...row, career, share, age, earned, lost, budget: Math.max(0, earned - lost) };
}

function entryBudget(kind, entry, today, start, label) {
    if (entry.tier !== undefined) {
        fail(
            `${label}: "tier" is gone. The budget comes from the dates now, so delete it, ` +
                `and set "hoursPerWeek" if a typical week wasn't ${HOURS_BY_KIND[workKind(kind, entry)] ?? 20} hours.`
        );
    }
    for (const sub of entry.subprojects || []) {
        for (const key of ["tier", "hoursPerWeek"]) {
            if (sub[key] !== undefined) {
                fail(`${label}/${sub.id}: a subproject shares its role's budget; remove "${key}"`);
            }
        }
    }
    const months = monthsRun(entry, today, label);
    const hours = hoursPerWeek(kind, entry, label);
    const fte = (months * hours) / FULL_TIME_HOURS;
    return decay({ label, kind, entry, months, hours, fte }, entry.end, today, start);
}

/** A degree's class-only skills, as one class that ended with the degree. */
function classworkBudget(degree, today, start) {
    const label = `education "${degree.id}" classwork`;
    return decay(
        { label, kind: "classwork", entry: degree, fte: CLASS_FTE },
        degree.end,
        today,
        start
    );
}

/** This month in monthKey's numbering. */
const currentMonth = (date = new Date()) => date.getFullYear() * 12 + date.getMonth();

/**
 * Every role, project and volunteering entry's budget in file order, then each
 * degree's classwork: { label, kind, entry, months, hours, fte, career, share,
 * age, earned, lost, budget }. Pass `today` (a monthKey) to pin the date; it's
 * this month otherwise.
 */
function budgetRows(master, { today = currentMonth() } = {}) {
    const start = careerStart(master);
    const groups = [
        ["role", master.roles],
        ["project", master.projects],
        ["volunteer", master.volunteering]
    ];
    const rows = [];
    for (const [kind, entries] of groups) {
        for (const entry of entries || []) {
            rows.push(entryBudget(kind, entry, today, start, `${kind} "${entry.id}"`));
        }
    }
    for (const degree of master.education || []) {
        if (Array.isArray(degree.skills) && degree.skills.length) {
            rows.push(classworkBudget(degree, today, start));
        }
    }
    return rows;
}

const oneDecimal = (value) => String(Math.round(value * 10) / 10);

const monthsText = (count, what = "months") =>
    `${oneDecimal(count)} ${count === 1 ? what.replace(/s$/, "") : what}`;

const listText = (items) =>
    items.length < 2
        ? items.join("")
        : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Where a budget comes from, as a clause. */
function source(row) {
    const share = `${oneDecimal(row.share * 100)}% of the ${row.career}-month career`;
    const end = String(row.entry.end).replace(/^expected\s+/i, "");
    if (row.kind === "classwork") {
        return (
            `its classes count as half a full-time month, ${share}, which earns ${row.earned}, ` +
            `and it has lost ${row.lost} since the degree ended in ${end}`
        );
    }
    const work =
        `its ${monthsText(row.fte, "full-time months")} (${monthsText(row.months)} at ${row.hours} ` +
        `hours a week) ${row.fte === 1 ? "is" : "are"} ${share}, which earns ${row.earned}`;
    if (!row.lost) return work;
    return (
        `${work}, and it has lost ${row.lost} since it ended in ${end}, one for each quarter ` +
        "of the career since"
    );
}

const rowKey = (kind, id) => `${kind}:${id}`;

/**
 * What a resolved document (resolvePublicCv or resolveResume) prints of each
 * budgeted entry: key -> { kind, id, bullets: ["id", "sub.id", ...] }. An entry
 * printed as its heading alone has no bullets, and is still printed.
 */
function printedEntries(doc) {
    const printed = new Map();
    for (const section of doc.sections || []) {
        for (const entry of section.entries || []) {
            if (!["role", "project", "volunteer"].includes(entry.kind)) continue;
            const bullets = (entry.bullets || []).map((bullet) => bullet.id);
            for (const sub of entry.subprojects || []) {
                bullets.push(...(sub.bullets || []).map((bullet) => `${sub.id}.${bullet.id}`));
            }
            printed.set(rowKey(entry.kind, entry.id), { kind: entry.kind, id: entry.id, bullets });
        }
    }
    return printed;
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const skillName = (text) => text.replace(/\s*\(.*\)$/, "");
const skillListed = (text) =>
    /\((.*)\)$/
        .exec(text)?.[1]
        .split(",")
        .map((name) => name.trim()) ?? [];

/** Whether a document prints a skill (or one name in its parentheses) that `lost` names. */
function printsSkill(doc, master, lost) {
    const label = master.skills[lost.group]?.label;
    return (doc.sections || [])
        .filter((section) => section.kind === "skills")
        .flatMap((section) => section.groups || [])
        .filter((group) => group.label === label)
        .flatMap((group) => group.items)
        .some((shown) => {
            if (!same(skillName(shown), skillName(lost.item))) return false;
            return lost.name === null || skillListed(shown).some((name) => same(name, lost.name));
        });
}

const skillText = ({ group, item, name }) =>
    name ? `${name} in "${item}" (skills.${group})` : `${item} (skills.${group})`;

/** The skills, and names in parentheses, that can't print as of `rows`: only out-of-budget work backs them. */
function lostSkills(master, rows) {
    return onlyBackedBy(
        master,
        rows.filter((row) => row.budget === 0).map((row) => row.entry)
    );
}

/**
 * The budget a resolved document has to keep, as of `today`: `problems`, which
 * fail it, and `notes` on drops due within HEADS_UP_MONTHS, which don't. `cv`
 * says the document is the public CV, so the fixes point at cv.yaml.
 */
function budgetProblems(master, doc, { today = currentMonth(), cv = false } = {}) {
    const where = cv ? "the CV" : "this resume";
    const rows = budgetRows(master, { today });
    const byKey = new Map(rows.map((row) => [rowKey(row.kind, row.entry.id), row]));
    const printed = printedEntries(doc);
    const problems = [];
    for (const [key, shown] of printed) {
        const row = byKey.get(key);
        if (!row) continue;
        if (row.budget === 0) {
            problems.push(
                `${row.label} is out of budget, so ${where} can't print it: ${source(row)}. ` +
                    (cv
                        ? `Take it off the CV, under off.room in cv.yaml. It stays in master.yaml and on the site.`
                        : "Leave it off.")
            );
        } else if (shown.bullets.length > row.budget) {
            const extra = shown.bullets.length - row.budget;
            problems.push(
                `${row.label}: ${shown.bullets.length} bullets on ${where} (${shown.bullets.join(", ")}), ` +
                    `over its budget of ${row.budget}: ${source(row)}. Cut the weakest${extra > 1 ? ` ${extra}` : ""}.`
            );
        }
    }
    for (const lost of lostSkills(master, rows)) {
        if (!printsSkill(doc, master, lost)) continue;
        const behind = listText(
            lost.owners.map((owner) => rows.find((row) => row.entry === owner)?.label ?? owner.id)
        );
        problems.push(
            `${skillText(lost)} only comes from work that's out of budget (${behind}), so ${where} ` +
                `can't print it. ${cv ? "Move it to off.skills in cv.yaml." : "Take it off this resume's skills."}`
        );
    }
    return { problems, notes: headsUp(master, doc, rows, today, where) };
}

/** A note for each printed entry or skill whose budget falls under what's printed within HEADS_UP_MONTHS. */
function headsUp(master, doc, rows, today, where) {
    const printed = printedEntries(doc);
    const notes = [];
    for (const row of rows) {
        const shown = printed.get(rowKey(row.kind, row.entry.id));
        if (!shown || row.budget === 0 || shown.bullets.length > row.budget) continue;
        for (let i = 1; i <= HEADS_UP_MONTHS; i++) {
            const later = budgetRows(master, { today: today + i }).find(
                (candidate) => candidate.entry === row.entry && candidate.kind === row.kind
            );
            const month = monthText(today + i);
            if (later.budget === 0) {
                notes.push(
                    `${row.label} runs out of budget in ${month}, so it comes off ${where} then.`
                );
                break;
            }
            if (later.budget < shown.bullets.length) {
                notes.push(
                    `${row.label}: its budget drops from ${row.budget} to ${later.budget} in ${month}, ` +
                        `under its ${shown.bullets.length} bullets on ${where}.`
                );
                break;
            }
        }
    }
    const lostNow = lostSkills(master, rows).map(skillText);
    const noted = new Set();
    for (let i = 1; i <= HEADS_UP_MONTHS; i++) {
        const later = budgetRows(master, { today: today + i });
        for (const lost of lostSkills(master, later)) {
            const text = skillText(lost);
            if (lostNow.includes(text) || noted.has(text) || !printsSkill(doc, master, lost))
                continue;
            noted.add(text);
            notes.push(
                `${text} can't print from ${monthText(today + i)}, when the last work behind it runs out of budget, so it comes off ${where} then.`
            );
        }
    }
    return notes;
}

module.exports = {
    budgetProblems,
    budgetRows,
    careerStart,
    HOURS_BY_KIND,
    CAREER_SHARE,
    QUARTERS,
    CLASS_FTE,
    HEADS_UP_MONTHS
};
