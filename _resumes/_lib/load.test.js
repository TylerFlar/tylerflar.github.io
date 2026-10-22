"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
    loadMaster,
    validateMaster,
    resolveCv,
    resolveVariant,
    loadProfile,
    validateProfile
} = require("./load.js");
const { renderVariantTex } = require("./render-tex.js");

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

/** The fixture plus a Research Interests line and its section. */
function withInterests(text = "Robot perception and navigation, field robotics") {
    const doc = fixture();
    doc.sections.unshift({ title: "Research Interests", kind: "research-interests" });
    doc.researchInterests = text;
    return doc;
}

test("Research Interests needs its section, and the section needs it", () => {
    assert.doesNotThrow(() => validateMaster(withInterests()));
    const orphan = fixture();
    orphan.researchInterests = "Robotics";
    assert.throws(() => validateMaster(orphan), /is set but no section prints it/);
    const empty = withInterests();
    delete empty.researchInterests;
    assert.throws(() => validateMaster(empty), /the research-interests section needs this line/);
});

test("Research Interests stays a line of topics, not a summary", () => {
    assert.throws(
        () => validateMaster(withInterests("x".repeat(111))),
        /111 characters; keep it to 110/
    );
    assert.throws(() => validateMaster(withInterests("I build robots")), /leave out first person/);
    assert.throws(() => validateMaster(withInterests("Robots that help me")), /first person/);
    assert.throws(() => validateMaster(withInterests("Robot perception.")), /closing punctuation/);
    // "AI" contains a capital I but isn't first person.
    assert.doesNotThrow(() => validateMaster(withInterests("AI for robot navigation")));
});

test("the CV prints Research Interests and coursework as labelled lines", () => {
    const doc = withInterests();
    doc.education[0].coursework = ["CSE 1 Robots", "CSE 2 Vision"];
    const tex = renderVariantTex(resolveCv(validateMaster(doc)));
    assert.ok(
        tex.includes("\\resumeInterests[2pt]{Research Interests}{Robot perception"),
        "Research Interests prints as a labelled line"
    );
    assert.ok(
        tex.includes(
            "\\resumeSubHeadingListEnd\n  \\resumeInterests[0pt]{Relevant Coursework}{\\mbox{CSE 1 Robots}\\hspace"
        ),
        "coursework follows the Education list, outside it"
    );
});

test("coursework lives on one education entry, as a list of courses", () => {
    const twice = fixture();
    twice.education.push({ ...twice.education[0], id: "bs", start: "2021-09", end: "2025-03" });
    twice.education[0].coursework = ["CSE 1"];
    twice.education[1].coursework = ["CSE 2"];
    assert.throws(() => validateMaster(twice), /only one entry may list coursework/);
    const notList = fixture();
    notList.education[0].coursework = "CSE 1";
    assert.throws(() => validateMaster(notList), /must be a non-empty list of courses/);
});

test("a variant prints coursework only when its spec asks for it", () => {
    const master = loadMaster();
    const withCourses = master.education.find((entry) => entry.coursework);
    assert.ok(withCourses, "master.yaml lists coursework on one degree");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "variant-"));
    const write = (name, entry) => {
        const file = path.join(dir, `${name}.yaml`);
        const spec = { sections: [{ title: "Education", kind: "education", entries: [entry] }] };
        fs.writeFileSync(file, JSON.stringify(spec));
        return resolveVariant(file, master).sections[0].entries[0];
    };
    try {
        assert.equal(write("plain", withCourses.id).coursework, undefined);
        assert.deepEqual(write("asks", { id: withCourses.id, coursework: ["CSE 9"] }).coursework, [
            "CSE 9"
        ]);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

const profile = () => ({
    bio: "I build robots.",
    projectsIntro: "Things I've built.",
    linkedinHeadline: "Robotics",
    githubBio: "Robotics"
});

test("profile.yaml is a closed schema with the sites' own length limits", () => {
    assert.doesNotThrow(() => validateProfile(profile()));
    assert.throws(() => validateProfile({ ...profile(), summary: "x" }), /unknown key "summary"/);
    const missing = profile();
    delete missing.bio;
    assert.throws(() => validateProfile(missing), /missing "bio"/);
    assert.throws(
        () => validateProfile({ ...profile(), githubBio: "x".repeat(161) }),
        /"githubBio" is 161 characters; the limit there is 160/
    );
    assert.throws(
        () => validateProfile({ ...profile(), linkedinHeadline: "x".repeat(221) }),
        /the limit there is 220/
    );
});

test("profile.yaml loads", () => {
    assert.doesNotThrow(() => loadProfile());
});
