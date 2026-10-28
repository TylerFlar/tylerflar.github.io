"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    budgetReport,
    budgetRows,
    budgetContext,
    careerStart,
    HOURS_BY_KIND,
    CAREER_SHARE,
    QUARTERS,
    HEADS_UP_MONTHS
} = require("./budget.js");
const { loadMaster } = require("./load.js");

// The bullet budget is measured against the career: an entry earns a bullet for
// each doubling of its share of the career, and once it ends, loses one for
// each quarter of the career since. Over budget, or out of it, fails the
// checks. These pin the rule and its messages to fixed dates; the last test is
// the one that reads today's.

/** A month as monthKey numbers it, and back as "YYYY-MM". */
const key = (year, month) => year * 12 + month - 1;
const ym = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;

const bullets = (count, extra = {}) =>
    Array.from({ length: count }, (_, i) => ({ id: `b${i}`, text: "Did a thing.", ...extra }));

const master = (shape) => ({
    education: [],
    roles: [],
    projects: [],
    volunteering: [],
    skills: {},
    ...shape
});

/** A degree from `start`, which pins where the career begins. */
const school = (start, extra = {}) => ({
    id: "school",
    start: ym(start),
    end: ym(start + 47),
    ...extra
});

/** A full-time job of `months` months that ends `ago` months before `today`. */
const job = (id, today, months, ago = 0, extra = {}) => ({
    id,
    track: "industry",
    start: ym(today - ago - months + 1),
    end: ym(today - ago),
    bullets: [],
    ...extra
});

test("the rule's numbers: 1/64 of the career earns the 2nd bullet, and a quarter costs one", () => {
    assert.equal(CAREER_SHARE, 64);
    assert.equal(QUARTERS, 4);
    assert.equal(HEADS_UP_MONTHS, 3);
    assert.deepEqual(HOURS_BY_KIND, {
        industry: 40,
        research: 20,
        project: 20,
        teaching: 10,
        volunteer: 10
    });
});

test("each doubling of an entry's share of the career earns a bullet, with no cap", () => {
    // A 64-month career, so 1/64 of it is one full-time month: the old table.
    const start = key(2020, 1);
    const today = start + 63;
    const rows = budgetRows(
        master({
            education: [school(start)],
            roles: [
                job("half", today, 1, 0, { hoursPerWeek: 20 }),
                ...[1, 3, 7, 15, 31, 63].map((months) => job(`m${months}`, today, months))
            ]
        }),
        { today }
    );
    assert.deepEqual(
        rows.map((row) => [row.fte, row.earned]),
        [
            [0.5, 1],
            [1, 2],
            [3, 3],
            [7, 4],
            [15, 5],
            [31, 6],
            [63, 7]
        ]
    );
    // A full-time job for the whole career, still going, earns 7, past the 5
    // the old table stopped at.
    const career = budgetRows(master({ roles: [{ ...job("all", today, 64), end: "present" }] }), {
        today
    });
    assert.equal(career[0].budget, 7);
});

test("the same work earns a bullet fewer each time the career doubles", () => {
    const today = key(2030, 1);
    const sevenMonths = (careerMonths) =>
        budgetRows(
            master({
                education: [school(today - careerMonths + 1)],
                roles: [job("job", today, 7)]
            }),
            { today }
        )[0].earned;
    assert.deepEqual([64, 128, 256].map(sevenMonths), [4, 3, 2]);
});

test("once it ends, an entry loses a bullet for each whole quarter of the career since", () => {
    const start = key(2020, 1);
    const today = start + 95; // a 96-month career, so a quarter is 24 months
    const ago = [0, 23, 24, 47, 48, 72];
    const rows = budgetRows(
        master({
            education: [school(start)],
            roles: [
                { ...job("running", today, 12), end: "present" },
                ...ago.map((months) => job(`ago${months}`, today, 3, months))
            ]
        }),
        { today }
    );
    assert.deepEqual(
        rows.map((row) => [row.age, row.lost]),
        [
            [0, 0],
            [0, 0],
            [23, 0],
            [24, 1],
            [47, 1],
            [48, 2],
            [72, 3]
        ]
    );
});

test("the same shares of a career cost the same at year 5 as at year 25", () => {
    // Six months ending 15 months back in a 60-month career, and thirty ending
    // 75 back in a 300-month one: a tenth of the career, a quarter ago.
    const at = (start, careerMonths, months, ago) => {
        const today = start + careerMonths - 1;
        const [row] = budgetRows(
            master({ education: [school(start)], roles: [job("job", today, months, ago)] }),
            { today }
        );
        return [row.share, row.earned, row.lost, row.budget];
    };
    assert.deepEqual(at(key(2020, 1), 60, 6, 15), [0.1, 3, 1, 2]);
    assert.deepEqual(at(key(2000, 1), 300, 30, 75), [0.1, 3, 1, 2]);
});

