"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { skillRank, courseRank, rankProblems } = require("./rank.js");

// The CV ranks its skills and courses by the work in master.yaml that shows
// them, not by a job: a point for each piece of work that lists a skill, one
// more where the work's words name it, ties to newer work, then to the
// record's order. These hold the rule and its messages to a small fixture
// and to fixed dates.

const skills = {
    languages: { label: "Languages", items: ["Python", "SQL", "Bash", "Rust"] },
    cloud: { label: "Cloud", items: ["AWS (EC2, Lambda, S3)", "Docker"] }
};

/** A project that lists `claims` and says `text`. */
const work = (id, start, end, claims, text = "Built it.") => ({
    id,
    start,
    end,
    skills: claims,
    bullets: [{ id: "b", text }]
});

const record = (projects, extra = {}) => ({
    skills,
    roles: [],
    volunteering: [],
    education: [],
    projects,
    ...extra
});

/** Each group's key and its skills with their scores, in rank order. */
const ranked = (master) =>
    skillRank(master).map((group) => [
        group.key,
        group.skills.map((skill) => `${skill.name} ${skill.score}`)
    ]);

/** A month as monthKey numbers it. */
const key = (year, month) => year * 12 + month - 1;

test("a skill scores a point for each piece of work that lists it, and one more where its words name it", () => {
    const master = record([
        work("a", "2026-01", "2026-03", ["Python", "Bash"], "Wrote it in Python."),
        work("b", "2025-01", "2025-03", ["Python", "SQL"], "Queried it in SQL."),
        work("c", "2024-01", "2024-03", ["Rust"], "Ported it to Rust.")
    ]);
    const [languages] = ranked(master).filter(([group]) => group === "languages");
    // SQL is named once and outranks Bash, which newer work only lists, and
    // ties Rust, which goes second for its older work.
    assert.deepEqual(languages[1], ["Python 3", "SQL 2", "Rust 2", "Bash 1"]);
});

test("ties go to newer work, then to master.yaml's order", () => {
    const master = record([
        work("a", "2026-01", "2026-03", ["Bash", "Python"]),
        work("b", "2020-01", "2020-03", ["SQL"])
    ]);
    const [languages] = ranked(master).filter(([group]) => group === "languages");
    assert.deepEqual(languages[1], ["Python 1", "Bash 1", "SQL 1", "Rust 0"]);
});

test("a name in a skill's parentheses ranks by the work that lists it", () => {
    const master = record([
        work("a", "2026-01", "2026-03", ["Lambda", "S3"], "Ran it on AWS Lambda."),
        // The whole skill, parentheses and all, lists every name in them.
        work("b", "2025-01", "2025-03", ["AWS (EC2, Lambda, S3)"], "Searched it on AWS EC2.")
    ]);
    const aws = skillRank(master)
        .find((group) => group.key === "cloud")
        .skills.find((skill) => skill.name === "AWS");
    assert.equal(aws.score, 4);
    assert.deepEqual(
        aws.listed.map((name) => `${name.name} ${name.score}`),
        ["Lambda 3", "S3 2", "EC2 2"]
    );
});

test("a skill group ranks by the work that lists any of its skills", () => {
    const master = record([
        work("a", "2026-01", "2026-03", ["Python", "Docker"]),
        work("b", "2025-01", "2025-03", ["Docker"]),
        work("c", "2024-01", "2024-03", ["Lambda"], "Ran it on AWS Lambda.")
    ]);
    assert.deepEqual(
        skillRank(master).map((group) => `${group.key} ${group.score}`),
        ["cloud 4", "languages 1"]
    );
});

test("a course ranks by the work whose words name its code", () => {
    const master = record(
        [
            { ...work("x", "2025-01", "2025-03", ["Python"]), tagline: "A CSE 2 project" },
            { ...work("y", "2025-04", "2025-06", ["Python"]), tagline: "The CSE 3 project" },
            work("z", "2024-10", "2024-12", ["Python"], "Took what CSE 2 taught into it."),
            // CSE 21 isn't CSE 2.
            work("w", "2026-01", "2026-03", ["Python"], "Tutored CSE 21.")
        ],
        {
            education: [
                {
                    id: "ms",
                    start: "2024-09",
                    end: "expected 2026-06",
                    coursework: ["CSE 1 One", "CSE 3 Three", "CSE 2 Two"]
                }
            ]
        }
    );
    assert.deepEqual(
        courseRank(master).map((course) => `${course.code} ${course.score}`),
        ["CSE 2 2", "CSE 3 1", "CSE 1 0"]
    );
});

// A CV-shaped document: its skill groups, and coursework under its degree.
const doc = (groups, coursework) => ({
    sections: [
        { kind: "skills", groups: groups.map(([label, items]) => ({ label, items })) },
        ...(coursework
            ? [{ kind: "education", entries: [{ kind: "education", id: "ms", coursework }] }]
            : [])
    ]
});

