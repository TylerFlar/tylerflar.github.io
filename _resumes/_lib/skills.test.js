"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSkillClaims, onlyBackedBy } = require("./skills.js");
const { loadMaster } = require("./load.js");

// Every skill on the CV falls under the entries that show it: each entry names
// its skills, every skill needs one, and so does each name in a skill's
// parentheses, so taking an entry off takes its skills with it. These hold the
// rule to a small fixture.

const skills = {
    languages: { label: "Languages", items: ["Python", "JavaScript/TypeScript", "C/C++", "SQL"] },
    data: { label: "Data", items: ["SQL Server"] },
    systems: { label: "Systems", items: ["GitHub Actions", "GitHub Pages", "AWS (EC2, Lambda)"] }
};

/** Projects named by id, each claiming its list. */
const master = (claims, extra = {}) => ({
    skills,
    roles: [],
    volunteering: [],
    education: [],
    projects: Object.entries(claims).map(([id, list]) => ({ id, skills: list })),
    ...extra
});

// Every skill backed, by full names and by names in them.
const all = [
    "Python",
    "TypeScript",
    "C++",
    "SQL",
    "SQL Server",
    "GitHub Actions",
    "GitHub Pages",
    "EC2",
    "Lambda"
];
const without = (name) => all.filter((claim) => claim !== name);

test("a claim names a skill by its full name or by any name in it", () => {
    assert.doesNotThrow(() => validateSkillClaims(master({ app: all })));
    // "SQL" is a whole skill and also the first word of SQL Server: the full name wins.
    assert.doesNotThrow(() =>
        validateSkillClaims(master({ app: without("SQL Server"), db: ["SQL Server"] }))
    );
});

test("a claim that could be two skills, or none, fails with what to write", () => {
    assert.throws(
        () => validateSkillClaims(master({ app: [...all, "GitHub"] })),
        /project "app" skills: "GitHub" could be "GitHub Actions" or "GitHub Pages"; write the full name/
    );
    assert.throws(
        () => validateSkillClaims(master({ app: [...all, "Pyhton"] })),
        /"Pyhton" isn't a skill on the CV\. Check the spelling, or add it to skills first\./
    );
    assert.throws(
        () => validateSkillClaims(master({ app: [...all, "Java"] })),
        /"Java" isn't a skill on the CV\. Did you mean "JavaScript\/TypeScript"\?/
    );
});

test("every skill needs an entry behind it", () => {
    assert.throws(
        () => validateSkillClaims(master({ app: without("SQL Server") })),
        /master\.yaml skills\.data: no entry backs "SQL Server"\. Name it in the skills of an entry that shows it, or take it off the CV\./
    );
});

test("each name in parentheses needs its own backer, unless the full name is claimed", () => {
    assert.throws(
        () => validateSkillClaims(master({ app: without("EC2") })),
        /no entry backs EC2 in "AWS \(EC2, Lambda\)"\. Name EC2 in the skills of an entry that used it, or take it out of the parentheses\./
    );
    // The bare name backs the skill but not what's in its parentheses.
    const bare = [...without("EC2").filter((claim) => claim !== "Lambda"), "AWS"];
    assert.throws(
        () => validateSkillClaims(master({ app: bare })),
        /no entry backs EC2[^]*no entry backs Lambda/
    );
    const full = [...without("EC2").filter((claim) => claim !== "Lambda"), "AWS (EC2, Lambda)"];
    assert.doesNotThrow(() => validateSkillClaims(master({ app: full })));
});

test("a skills list names each skill once", () => {
    assert.throws(
        () => validateSkillClaims(master({ app: [...all, "Python"] })),
        /project "app" skills: "Python" names "Python" a second time/
    );
    assert.throws(
        () => validateSkillClaims(master({ app: [...all, "C/C++"] })),
        /"C\/C\+\+" names "C\/C\+\+" a second time/
    );
    assert.throws(
        () => validateSkillClaims(master({ app: "Python" })),
        /project "app" skills: list the CV skills it shows, by name, or leave "skills" out/
    );
});

test("subprojects and degrees back skills too, a subproject's falling under its role", () => {
    const role = {
        id: "lab",
        subprojects: [{ id: "rig", skills: ["SQL Server"] }]
    };
    const degree = { id: "ms", skills: ["Lambda"] };
    const doc = master(
        { app: without("SQL Server").filter((claim) => claim !== "Lambda") },
        { roles: [role], education: [degree] }
    );
    assert.doesNotThrow(() => validateSkillClaims(doc));
    assert.deepEqual(
        onlyBackedBy(doc, [role]).map(({ item, owners }) => [
            item,
            owners.map((owner) => owner.id)
        ]),
        [["SQL Server", ["lab"]]]
    );
});

test("what only some entries back is what comes off with them", () => {
    const doc = master({
        small: ["SQL Server", "EC2", "Python"],
        big: without("SQL Server").filter((claim) => claim !== "EC2")
    });
    const [small, big] = doc.projects;
    assert.deepEqual(
        onlyBackedBy(doc, [small]).map(({ item, name }) => [item, name]),
        [
            ["SQL Server", null],
            ["AWS (EC2, Lambda)", "EC2"]
        ]
    );
    // Python has another backer, so it stays until both go.
    assert.ok(onlyBackedBy(doc, [small, big]).some(({ item }) => item === "Python"));
});

test("master.yaml's skills are all backed", () => {
    // loadMaster runs the same check and fails the build on a gap.
    assert.doesNotThrow(() => validateSkillClaims(loadMaster()));
});
