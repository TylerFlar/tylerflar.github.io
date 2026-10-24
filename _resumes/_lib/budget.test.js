"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { budgetNotes, budgetRows, HOURS_BY_KIND, STEPS } = require("./budget.js");
const { loadMaster } = require("./load.js");

// The bullet budget keeps the CV even by the work behind each entry: the
// months it ran times a typical week, in full-time months, with one more
// bullet for each doubling. It's a suggestion, so going over is a note, not an
// error. These pin the rule and its messages to a fixed "today".

const today = { today: 2026 * 12 + 9 }; // October 2026, in monthKey's numbering

const bullets = (count, extra = {}) =>
    Array.from({ length: count }, (_, i) => ({ id: `b${i}`, text: "Did a thing.", ...extra }));

const master = ({ roles = [], projects = [], volunteering = [] }) => ({
    roles,
    projects,
    volunteering
});

const budgetOf = (shape) => budgetRows(master(shape), today)[0].budget;

test("a typical week is 40 hours in industry, 20 in research and projects, 10 elsewhere", () => {
    assert.deepEqual(HOURS_BY_KIND, {
        industry: 40,
        research: 20,
        project: 20,
        teaching: 10,
        volunteer: 10
    });
    assert.deepEqual(STEPS, [1, 3, 7, 15]);
});

test("each doubling of full-time months earns one more bullet", () => {
    const job = (start, end) => ({ roles: [{ id: "job", track: "industry", start, end }] });
    assert.equal(budgetOf(job("2026-01", "2026-01")), 2); // 1 full-time month
    assert.equal(budgetOf(job("2026-01", "2026-02")), 2); // 2
    assert.equal(budgetOf(job("2026-01", "2026-03")), 3); // 3
    assert.equal(budgetOf(job("2026-01", "2026-07")), 4); // 7
    assert.equal(budgetOf(job("2025-01", "2026-03")), 5); // 15
    const club = { volunteering: [{ id: "club", start: "2026-01", end: "2026-01" }] };
    assert.equal(budgetOf(club), 1); // a quarter of a full-time month
});

test("the week follows the kind of work, and hoursPerWeek overrides it", () => {
    const span = { start: "2026-01", end: "2026-04", bullets: [] }; // 4 months
    const rows = budgetRows(
        master({
            roles: [
                { ...span, id: "job", track: "industry" },
                { ...span, id: "lab", track: "research" },
                { ...span, id: "ta", track: "teaching" }
            ],
            projects: [{ ...span, id: "p" }],
            volunteering: [
                { ...span, id: "club" },
                { ...span, id: "big-club", hoursPerWeek: 40 }
            ]
        }),
        today
    );
    assert.deepEqual(
        rows.map((row) => [row.label, row.fte, row.budget]),
        [
            ['role "job"', 4, 3],
            ['role "lab"', 2, 2],
            ['role "ta"', 1, 2],
            ['project "p"', 2, 2],
            ['volunteer "club"', 1, 2],
            ['volunteer "big-club"', 4, 3]
        ]
    );
});

test("an entry still going counts its months up to today", () => {
    const lab = { id: "lab", track: "research", start: "2025-09", end: "present" };
    const [row] = budgetRows(master({ roles: [lab] }), today);
    assert.equal(row.months, 14);
    assert.equal(row.budget, 4); // 7 full-time months
});

test("going over is a note that says what the budget came from", () => {
    const job = {
        id: "job",
        track: "industry",
        start: "2026-06",
        end: "2026-09",
        bullets: bullets(5)
    };
    const notes = budgetNotes(master({ roles: [job] }), today);
    assert.equal(notes.length, 1);
    assert.match(
        notes[0],
        /role "job": 5 CV bullets, over the 3 that 4 full-time months suggest \(4 months at 40 hours a week\)\. Fine if/
    );
    assert.deepEqual(budgetNotes(master({ roles: [{ ...job, bullets: bullets(3) }] }), today), []);
});

test("website-only alt bullets don't count", () => {
    const p = {
        id: "p",
        start: "2026-01",
        end: "2026-04",
        bullets: [...bullets(2), { id: "web", alt: true, text: "Summary." }]
    };
    assert.deepEqual(budgetNotes(master({ projects: [p] }), today), []);
});

test("a role and its subprojects share one budget", () => {
    const lab = {
        id: "lab",
        track: "research",
        start: "2026-01",
        end: "2026-04",
        bullets: bullets(1),
        subprojects: [{ id: "s", bullets: bullets(2) }]
    };
    assert.match(
        budgetNotes(master({ roles: [lab] }), today)[0],
        /role "lab": 3 CV bullets, over the 2 that 2 full-time months suggest/
    );
});

test("tier is gone, and hoursPerWeek has to be a real week", () => {
    const p = { id: "p", start: "2026-01", end: "2026-04", bullets: [] };
    const notes = (shape) => () => budgetNotes(master(shape), today);
    assert.throws(notes({ projects: [{ ...p, tier: "flagship" }] }), /"tier" is gone/);
    assert.throws(notes({ projects: [{ ...p, hoursPerWeek: 0 }] }), /"hoursPerWeek" is hours/);
    assert.throws(notes({ projects: [{ ...p, hoursPerWeek: "lots" }] }), /"hoursPerWeek" is hours/);
    const lab = {
        ...p,
        id: "lab",
        track: "research",
        subprojects: [{ id: "s", hoursPerWeek: 10, bullets: [] }]
    };
    assert.throws(notes({ roles: [lab] }), /lab"\/s: a subproject shares its role's budget/);
});

test("master.yaml loads, and any entry over its budget is listed", (t) => {
    // loadMaster runs the same check and keeps its notes; this shows them in
    // the test report without failing it.
    const { budgetNotes: notes } = loadMaster();
    assert.ok(Array.isArray(notes));
    for (const note of notes) t.diagnostic(`budget note: ${note}`);
});
