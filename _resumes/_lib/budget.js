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
 * and budgetProblems says what to cut. The site's own build (npm run build)
 * doesn't run this, though the tests do, and the deploy runs the tests first.
 *
 * Budgets are measured against the career, which runs from the earliest start
 * in master.yaml, education included, so the same work at the same point in a
 * career gets the same budget at year 5 as at year 25; each step just takes
 * more years later on.
 *
 * An entry earns its budget from its share of the career: the full-time months
 * behind it (the months it ran, counted up to today while it's still going,
 * times a typical week over 40 hours) over the career's months. The week
 * goes by the kind of work (industry 40 hours, research 20, teaching,
 * volunteering and work for myself 10, a project 3), and no entry sets its
 * own. A project's week is the one number here that's measured: see
 * PROJECT_WEEK.
 * Each doubling of the share earns one more bullet, with no cap:
 *
 *   share of the career   under 1/64   1/64   3/64   7/64   15/64   31/64   63/64
 *   bullets earned            1          2      3      4       5       6       7
 *
 * Once it ends, an entry loses a bullet for each whole quarter of the career
 * that's passed since, so nothing is lost while it runs or for the first
 * quarter after. Its budget is what it earned less what it's lost, and at 0 no
 * document prints it. It stays in master.yaml, which is the record and prints
 * nothing itself, and its page comes off the site (pageNotes says which).
 *
 * A role with subprojects counts its own printed bullets and every
 * subproject's against its one budget. A website summary (`alt: true`) never
 * prints on the CV, and counts like any bullet when a resume picks it. A
 * degree's `skills` (the ones only its classes back, see skills.js) count as
 * one class, half a full-time month, ending when the degree does, and once
 * that runs out, those skills can't print.
 *
 * A paper is weighed by itself, apart from the project it came out of. It has
 * a date and no hours, so it's weighed by my place among its authors: a
 * first-author paper counts as FIRST_AUTHOR_FTE full-time months of work, and
 * the paper I'm the k-th author of as that over k, ending the month it came
 * out. From there it earns and loses like any entry. It prints or it doesn't:
 * at 0 no document prints it, or the skills only it backs.
 */

const { monthKey } = require("./order.js");
const { onlyBackedBy, skillName, skillListed } = require("./skills.js");
const { bulletRefs } = require("./standard.js");
const { fail } = require("./fail.js");

// A project's typical week, measured from the commits behind the projects that
// have a repo (npm run hours, _resumes/_hours.js): about 640 hours over the 45
// months those nine projects ran, 3.3 hours a week, in November 2026. A side
// project is worked in bursts and then sits, and its months count from its
// first to its last, so its week is nothing like a job's. One number for every
// project, since most have no history to measure by itself: run npm run hours
// again when the projects have changed, and set it here.
const PROJECT_WEEK = 3;
// Work for myself (a studio of my own, commissions) gets a part-time week, the
// same as teaching and volunteering. It's set, not measured: the commits
// behind Lycanworks's twelve repos come to 2.9 hours a week over its first 15
// months, which misses the art, since that was never committed. Surveys of
// side businesses put the typical week at 5 to 10 hours and the mean at 11 to
// 16 (Zapier 2022, Self Financial, Omnisend 2026).
const SELF_EMPLOYED_WEEK = 10;
const HOURS_BY_KIND = {
    industry: 40,
    research: 20,
    project: PROJECT_WEEK,
    teaching: 10,
    volunteer: 10,
    "self-employed": SELF_EMPLOYED_WEEK
};
const FULL_TIME_HOURS = 40;
// 1/64 of the career earns an entry's 2nd bullet, and each doubling one more.
const CAREER_SHARE = 64;
// An entry loses a bullet for each whole quarter of the career since it ended.
const QUARTERS = 4;
// A degree's class-only skills count as one class, about half a full-time month.
const CLASS_FTE = 0.5;
// A paper's weight, in full-time months, goes by my place among its authors: a
// year's work as first author, and a year over the place after that (6 months
// as second author, 4 as third). The first author usually did the most, and
// each name after did less. The year is set, not measured, since a paper has
// no hours to measure the way a project's commits give its week. It decides
// how long a paper prints. For one that came out in July 2026, as CHASER did:
//
//   place among the authors    1st       2nd       3rd to 6th   7th       8th
//   prints until               2041-04   2032-05   2031-06      2030-10   2029-09
//
// and from the 10th place on, 2028-03, the same as a small project. CHASER has
// me third of eight, so it counts as 4 months and prints until June 2031.
const FIRST_AUTHOR_FTE = 12;
// A budget due to drop within this many months shows as a note first.
const HEADS_UP_MONTHS = 3;

