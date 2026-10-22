"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMaster, validateMaster, resolveCv } = require("./load.js");

// The CV's structural rules, held to small fixtures so each failure message is
// pinned: roles print under one section per track, and nothing is dead content.

/** A minimal master.yaml that passes every rule; tests break one thing each. */
function fixture() {
    return {
        sections: [
            { title: "Education", kind: "education" },
            { title: "Research Experience", kind: "role", track: "research" },
            { title: "Projects", kind: "project" },
            { title: "Publications", kind: "publication" },
            { title: "Industry Experience", kind: "role", track: "industry" },
            { title: "Volunteering", kind: "volunteer" },
            { title: "Skills", kind: "skills" }
        ],
        education: [
            {
                id: "ms",
                school: "School",
                degree: "Master's",
                field: "CS",
                start: "2025-04",
                end: "expected 2027-03"
            }
        ],
        roles: [
            {
                id: "lab",
                org: "Lab",
                title: "Lab Member",
                track: "research",
                start: "2025-09",
                end: "2026-06",
                bullets: [{ id: "a", text: "Built a thing." }]
            },
            {
                id: "co",
                org: "Company",
                title: "Intern",
                track: "industry",
                start: "2025-05",
                end: "2025-09",
                bullets: [{ id: "a", text: "Shipped a thing." }]
            }
        ],
        projects: [],
        publications: [],
        volunteering: [],
        skills: { languages: { label: "Languages", items: ["Python"] } }
    };
}

test("the fixture passes, so each test below fails for its one reason", () => {
    assert.doesNotThrow(() => validateMaster(fixture()));
});

test("a role without a track fails and lists the tracks", () => {
    const doc = fixture();
    delete doc.roles[1].track;
    assert.throws(
        () => validateMaster(doc),
        /role "co": add "track: research \| industry \| teaching", the CV section it prints under/
    );
});

test("a role section must name a track, and only role sections take one", () => {
    const missing = fixture();
    delete missing.sections[1].track;
    assert.throws(() => validateMaster(missing), /sections\[1\]: a role section needs "track:/);

    const misplaced = fixture();
    misplaced.sections[2].track = "research";
    assert.throws(
        () => validateMaster(misplaced),
        /sections\[2\]: "track" only applies to role sections/
    );
});

test("a track gets one section, and a role's track must have one", () => {
    const twice = fixture();
    twice.sections.push({ title: "More Research", kind: "role", track: "research" });
    assert.throws(() => validateMaster(twice), /a second section for track "research"/);

    const orphan = fixture();
    orphan.roles[1].track = "teaching";
    assert.throws(
        () => validateMaster(orphan),
        /role "co": track "teaching" has no section, so the role would be off the CV/
    );
});

test("a role section with no roles on its track fails as dead content", () => {
    const doc = fixture();
    doc.sections.push({ title: "Teaching", kind: "role", track: "teaching" });
    assert.throws(() => validateMaster(doc), /the "teaching" role section has no roles/);
});

test("the CV prints each role under its track's section, in file order", () => {
    const cv = resolveCv(validateMaster(fixture()));
    const ids = (title) => cv.sections.find((s) => s.title === title).entries.map((e) => e.id);
    assert.deepEqual(ids("Research Experience"), ["lab"]);
    assert.deepEqual(ids("Industry Experience"), ["co"]);
});

test("every role in master.yaml prints exactly once", () => {
    const master = loadMaster();
    const printed = resolveCv(master)
        .sections.filter((section) => section.kind === "role")
        .flatMap((section) => section.entries.map((entry) => entry.id));
    assert.deepEqual([...printed].sort(), master.roles.map((role) => role.id).sort());
});