test("two long jobs or twenty short ones both read sensibly twenty years in", () => {
    const start = key(2000, 1);
    const today = start + 239;
    // Back to back, ten years each: the older still gets 4, a decade on.
    const long = budgetRows(
        master({
            roles: [
                { id: "now", track: "industry", start: "2010-01", end: "present", bullets: [] },
                { id: "then", track: "industry", start: "2000-01", end: "2009-12", bullets: [] }
            ]
        }),
        { today }
    );
    assert.deepEqual(
        long.map((row) => row.budget),
        [6, 4]
    );
    // A year each: the latest fifteen stay, at 3, 2 and 1 bullets.
    const short = budgetRows(
        master({
            roles: Array.from({ length: 20 }, (_, k) => job(`year${k}`, today, 12, 12 * k))
        }),
        { today }
    );
    assert.deepEqual(
        short.map((row) => row.budget),
        [3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
    );
});

test("the career starts at the earliest start, education included, and stays put", () => {
    const shape = {
        education: [school(key(2021, 9))],
        projects: [
            { id: "late", start: "2023-01", end: "2023-02" },
            { id: "early", start: "2022-09", end: "2022-10" }
        ]
    };
    assert.equal(careerStart(master(shape)), key(2021, 9));
    // Taking the earliest project off can't shorten the career and speed up the rest.
    const without = { ...shape, projects: shape.projects.slice(0, 1) };
    assert.equal(careerStart(master(without)), key(2021, 9));
});

test("over budget is a problem that says where the budget came from", () => {
    const start = key(2020, 1);
    const today = start + 63;
    const shape = (count) => ({
        education: [school(start)],
        roles: [job("job", today, 4, 0, { bullets: bullets(count) })]
    });
    const { problems } = budgetReport(master(shape(5)), { today });
    assert.equal(problems.length, 1);
    assert.match(
        problems[0],
        /^role "job": 5 CV bullets \(b0, b1, b2, b3, b4\), over its budget of 3: its 4 full-time months \(4 months at 40 hours a week\) are 6\.3% of the 64-month career, which earns 3\. Cut the weakest 2\.$/
    );
    assert.deepEqual(budgetReport(master(shape(3)), { today }).problems, []);
});

test("a role and its subprojects share one budget, and alt bullets don't count", () => {
    const start = key(2020, 1);
    const today = start + 63;
    const lab = {
        ...job("lab", today, 4, 0, { track: "research", bullets: bullets(1) }),
        subprojects: [{ id: "s", bullets: [...bullets(2), { id: "web", alt: true, text: "Hi." }] }]
    };
    const [problem] = budgetReport(master({ education: [school(start)], roles: [lab] }), {
        today
    }).problems;
    assert.match(problem, /^role "lab": 3 CV bullets \(b0, s\.b0, s\.b1\), over its budget of 2:/);
});

test("an entry out of budget lists everything that has to go with it", () => {
    const start = key(2020, 1);
    const today = start + 99;
    const shape = {
        education: [school(start)],
        projects: [
            {
                id: "big",
                name: "Big",
                start: ym(today - 30),
                end: "present",
                skills: ["Python", "Lambda"]
            },
            {
                id: "tiny",
                name: "Tiny Thing",
                start: ym(start + 50),
                end: ym(start + 50),
                skills: ["Java", "EC2"],
                bullets: bullets(1)
            }
        ],
        skills: {
            languages: { label: "Languages", items: ["Python", "Java"] },
            systems: { label: "Systems", items: ["AWS (EC2, Lambda)"] }
        }
    };
    const pages = [
        {
            file: "tiny-thing.md",
            cv: "project/tiny",
            raw: '---\nlinks:\n  - { label: Code, href: "https://github.com/TylerFlar/tiny-thing" }\n---\n'
        },
        {
            file: "big.md",
            cv: "project/big",
            raw: "---\ntitle: Big\n---\nIt reads Tiny Thing's files."
        }
    ];
    const context = {
        pages,
        profile: { bio: "I built Tiny Thing once.", githubBio: "Code." },
        website: "publications:\n  - id: paper\n    project: /projects/tiny-thing/\n"
    };
    const { problems } = budgetReport(master(shape), { today, ...context });
    assert.equal(problems.length, 1);
    const lines = problems[0].split("\n");
    assert.match(
        lines[0],
        /^project "tiny" is out of budget: its 0\.5 full-time months \(1 month at 20 hours a week\) are 0\.5% of the 100-month career, which earns 1, and it has lost 1 since it ended in 2024-03, one for each quarter of the career since\. Take it off everywhere:$/
    );
    assert.deepEqual(lines.slice(1), [
        "  - delete it from _resumes/data/master.yaml",
        "  - delete src/content/projects/tiny-thing.md",
        '  - take these skills off, since nothing else backs them: Java (skills.languages) and EC2 in "AWS (EC2, Lambda)" (skills.systems)',
        "  - update the places that name or link it: _resumes/data/website.yaml, _resumes/data/profile.yaml (bio) and src/content/projects/big.md",
        "  - on GitHub, unpin github.com/TylerFlar/tiny-thing if it's pinned, and clear its homepage if it points at the page",
        "  - run npm run cv, then npm run profiles, and update LinkedIn to match"
    ]);
});

test("a role out of budget names its CV pick, its homepage touch and the short name it goes by", () => {
    const start = key(2020, 1);
    const today = start + 99;
    const intern = job("intern", today, 1, 60, {
        org: "Acme Robotics Corporation",
        bullets: bullets(1)
    });
    const { problems } = budgetReport(master({ education: [school(start)], roles: [intern] }), {
        today,
        profile: { linkedinHeadline: "Interned at Acme and elsewhere" },
        website: "experience:\n  intern: { workType: Hybrid }\n",
        cv: "sections:\n  - Industry Experience:\n      intern: all\n"
    });
    assert.match(
        problems[0],
        /update the places that name or link it: _resumes\/data\/cv\.yaml, _resumes\/data\/website\.yaml and _resumes\/data\/profile\.yaml \(linkedinHeadline\)/
    );
});

test("a budget due to drop within three months is a note first", () => {
    const start = key(2020, 1);
    // A month at half time, ended at month 29: it runs out at month 39.
    const tiny = { id: "tiny", start: ym(start + 29), end: ym(start + 29), bullets: bullets(1) };
    const out = budgetReport(master({ education: [school(start)], projects: [tiny] }), {
        today: start + 37
    });
    assert.deepEqual(out.problems, []);
    assert.deepEqual(out.notes, [
        `project "tiny" runs out of budget in ${ym(start + 39)}, so it comes off the CV then.`
    ]);
    // Two months at half time earns 2 until the career passes 64 months.
    const pair = { id: "pair", start: ym(start + 59), end: ym(start + 60), bullets: bullets(2) };
    const drop = budgetReport(master({ education: [school(start)], projects: [pair] }), {
        today: start + 62
    });
    assert.deepEqual(drop.notes, [
        `project "pair": its budget drops from 2 to 1 in ${ym(start + 64)}, under its 2 CV bullets.`
    ]);
    // Further out than three months, it's not a note yet.
    assert.deepEqual(
        budgetReport(master({ education: [school(start)], projects: [tiny] }), {
            today: start + 35
        }).notes,
        []
    );
});

test("a degree's class-only skills decay like one class from the degree's end", () => {
    const start = key(2020, 1);
    const shape = (end) => ({
        education: [{ id: "bs", start: ym(start), end, skills: ["Haskell"] }],
        projects: [{ id: "app", start: ym(start), end: "present", skills: ["Python"] }],
        skills: { languages: { label: "Languages", items: ["Python", "Haskell"] } }
    });
    const today = start + 62;
    const { problems } = budgetReport(master(shape(ym(start + 41))), { today });
    assert.deepEqual(problems, [
        'education "bs" classwork is out of budget: its classes count as half a full-time ' +
            "month, 0.8% of the 63-month career, which earns 1, and it has lost 1 since the " +
            "degree ended in 2023-06. Delete the degree's skills list, and take these off " +
            "skills, since nothing else backs them: Haskell (skills.languages). Then run npm " +
            "run cv, then npm run profiles, and update LinkedIn's skills to match."
    ]);
    // A degree still going loses nothing.
    const going = budgetReport(master(shape(`expected ${ym(today + 6)}`)), { today });
    assert.deepEqual(going.problems, []);
    assert.equal(going.rows.find((row) => row.kind === "classwork").budget, 1);
});

test("tier is gone, and hoursPerWeek has to be a real week", () => {
    const p = { id: "p", start: "2026-01", end: "2026-04", bullets: [] };
    const rows = (shape) => () => budgetRows(master(shape), { today: key(2026, 10) });
    assert.throws(rows({ projects: [{ ...p, tier: "flagship" }] }), /"tier" is gone/);
    assert.throws(rows({ projects: [{ ...p, hoursPerWeek: 0 }] }), /"hoursPerWeek" is hours/);
    assert.throws(rows({ projects: [{ ...p, hoursPerWeek: "lots" }] }), /"hoursPerWeek" is hours/);
    const lab = {
        ...p,
        id: "lab",
        track: "research",
        subprojects: [{ id: "s", hoursPerWeek: 10, bullets: [] }]
    };
    assert.throws(rows({ roles: [lab] }), /lab"\/s: a subproject shares its role's budget/);
});

test("master.yaml holds to its budget today", (t) => {
    // The one check that reads the real date: when a month turns and an entry's
    // budget drops, this fails with what to cut. The notes say what's coming.
    const { problems, notes } = budgetReport(loadMaster(), budgetContext());
    for (const note of notes) t.diagnostic(`budget note: ${note}`);
    assert.equal(problems.length, 0, `\n${problems.join("\n\n")}`);
});
