"use strict";

/**
 * The CV's bullet budget: how many bullets each entry may print, so the work
 * reads even, nothing gets more weight than the work behind it, and old work
 * makes room for new. An entry over its budget, or one whose budget has reached
 * 0 and has to come off the CV, fails `npm run cv` and the tests, and
 * budgetReport says what to cut. The site and applications still build.
 *
 * Budgets are measured against the career, which runs from the earliest start
 * on the CV, education included, so the same work at the same point in a
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
 * quarter after. Its budget is what it earned less what it's lost, and at 0 it
 * comes off the CV everywhere.
 *
 * A role with subprojects counts its own bullets and every subproject's against
 * its one budget. `alt: true` bullets are website-only and don't count. A
 * degree's `skills` (the ones only its classes back, see skills.js) count as
 * one class, half a full-time month, ending when the degree does.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { monthKey } = require("./order.js");
const { loadProjectPages, readFrontMatter } = require("./pages.js");
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
// Project pages link their code; repos on this account are mine to unpin.
const GITHUB_USER = "TylerFlar";

const DATA_DIR = path.join(__dirname, "..", "data");
const IMAGES_DIR = path.join(__dirname, "..", "..", "src", "assets", "images", "projects");

function fail(message) {
    throw new Error(message);
}

const onCv = (bullets) => (bullets || []).filter((bullet) => !bullet.alt);

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

/** The month the career starts: the earliest start on the CV, education included. */
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
    const bullets = onCv(entry.bullets).map((bullet) => bullet.id);
    for (const sub of entry.subprojects || []) {
        for (const key of ["tier", "hoursPerWeek"]) {
            if (sub[key] !== undefined) {
                fail(`${label}/${sub.id}: a subproject shares its role's budget; remove "${key}"`);
            }
        }
        bullets.push(...onCv(sub.bullets).map((bullet) => `${sub.id}.${bullet.id}`));
    }
    const months = monthsRun(entry, today, label);
    const hours = hoursPerWeek(kind, entry, label);
    const fte = (months * hours) / FULL_TIME_HOURS;
    const row = { label, kind, entry, months, hours, fte, bullets, count: bullets.length };
    return decay(row, entry.end, today, start);
}

/** A degree's class-only skills, as one class that ended with the degree. */
function classworkBudget(degree, today, start) {
    const label = `education "${degree.id}" classwork`;
    const row = { label, kind: "classwork", entry: degree, fte: CLASS_FTE, bullets: [], count: 0 };
    return decay(row, degree.end, today, start);
}

/** This month in monthKey's numbering. */
const currentMonth = (date = new Date()) => date.getFullYear() * 12 + date.getMonth();

/**
 * Every role, project and volunteering entry's budget in file order, then each
 * degree's classwork: { label, kind, entry, months, hours, fte, bullets, count,
 * career, share, age, earned, lost, budget }. Pass `today` (a monthKey) to pin
 * the date; it's this month otherwise.
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

const skillText = ({ group, item, name }) =>
    name ? `${name} in "${item}" (skills.${group})` : `${item} (skills.${group})`;

// The names an entry goes by in a sentence: its name or org, its subprojects',
// and an org's first word ("Cubic" for Cubic Transportation Systems).
function namesOf(entry) {
    const names = [entry.name, entry.org, ...(entry.subprojects || []).map((sub) => sub.name)]
        .filter((name) => typeof name === "string" && name.trim())
        .map((name) => ({ text: name, exact: false }));
    const first = typeof entry.org === "string" ? entry.org.split(/\s+/)[0] : "";
    if (first.length >= 4 && /^[A-Z]/.test(first)) names.push({ text: first, exact: true });
    return names;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function names(text, entryNames) {
    return entryNames.some(({ text: name, exact }) =>
        new RegExp(`(^|[^\\w])${escape(name)}(?![\\w])`, exact ? "" : "i").test(text)
    );
}

/** The project pages for an entry, by the `cv:` reference each one names. */
function pagesOf(row, pages) {
    const ref = `${row.kind}/${row.entry.id}`;
    return pages.filter(
        (page) => page.cv === ref || (row.kind === "role" && String(page.cv).startsWith(`${ref}/`))
    );
}

