"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    budgetProblems,
    budgetRows,
    pageNotes,
    pageProblems,
    careerStart,
    HOURS_BY_KIND,
    CAREER_SHARE,
    QUARTERS,
    FIRST_AUTHOR_FTE,
    authorPlace,
    HEADS_UP_MONTHS
} = require("./budget.js");
const { loadMaster, ROLE_TRACKS } = require("./load.js");
const { resolvePublicCv } = require("./cv.js");
const { loadProjectPages } = require("./pages.js");

// The bullet budget is measured against the career: an entry earns a bullet for
// each doubling of its share of the career, and once it ends, loses one for
// each quarter of the career since. It limits what a document prints, not what
// master.yaml holds: printing past it, or printing an entry or a skill that's
// out of it, fails the checks. These pin the rule and its messages to fixed
// dates; the last test is the one that reads today's.

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
    // A project's week is measured from commits (npm run hours), the rest are typical.
    assert.deepEqual(HOURS_BY_KIND, {
        industry: 40,
        research: 20,
        project: 3,
        teaching: 10,
        volunteer: 10,
        "self-employed": 10
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
                job("half", today, 1, 0, { track: "research" }),
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

/** A resolved document (the CV or a resume) that prints these entries, and these skills. */
const printing = (entries, groups = []) => ({
    sections: [{ kind: "entries", entries }, ...(groups.length ? [{ kind: "skills", groups }] : [])]
});
const shown = (kind, id, count, subprojects = []) => ({
    kind,
    id,
    bullets: bullets(count),
    subprojects
});

test("master.yaml holds as many bullets as an entry has, and a document prints within budget", () => {
    const start = key(2020, 1);
    const today = start + 63;
    const record = master({
        education: [school(start)],
        roles: [job("job", today, 4, 0, { bullets: bullets(9) })]
    });
    // Nine bullets in the record is fine: the budget of 3 is on what prints.
    assert.deepEqual(
        budgetProblems(record, printing([shown("role", "job", 3)]), { today }).problems,
        []
    );
    const { problems } = budgetProblems(record, printing([shown("role", "job", 5)]), { today });
    assert.equal(problems.length, 1);
    assert.match(
        problems[0],
        /^role "job": 5 bullets on this resume \(b0, b1, b2, b3, b4\), over its budget of 3: its 4 full-time months \(4 months at 40 hours a week\) are 6\.3% of the 64-month career, which earns 3\. Cut the weakest 2\.$/
    );
    const cv = budgetProblems(record, printing([shown("role", "job", 4)]), { today, cv: true });
    assert.match(
        cv.problems[0],
        /^role "job": 4 bullets on the CV \(b0, b1, b2, b3\), over its budget of 3:/
    );
});

test("a role and its subprojects share one budget on what prints", () => {
    const start = key(2020, 1);
    const today = start + 63;
    const lab = job("lab", today, 4, 0, { track: "research" });
    const doc = printing([shown("role", "lab", 1, [{ id: "s", bullets: bullets(2) }])]);
    const [problem] = budgetProblems(master({ education: [school(start)], roles: [lab] }), doc, {
        today
    }).problems;
    assert.match(
        problem,
        /^role "lab": 3 bullets on this resume \(b0, s\.b0, s\.b1\), over its budget of 2:/
    );
});

test("an entry out of budget can't print, and stays in master.yaml", () => {
    const start = key(2020, 1);
    const today = start + 99;
    const record = master({
        education: [school(start)],
        projects: [
            { id: "big", start: ym(today - 30), end: "present", skills: ["Python", "Lambda"] },
            {
                id: "tiny",
                start: ym(start + 50),
                end: ym(start + 50),
                skills: ["Java", "EC2"],
                bullets: bullets(1)
            }
        ],
        skills: {
            languages: { label: "Languages", items: ["Python", "Java"] },
            cloud: { label: "Cloud", items: ["AWS (EC2, Lambda)"] }
        }
    });
    // Off the document, it's no problem at all.
    assert.deepEqual(
        budgetProblems(record, printing([shown("project", "big", 1)]), { today }).problems,
        []
    );
    const { problems } = budgetProblems(
        record,
        printing(
            [shown("project", "tiny", 0)],
            [
                { label: "Languages", items: ["Python", "Java"] },
                { label: "Cloud", items: ["AWS (Lambda)"] }
            ]
        ),
        { today, cv: true }
    );
    assert.deepEqual(problems, [
        'project "tiny" is out of budget, so the CV can\'t print it: its 0.1 full-time months (1 month at 3 hours a week) are 0.1% of the 100-month career, which earns 1, and it has lost 1 since it ended in 2024-03, one for each quarter of the career since. Take it off the CV, under off.room in cv.yaml. It stays in master.yaml, and its page comes off the site.',
        "Java (skills.languages) only comes from work that's out of budget (project \"tiny\"), so the CV can't print it. Move it to off.skills in cv.yaml."
    ]);
    // EC2 is only tiny's too, but "AWS (Lambda)" doesn't print it.
    const ec2 = budgetProblems(
        record,
        printing([], [{ label: "Cloud", items: ["AWS (EC2, Lambda)"] }]),
        { today }
    ).problems;
    assert.deepEqual(ec2, [
        'EC2 in "AWS (EC2, Lambda)" (skills.cloud) only comes from work that\'s out of budget (project "tiny"), so this resume can\'t print it. Take it off this resume\'s skills.'
    ]);
});

test("a budget due to drop under what prints within three months is a note first", () => {
    const start = key(2020, 1);
    // A one-month project, ended at month 29: it runs out at month 39.
    const tiny = {
        id: "tiny",
        start: ym(start + 29),
        end: ym(start + 29),
        bullets: bullets(1)
    };
    const record = master({ education: [school(start)], projects: [tiny] });
    const out = budgetProblems(record, printing([shown("project", "tiny", 1)]), {
        today: start + 37,
        cv: true
    });
    assert.deepEqual(out.problems, []);
    assert.deepEqual(out.notes, [
        `project "tiny" runs out of budget in ${ym(start + 39)}, so it comes off the CV then.`
    ]);
    // Off the document, nothing to note.
    assert.deepEqual(budgetProblems(record, printing([]), { today: start + 37 }).notes, []);
    // Two months of research, at 20 hours a week, earn 2 until the career
    // passes 64 months.
    const pair = {
        id: "pair",
        track: "research",
        start: ym(start + 59),
        end: ym(start + 60),
        bullets: bullets(5)
    };
    const drop = budgetProblems(
        master({ education: [school(start)], roles: [pair] }),
        printing([shown("role", "pair", 2)]),
        { today: start + 62, cv: true }
    );
    assert.deepEqual(drop.notes, [
        `role "pair": its budget drops from 2 to 1 in ${ym(start + 64)}, under its 2 bullets on the CV.`
    ]);
    // Further out than three months, it's not a note yet.
    assert.deepEqual(
        budgetProblems(record, printing([shown("project", "tiny", 1)]), { today: start + 35 })
            .notes,
        []
    );
});

test("a page comes off the site when its entry runs out of budget, with a note first", () => {
    const start = key(2020, 1);
    // A one-month project, ended at month 29: it runs out at month 39.
    const tiny = { id: "tiny", start: ym(start + 29), end: ym(start + 29) };
    const going = { id: "going", start: ym(start + 20), end: "present" };
    // A lab role that ended with tiny runs for years yet, and so does its subproject's page.
    const lab = {
        id: "lab",
        track: "research",
        start: ym(start + 10),
        end: ym(start + 29),
        subprojects: [{ id: "rig" }]
    };
    const record = master({ education: [school(start)], roles: [lab], projects: [tiny, going] });
    const pages = [
        { file: "tiny.md", cv: "project/tiny" },
        { file: "going.md", cv: "project/going" },
        { file: "rig.md", cv: "role/lab/rig" }
    ];
    // Further out than three months, nothing to say.
    assert.deepEqual(pageNotes(record, pages, { today: start + 35 }), []);
    assert.deepEqual(pageNotes(record, pages, { today: start + 37 }), [
        `project "tiny" runs out of budget in ${ym(start + 39)}, so its page (tiny.md) comes off the site then.`
    ]);
    assert.deepEqual(pageNotes(record, pages, { today: start + 39 }), [
        'project "tiny" is out of budget, so its page (tiny.md) comes off the site: delete it and its pictures.'
    ]);
    // A paper that came out of tiny changes nothing for the page: the paper has
    // a budget of its own, and the project's page still goes with the project's.
    const withPaper = {
        ...record,
        publications: [{ id: "paper", authors: "**Me** and A. Other", date: ym(start + 45) }]
    };
    assert.equal(pageNotes(withPaper, pages, { today: start + 46 }).length, 1);
    const paper = budgetRows(withPaper, { today: start + 46 }).find(
        (row) => row.kind === "publication"
    );
    assert.ok(paper.budget > 0, "the paper is in budget after its project ran out");
});

test("my place among a paper's authors is where my name is bolded", () => {
    const place = (authors) => authorPlace({ id: "p", authors });
    assert.deepEqual(place("**Me**"), { place: 1, of: 1 });
    assert.deepEqual(place("A. One and **Me**"), { place: 2, of: 2 });
    assert.deepEqual(place("A. One, B. Two, **Me**, C. Four, and D. Five"), { place: 3, of: 5 });
    for (const authors of ["A. One and B. Two", "**Me** and **Me Again**", undefined]) {
        assert.throws(
            () => place(authors),
            /publication "p": bold your own name in "authors", once/
        );
    }
});

test("a paper is weighed by itself, by my place among its authors", () => {
    assert.equal(FIRST_AUTHOR_FTE, 12);
    // The real case's months: a career from 2021-09 and a paper in 2026-07,
    // out of a project that ended a year before and has run out.
    const start = key(2021, 9);
    const date = key(2026, 7);
    const month = (text) => key(...text.split("-").map(Number));
    const robot = { id: "robot", start: "2025-04", end: "2025-06", skills: ["ROS"] };
    const others = ["A. One", "B. Two", "C. Three", "D. Four", "E. Five", "F. Six", "G. Seven"];
    // Me at `place` among eight authors.
    const paperAt = (place) => ({
        id: "paper",
        authors: [...others.slice(0, place - 1), "**Me**", ...others.slice(place - 1)].join(", "),
        date: ym(date),
        skills: ["ROS"]
    });
    const recordAt = (place) =>
        master({
            education: [school(start)],
            projects: [robot],
            publications: [paperAt(place)],
            skills: { robotics: { label: "Robotics", items: ["ROS"] } }
        });
    const rowIn = (place, text) =>
        budgetRows(recordAt(place), { today: month(text) }).find(
            (row) => row.kind === "publication"
        );
    // A year's work as first author, and a year over the place after that.
    assert.deepEqual(
        [1, 2, 3, 8].map((place) => rowIn(place, "2026-07").fte),
        [12, 6, 4, 1.5]
    );
    // The month each goes out of budget: the first author's lasts about fifteen
    // years, and the eighth's about three.
    const lasts = { 1: "2041-04", 2: "2032-05", 3: "2031-06", 6: "2031-06", 8: "2029-09" };
    for (const [place, out] of Object.entries(lasts)) {
        assert.ok(rowIn(Number(place), ym(month(out) - 1)).budget > 0, `place ${place} before`);
        assert.equal(rowIn(Number(place), out).budget, 0, `place ${place} is out in ${out}`);
    }
    // Third of eight, as CHASER has me: 4 full-time months earn 3, it loses one
    // a quarter of the career after it came out, drops to earning 2 as the
    // career grows, and loses the second when as much of the career lies after
    // it as before.
    const record = recordAt(3);
    assert.deepEqual(
        ["2026-07", "2028-02", "2028-03", "2028-09", "2028-10", "2031-05", "2031-06"].map(
            (text) => rowIn(3, text).budget
        ),
        [3, 3, 2, 2, 1, 1, 0]
    );
    // The project behind it is out by then, so the paper is what backs ROS.
    const doc = printing(
        [{ kind: "publication", id: "paper" }],
        [{ label: "Robotics", items: ["ROS"] }]
    );
    const before = budgetProblems(record, doc, { today: key(2031, 3), cv: true });
    assert.deepEqual(before.problems, []);
    assert.deepEqual(before.notes, [
        'publication "paper" runs out of budget in 2031-06, so it comes off the CV then.',
        "ROS (skills.robotics) can't print from 2031-06, when the last work behind it runs out of budget, so it comes off the CV then."
    ]);
    assert.deepEqual(budgetProblems(record, doc, { today: key(2031, 6), cv: true }).problems, [
        'publication "paper" is out of budget, so the CV can\'t print it: as 3rd of its 8 authors it counts as 4 full-time months, 3.4% of the 118-month career, which earns 2, and it has lost 2 since it came out in 2026-07, one for each quarter of the career since. Take it off the CV, under off.room in cv.yaml. It stays in master.yaml.',
        'ROS (skills.robotics) only comes from work that\'s out of budget (project "robot" and publication "paper"), so the CV can\'t print it. Move it to off.skills in cv.yaml.'
    ]);
});

test("a project in budget needs a page, and one out of budget doesn't", () => {
    const start = key(2020, 1);
    const tiny = { id: "tiny", start: ym(start + 29), end: ym(start + 29) };
    const going = { id: "going", start: ym(start + 20), end: "present" };
    // A role needs no page of its own.
    const lab = { id: "lab", track: "research", start: ym(start + 10), end: ym(start + 29) };
    const record = master({ education: [school(start)], roles: [lab], projects: [tiny, going] });
    const page = (id, extra = {}) => ({ file: `${id}.md`, cv: `project/${id}`, ...extra });
    const missing = (id, budget) =>
        `project "${id}" has a bullet budget of ${budget} and no page on the site. Every project a document can print has one: write its page in src/content/projects/, with "cv: project/${id}" in the front matter.`;
    assert.deepEqual(
        pageProblems(record, [page("tiny"), page("going")], { today: start + 37 }),
        []
    );
    assert.deepEqual(pageProblems(record, [page("going")], { today: start + 37 }), [
        missing("tiny", 1)
    ]);
    // Out of budget at month 39, tiny needs none.
    assert.deepEqual(pageProblems(record, [page("going")], { today: start + 39 }), []);
    // A draft isn't on the site. (Going has run 18 months, which earns its 2nd bullet.)
    assert.deepEqual(
        pageProblems(record, [page("tiny"), page("going", { draft: true })], { today: start + 37 }),
        [missing("going", 2)]
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
    const doc = printing([], [{ label: "Languages", items: ["Python", "Haskell"] }]);
    const { problems } = budgetProblems(master(shape(ym(start + 41))), doc, { today, cv: true });
    assert.deepEqual(problems, [
        "Haskell (skills.languages) only comes from work that's out of budget (education \"bs\" classwork), so the CV can't print it. Move it to off.skills in cv.yaml."
    ]);
    // A degree still going loses nothing.
    const going = budgetProblems(master(shape(`expected ${ym(today + 6)}`)), doc, { today });
    assert.deepEqual(going.problems, []);
    const rows = budgetRows(master(shape(`expected ${ym(today + 6)}`)), { today });
    assert.equal(rows.find((row) => row.kind === "classwork").budget, 1);
});

test("tier and hoursPerWeek are gone, since the kind of work gives the week", () => {
    const p = { id: "p", start: "2026-01", end: "2026-04", bullets: [] };
    const rows = (shape) => () => budgetRows(master(shape), { today: key(2026, 10) });
    assert.throws(rows({ projects: [{ ...p, tier: "flagship" }] }), /"tier" is gone/);
    assert.throws(
        rows({ projects: [{ ...p, hoursPerWeek: 20 }] }),
        /project "p": "hoursPerWeek" is gone\. The kind of work gives the week now, 3 hours for this one, so delete it\./
    );
    // Every track a role can take has a week, since nothing else can give one.
    for (const track of ROLE_TRACKS) {
        assert.ok(HOURS_BY_KIND[track] > 0, `a typical week for the ${track} track`);
    }
    const lab = {
        ...p,
        id: "lab",
        track: "research",
        subprojects: [{ id: "s", hoursPerWeek: 10, bullets: [] }]
    };
    assert.throws(rows({ roles: [lab] }), /lab"\/s: a subproject shares its role's budget/);
});

test("the CV holds to its budget today", (t) => {
    // The one check that reads the real date: when a month turns and an entry's
    // budget drops under what the CV prints, this fails with what to cut. The
    // notes say what's coming.
    const record = loadMaster();
    const { problems, notes } = budgetProblems(record, resolvePublicCv(record), { cv: true });
    // The pages due off the site are notes too: they never fail, since a month
    // turning over shouldn't stop the site, and deleting a page is a person's step.
    const pages = pageNotes(record, loadProjectPages());
    for (const note of [...notes, ...pages]) t.diagnostic(`budget note: ${note}`);
    assert.equal(problems.length, 0, `\n${problems.join("\n\n")}`);
});

test("every project in budget has a page on the site", () => {
    // It reads today's date too, but it can only fail when a project is recorded
    // without a page: a budget never comes back as the months pass.
    const missing = pageProblems(loadMaster(), loadProjectPages());
    assert.equal(missing.length, 0, `\n${missing.join("\n\n")}`);
});
