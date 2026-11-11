"use strict";

/**
 * Measure a project's typical week from the commits behind the projects that
 * have a repo on this machine.
 *
 *   npm run hours
 *
 * The bullet budget (_lib/budget.js) weighs every entry by its months times a
 * typical week. A job's week is known. A project's isn't, and most projects
 * have no history to measure by itself, so they all share one number,
 * PROJECT_WEEK, and this is where that number comes from: the hours behind the
 * projects that do have commits, over the months those projects ran.
 *
 * Hours from commits, the way git-hours counts them: commits less than two
 * hours apart are one sitting, and each sitting gets two hours for the work
 * before its first commit. Only my own commits count, and only from the month
 * the entry starts in master.yaml. It's an estimate, and it can't see work that
 * was never committed. Against a few weeks of my own session logs it came out
 * close, so it isn't short by much for work done by directing a coding agent.
 *
 * It reads _resumes/applications/repos.yaml, which holds local paths and so
 * stays in that gitignored folder:
 *
 *   author: "a pattern that matches my commits' name or email"
 *   repos:
 *     jackdaw: [G:/path/to/jackdaw-balatro, G:/path/to/jackdaw-arena]
 *
 * It writes nothing. When the number moves, change PROJECT_WEEK in budget.js,
 * the README's budget section and the pinned test, and refit the CV.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { spawnSync } = require("child_process");
const { loadMaster } = require("./_lib/load.js");
const { monthKey } = require("./_lib/order.js");
const { HOURS_BY_KIND } = require("./_lib/budget.js");

const REPOS_FILE = path.join(__dirname, "applications", "repos.yaml");
// git-hours' defaults: a gap this long starts a new sitting, and a sitting's
// first commit stands for this much work before it.
const SITTING_GAP = 2 * 3600;
const FIRST_COMMIT = 2 * 3600;
const WEEKS_PER_MONTH = 52 / 12;

function fail(message) {
    console.error(message);
    process.exit(1);
}

/** My commits' timestamps in one repo, as seconds. */
function commitTimes(repo, author) {
    const run = spawnSync(
        "git",
        ["-C", repo, "log", "--all", "--no-merges", "--format=%at\t%ae\t%an"],
        { encoding: "utf8", maxBuffer: 1 << 28 }
    );
    if (run.error) fail("git isn't on your PATH.");
    if (run.status !== 0) fail(`${repo}: ${run.stderr.trim() || "git log failed"}`);
    return run.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\t"))
        .filter(([, email, name]) => author.test(`${email} ${name}`))
        .map(([time]) => Number(time));
}

/** Hours behind a list of commit times, by sittings. */
function hoursFrom(times) {
    if (!times.length) return 0;
    let seconds = FIRST_COMMIT;
    for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        seconds += gap < SITTING_GAP ? gap : FIRST_COMMIT;
    }
    return seconds / 3600;
}

function measure() {
    if (!fs.existsSync(REPOS_FILE)) {
        fail(
            `No ${path.relative(process.cwd(), REPOS_FILE)}. It lists each project's repos on this ` +
                "machine. The top of _resumes/_hours.js shows its form."
        );
    }
    const spec = yaml.load(fs.readFileSync(REPOS_FILE, "utf8")) ?? {};
    if (typeof spec.author !== "string" || !spec.repos || typeof spec.repos !== "object") {
        fail("repos.yaml: expected author (a pattern for my commits) and repos (id: [paths]).");
    }
    const author = new RegExp(spec.author, "i");
    const master = loadMaster();
    const now = new Date();
    const today = now.getFullYear() * 12 + now.getMonth();

    const rows = [];
    for (const [id, repos] of Object.entries(spec.repos)) {
        const entry = master.projects.find((project) => project.id === id);
        if (!entry) fail(`repos.yaml: master.yaml has no project "${id}".`);
        const start = monthKey(entry.start, `${id} start`);
        const from = Date.UTC(Math.floor(start / 12), start % 12, 1) / 1000;
        const times = new Set();
        for (const repo of [].concat(repos)) {
            if (!fs.existsSync(path.join(repo, ".git")))
                fail(`repos.yaml ${id}: no repo at ${repo}`);
            for (const time of commitTimes(repo, author)) if (time >= from) times.add(time);
        }
        const sorted = [...times].sort((a, b) => a - b);
        const months = Math.max(1, Math.min(monthKey(entry.end, `${id} end`), today) - start + 1);
        const hours = hoursFrom(sorted);
        rows.push({
            id,
            days: new Set(sorted.map((time) => new Date(time * 1000).toISOString().slice(0, 10)))
                .size,
            hours,
            months,
            week: hours / (months * WEEKS_PER_MONTH)
        });
    }
    return rows;
}

const rows = measure();
const total = rows.reduce(
    (sum, row) => ({
        days: sum.days + row.days,
        hours: sum.hours + row.hours,
        months: sum.months + row.months
    }),
    { days: 0, hours: 0, months: 0 }
);
const average = total.hours / (total.months * WEEKS_PER_MONTH);
const line = (name, days, hours, months, week) =>
    `${name.padEnd(20)}${String(days).padStart(11)}${String(Math.round(hours)).padStart(8)}` +
    `${String(months).padStart(9)}${week.toFixed(1).padStart(15)}`;

console.log(`${"project".padEnd(20)}commit days   hours   months   hours a week`);
for (const row of rows) console.log(line(row.id, row.days, row.hours, row.months, row.week));
console.log(line(`all ${rows.length}`, total.days, total.hours, total.months, average));
console.log(
    `\nA project's typical week comes to ${average.toFixed(1)} hours. ` +
        `budget.js has ${HOURS_BY_KIND.project} (PROJECT_WEEK).`
);