/** The checklist for an entry whose budget reached 0: everything that has to go with it. */
function outOfBudget(row, lostSkills, { pages, profile, website }) {
    const own = pagesOf(row, pages);
    const slugs = own.map((page) => path.basename(page.file, ".md"));
    const steps = ["delete it from _resumes/data/master.yaml"];
    for (const slug of slugs) {
        const images = fs.existsSync(path.join(IMAGES_DIR, slug))
            ? ` and src/assets/images/projects/${slug}/`
            : "";
        steps.push(`delete src/content/projects/${slug}.md${images}`);
    }
    if (lostSkills.length) {
        steps.push(
            `take these skills off, since nothing else backs them: ${listText(lostSkills.map(skillText))}`
        );
    }

    const entryNames = namesOf(row.entry);
    const links = slugs.map((slug) => `/projects/${slug}/`);
    const places = [];
    const timeline = new RegExp(`^\\s*-\\s*id:\\s*${escape(row.entry.id)}\\s*$`, "m");
    if (
        ((row.kind === "role" || row.kind === "volunteer") && timeline.test(website)) ||
        links.some((link) => website.includes(link))
    ) {
        places.push("_resumes/data/website.yaml");
    }
    const fields = Object.entries(profile)
        .filter(([, text]) => typeof text === "string" && names(text, entryNames))
        .map(([key]) => key);
    if (fields.length) places.push(`_resumes/data/profile.yaml (${listText(fields)})`);
    for (const page of pages) {
        if (own.includes(page)) continue;
        if (names(page.raw, entryNames) || links.some((link) => page.raw.includes(link))) {
            places.push(`src/content/projects/${page.file}`);
        }
    }
    if (places.length) steps.push(`update the places that name or link it: ${listText(places)}`);

    const repos = own.flatMap((page) =>
        (readFrontMatter(page.raw, page.file).links || [])
            .map((link) =>
                new RegExp(`^https://github\\.com/${GITHUB_USER}/([^/?#]+)`, "i").exec(link.href)
            )
            .filter(Boolean)
            .map((match) => `github.com/${GITHUB_USER}/${match[1]}`)
    );
    for (const repo of [...new Set(repos)]) {
        steps.push(
            `on GitHub, unpin ${repo} if it's pinned, and clear its homepage if it points at the page`
        );
    }
    steps.push("run npm run cv, then npm run profiles, and update LinkedIn to match");
    return (
        `${row.label} is out of budget: ${source(row)}. Take it off everywhere:\n` +
        steps.map((step) => `  - ${step}`).join("\n")
    );
}

function classworkOut(row, lostSkills) {
    const skills = lostSkills.length
        ? `, and take these off skills, since nothing else backs them: ${listText(lostSkills.map(skillText))}`
        : "";
    return (
        `${row.label} is out of budget: ${source(row)}. Delete the degree's skills list` +
        `${skills}. Then run npm run cv, then npm run profiles, and update LinkedIn's skills to match.`
    );
}

function overBudget(row) {
    const extra = row.count - row.budget;
    return (
        `${row.label}: ${row.count} CV bullets (${row.bullets.join(", ")}), over its budget of ` +
        `${row.budget}: ${source(row)}. Cut the weakest${extra > 1 ? ` ${extra}` : ""}.`
    );
}

/** A note for each budget that will fall to 0, or under its bullets, within HEADS_UP_MONTHS. */
function headsUp(master, rows, today) {
    const ahead = Array.from({ length: HEADS_UP_MONTHS }, (_, i) =>
        budgetRows(master, { today: today + i + 1 })
    );
    const notes = [];
    rows.forEach((row, index) => {
        if (row.budget === 0 || row.count > row.budget) return;
        for (const [i, later] of ahead.entries()) {
            const { budget } = later[index];
            const month = monthText(today + i + 1);
            if (budget === 0) {
                notes.push(
                    `${row.label} runs out of budget in ${month}, so it comes off the CV then.`
                );
                break;
            }
            if (budget < row.count) {
                notes.push(
                    `${row.label}: its budget drops from ${row.budget} to ${budget} in ${month}, ` +
                        `under its ${row.count} CV bullets.`
                );
                break;
            }
        }
    });
    return notes;
}

/** The text the checklist searches for mentions, read from the files: project pages, profile.yaml, website.yaml. */
function budgetContext() {
    return {
        pages: loadProjectPages(),
        profile: yaml.load(fs.readFileSync(path.join(DATA_DIR, "profile.yaml"), "utf8")) ?? {},
        website: fs.readFileSync(path.join(DATA_DIR, "website.yaml"), "utf8")
    };
}

/**
 * The budget as of `today`: `problems` (entries over budget, and entries out of
 * it, each with what to delete), which fail the checks, and `notes` (drops due
 * within HEADS_UP_MONTHS), which don't. Pass `budgetContext()` for the
 * checklist's pages and mentions; without it, the checklist names fewer places.
 */
function budgetReport(
    master,
    { today = currentMonth(), pages = [], profile = {}, website = "" } = {}
) {
    const rows = budgetRows(master, { today });
    const out = rows.filter((row) => row.budget === 0);
    const lost = onlyBackedBy(
        master,
        out.map((row) => row.entry)
    );
    const lostTo = (row) => lost.filter((skill) => skill.owners.includes(row.entry));
    const problems = rows.flatMap((row) => {
        if (row.budget === 0) {
            return row.kind === "classwork"
                ? classworkOut(row, lostTo(row))
                : outOfBudget(row, lostTo(row), { pages, profile, website });
        }
        return row.count > row.budget ? overBudget(row) : [];
    });
    return { rows, problems, notes: headsUp(master, rows, today) };
}

module.exports = {
    budgetReport,
    budgetRows,
    budgetContext,
    careerStart,
    HOURS_BY_KIND,
    CAREER_SHARE,
    QUARTERS,
    CLASS_FTE,
    HEADS_UP_MONTHS
};