// Everything in budget on 2026-03: the degree makes the career long enough
// that a project that ended six months back still has its bullet.
const recent = record(
    [
        work("a", "2026-01", "2026-03", ["Python", "Bash", "Docker"], "Wrote it in Python."),
        work(
            "b",
            "2025-10",
            "2025-12",
            ["Python", "SQL", "Lambda", "S3"],
            "Ran SQL on AWS Lambda."
        ),
        work("c", "2025-07", "2025-09", ["Rust", "EC2"], "Ported it to Rust.")
    ],
    { education: [{ id: "bs", start: "2020-01", end: "2024-01" }] }
);
const march = { today: key(2026, 3) };

test("the CV prints the top of each list in rank order", () => {
    // Languages: Python 3, SQL 2, Rust 2, Bash 1. Cloud: AWS 3 (Lambda 2,
    // S3 1, EC2 1), Docker 1. Languages' work names its skills more.
    const top = [
        ["Languages", ["Python", "SQL"]],
        ["Cloud", ["AWS (Lambda, S3)"]]
    ];
    assert.deepEqual(rankProblems(recent, doc(top), march), []);

    const [problem] = rankProblems(recent, doc([top[1], top[0]]), march);
    assert.match(
        problem,
        /^cv\.yaml Skills: .* so list \[languages, cloud\]\. It has \[cloud, languages\]/
    );

    const [notTop] = rankProblems(recent, doc([["Languages", ["Python", "Rust"]]]), march);
    assert.match(
        notTop,
        /^cv\.yaml Skills languages: .* so list \[Python, SQL\]\. It has \[Python, Rust\]/
    );
    assert.match(notTop, /The rank: Python 3, SQL 2, Rust 2, Bash 1\.$/);

    const [names] = rankProblems(
        recent,
        doc([
            ["Languages", ["Python"]],
            ["Cloud", ["AWS (EC2, Lambda)"]]
        ]),
        march
    );
    assert.match(names, /print the top of AWS's parentheses in rank order, "AWS \(Lambda, S3\)"/);
});

test("the CV's picks skip a skill that only out-of-budget work backs", () => {
    // c ended in 2015, so by 2026-10 it's out of budget, and Rust and EC2,
    // which only c lists, can't print, however they rank.
    const master = record([
        work("a", "2026-01", "2026-03", ["Python", "Bash", "Docker"], "Wrote it in Python."),
        work(
            "b",
            "2025-01",
            "2025-03",
            ["Python", "SQL", "Lambda", "S3"],
            "Ran SQL on AWS Lambda."
        ),
        work("c", "2015-01", "2015-03", ["Rust", "EC2"], "Ported it to Rust.")
    ]);
    const october = { today: key(2026, 10) };
    const picks = [
        ["Languages", ["Python", "SQL", "Bash"]],
        ["Cloud", ["AWS (Lambda, S3)", "Docker"]]
    ];
    assert.deepEqual(rankProblems(master, doc(picks), october), []);
});

test("the CV prints the top courses in rank order", () => {
    const master = {
        ...recent,
        projects: [
            { ...recent.projects[0], tagline: "A CSE 2 project" },
            { ...recent.projects[1], tagline: "A CSE 3 project" },
            recent.projects[2]
        ],
        education: [
            {
                id: "ms",
                start: "2025-01",
                end: "expected 2026-06",
                coursework: ["CSE 1 One", "CSE 3 Three", "CSE 2 Two"]
            }
        ]
    };
    const top = [
        ["Languages", ["Python"]],
        ["Cloud", ["AWS (Lambda)"]]
    ];
    assert.deepEqual(rankProblems(master, doc(top, ["CSE 2 Two", "CSE 3 Three"]), march), []);
    const [problem] = rankProblems(master, doc(top, ["CSE 3 Three", "CSE 1 One"]), march);
    assert.match(
        problem,
        /^cv\.yaml coursework: .* so list \[CSE 2, CSE 3\]\. It has \[CSE 3, CSE 1\]\. The rank: CSE 2 1, CSE 3 1, CSE 1 0\.$/
    );
});

test("a paper counts as a piece of work, by its title, its note and its one date", () => {
    const master = record([work("a", "2025-01", "2025-03", ["Python"])], {
        publications: [
            { id: "p", title: "Rust at Scale", date: "2026-07", note: "My part.", skills: ["Rust"] }
        ]
    });
    const [languages] = ranked(master).filter(([group]) => group === "languages");
    // Rust is listed by the paper and named in its title. Nothing lists SQL or Bash.
    assert.deepEqual(languages[1], ["Rust 2", "Python 1", "SQL 0", "Bash 0"]);
});