// A role's week follows its track (industry, research, teaching, self-employed);
// a project's or a volunteering entry's follows its kind.
const workKind = (kind, entry) => (kind === "role" ? entry.track : kind);

/** The typical week of an entry's kind of work. No entry sets hours of its own. */
function typicalWeek(kind, entry, label) {
    const work = workKind(kind, entry);
    return (
        HOURS_BY_KIND[work] ??
        fail(`${label}: no typical week for "${work}". Give it one in HOURS_BY_KIND (budget.js)`)
    );
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
            `${label}: "tier" is gone. The budget comes from the dates and the kind of work ` +
                "now, so delete it."
        );
    }
    if (entry.hoursPerWeek !== undefined) {
        fail(
            `${label}: "hoursPerWeek" is gone. The kind of work gives the week now, ` +
                `${typicalWeek(kind, entry, label)} hours for this one, so delete it.`
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
    const hours = typicalWeek(kind, entry, label);
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

/**
 * My place among a paper's authors, and how many there are: { place, of }. The
 * record bolds my name in `authors`, which is how the CV prints it, and that's
 * the name this looks for.
 */
function authorPlace(paper, label = `publication "${paper.id}"`) {
    const authors = String(paper.authors ?? "")
        .split(/\s*,\s*(?:and\s+)?|\s+and\s+/)
        .map((name) => name.trim())
        .filter(Boolean);
    const mine = authors.flatMap((name, i) => (/\*\*[^*]+\*\*/.test(name) ? [i + 1] : []));
    if (mine.length !== 1) {
        fail(
            `${label}: bold your own name in "authors", once, like **Tyler Flar**. ` +
                "A paper is weighed by your place among its authors."
        );
    }
    return { place: mine[0], of: authors.length };
}

/**
 * A paper, as the full-time months my place among its authors counts for
 * (FIRST_AUTHOR_FTE over the place), ending the month it came out.
 */
function paperBudget(paper, today, start) {
    const label = `publication "${paper.id}"`;
    const { place, of } = authorPlace(paper, label);
    return decay(
        { label, kind: "publication", entry: paper, place, of, fte: FIRST_AUTHOR_FTE / place },
        paper.date,
        today,
        start
    );
}

/** This month in monthKey's numbering. */
const currentMonth = (date = new Date()) => date.getFullYear() * 12 + date.getMonth();

/**
 * Every role, project and volunteering entry's budget in file order, then each
 * paper's and each degree's classwork: { label, kind, entry, months, hours,
 * fte, career, share, age, earned, lost, budget }, a paper and classwork
 * without the months and hours. Pass `today` (a monthKey) to pin the date;
 * it's this month otherwise.
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
    for (const paper of master.publications || []) {
        rows.push(paperBudget(paper, today, start));
    }
    for (const degree of master.education || []) {
        if (Array.isArray(degree.skills) && degree.skills.length) {
            rows.push(classworkBudget(degree, today, start));
        }
    }
    return rows;
}

const oneDecimal = (value) => String(Math.round(value * 10) / 10);

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
function ordinal(n) {
    const tens = n % 100;
    const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
    return `${n}${suffix}`;
}

const monthsText = (count, what = "months") =>
    `${oneDecimal(count)} ${count === 1 ? what.replace(/s$/, "") : what}`;

const listText = (items) =>
    items.length < 2
        ? items.join("")
        : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Where a budget comes from, as a clause. */
function source(row) {
    const share = `${oneDecimal(row.share * 100)}% of the ${row.career}-month career`;
    if (row.kind === "publication") {
        const work =
            `as ${ordinal(row.place)} of its ${row.of} authors it counts as ` +
            `${monthsText(row.fte, "full-time months")}, ${share}, which earns ${row.earned}`;
        if (!row.lost) return work;
        return (
            `${work}, and it has lost ${row.lost} since it came out in ${row.entry.date}, one ` +
            "for each quarter of the career since"
        );
    }
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
            if (!["role", "project", "volunteer", "publication"].includes(entry.kind)) continue;
            printed.set(rowKey(entry.kind, entry.id), {
                kind: entry.kind,
                id: entry.id,
                bullets: bulletRefs(entry)
            });
        }
    }
    return printed;
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

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
            // A paper has no page of its own to come off the site.
            const stays =
                row.kind === "publication"
                    ? "It stays in master.yaml."
                    : "It stays in master.yaml, and its page comes off the site.";
            problems.push(
                `${row.label} is out of budget, so ${where} can't print it: ${source(row)}. ` +
                    (cv
                        ? `Take it off the CV, under off.room in cv.yaml. ${stays}`
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

/**
 * The site keeps to the budget too: a page comes off the site once the entry
 * it names is out of budget, so the site shows the work a document can still
 * print. A note for each page that's due off, and each one due within
 * HEADS_UP_MONTHS. `pages` are the project pages ({ file, cv }, pages.js), and
 * a subproject's page goes by its role's budget. A paper is separate from the
 * project it came out of: it has a budget of its own (paperBudget), and the
 * project's page goes with the project's, like any other.
 */
function pageNotes(master, pages, { today = currentMonth() } = {}) {
    const rowsAt = (month) => budgetRows(master, { today: month });
    const now = rowsAt(today);
    const later = Array.from({ length: HEADS_UP_MONTHS }, (_, i) => rowsAt(today + i + 1));
    const notes = [];
    for (const page of pages) {
        const [kind, id] = String(page.cv).split("/");
        const named = (row) => row.kind === kind && row.entry.id === id;
        const row = now.find(named);
        if (!row) continue;
        if (row.budget === 0) {
            notes.push(
                `${row.label} is out of budget, so its page (${page.file}) comes off the site: ` +
                    "delete it and its pictures."
            );
            continue;
        }
        const due = later.findIndex((rows) => rows.find(named).budget === 0);
        if (due >= 0) {
            notes.push(
                `${row.label} runs out of budget in ${monthText(today + due + 1)}, so its page ` +
                    `(${page.file}) comes off the site then.`
            );
        }
    }
    return notes;
}

/**
 * The other half of the same rule: a project a document can still print has a
 * page on the site. A problem for each project in budget that no page names,
 * a draft not counting, since a full build leaves drafts out. It's a problem
 * where a late deletion is a note, because it comes up when a project is
 * recorded, never when a month turns over. A role shows through its
 * subprojects' pages where it has any, so this holds projects only.
 */
function pageProblems(master, pages, { today = currentMonth() } = {}) {
    const named = new Set(pages.filter((page) => !page.draft).map((page) => String(page.cv)));
    return budgetRows(master, { today })
        .filter((row) => row.kind === "project" && row.budget > 0)
        .filter((row) => !named.has(`project/${row.entry.id}`))
        .map(
            (row) =>
                `${row.label} has a bullet budget of ${row.budget} and no page on the site. ` +
                "Every project a document can print has one: write its page in " +
                `src/content/projects/, with "cv: project/${row.entry.id}" in the front matter.`
        );
}

module.exports = {
    budgetProblems,
    budgetRows,
    pageNotes,
    pageProblems,
    lostSkills,
    careerStart,
    HOURS_BY_KIND,
    CAREER_SHARE,
    QUARTERS,
    CLASS_FTE,
    FIRST_AUTHOR_FTE,
    authorPlace,
    HEADS_UP_MONTHS
};
