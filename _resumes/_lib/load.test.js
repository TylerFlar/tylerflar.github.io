"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    loadMaster,
    validateMaster,
    resolveCv,
    loadProfile,
    validateProfile
} = require("./load.js");
const { renderResumeTex } = require("./render-tex.js");

// The CV's structural rules, held to small fixtures so each failure message is
// pinned: each track prints in one role section, and nothing is dead content.

/** A minimal master.yaml that passes every rule; tests break one thing each. */
function fixture() {
    return {
        sections: [
            { title: "Education", kind: "education" },
            { title: "Experience", kind: "role", tracks: ["industry", "research"] },
            { title: "Projects", kind: "project" },
            { title: "Publications", kind: "publication" },
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
                skills: ["Python"],
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

test("a skill nothing backs fails when the CV loads", () => {
    // Taking an entry off without the skills only it backed stops the build.
    const doc = fixture();
    delete doc.roles[0].skills;
    assert.throws(
        () => validateMaster(doc),
        /master\.yaml skills\.languages: no entry backs "Python"/
    );
});

test("a subproject cut down to no CV bullets fails", () => {
    const doc = fixture();
    doc.roles[0].subprojects = [
        {
            id: "rig",
            name: "Rig",
            start: "2025-09",
            end: "2026-06",
            bullets: [{ id: "web", alt: true, text: "Website only." }]
        }
    ];
    assert.throws(
        () => validateMaster(doc),
        /subproject "lab\/rig": no CV bullets left\. Give it one, or delete it along with its project page\./
    );
});

test("a bullet rewords another CV bullet in its own list, one level deep", () => {
    const doc = fixture();
    doc.roles[0].bullets.push({ id: "b", rewords: "a", text: "Built the thing." });
    assert.doesNotThrow(() => validateMaster(doc));
    // The record prints the original once.
    const lab = resolveCv(validateMaster(doc))
        .sections.flatMap((section) => section.entries || [])
        .find((entry) => entry.id === "lab");
    assert.deepEqual(
        lab.bullets.map((bullet) => bullet.id),
        ["a"]
    );
    for (const bad of ["missing", "b", "c"]) {
        const broken = fixture();
        broken.roles[0].bullets.push(
            { id: "b", rewords: bad, text: "Built the thing." },
            { id: "c", rewords: "a", text: "Built it." }
        );
        assert.throws(
            () => validateMaster(broken),
            new RegExp(`bullet "b" rewords "${bad}", which has to be another CV bullet`)
        );
    }
});

test("a role's own bullet can reword one of its subprojects' as sub.id", () => {
    const withRig = () => {
        const doc = fixture();
        doc.roles[0].subprojects = [
            {
                id: "rig",
                name: "Rig",
                start: "2025-09",
                end: "2026-06",
                bullets: [{ id: "built", text: "Built the rig." }]
            }
        ];
        return doc;
    };
    const doc = withRig();
    doc.roles[0].bullets.push({ id: "led", rewords: "rig.built", text: "Led and built the rig." });
    assert.doesNotThrow(() => validateMaster(doc));
    for (const bad of ["rig.missing", "nope.built", "rig.built.x"]) {
        const broken = withRig();
        broken.roles[0].bullets.push({ id: "led", rewords: bad, text: "Led the rig." });
        assert.throws(
            () => validateMaster(broken),
            new RegExp(`bullet "led" rewords "${bad.replaceAll(".", "\\.")}", which has to be`)
        );
    }
});

test("a role's oneBullet names bullets it has", () => {
    const doc = fixture();
    doc.roles[0].oneBullet = ["a"];
    assert.doesNotThrow(() => validateMaster(doc));
    doc.roles[0].oneBullet = ["missing"];
    assert.throws(
        () => validateMaster(doc),
        /role "lab": oneBullet names "missing", which isn't one of its bullets\. Its bullets: a/
    );
    doc.roles[0].oneBullet = [];
    assert.throws(() => validateMaster(doc), /role "lab": oneBullet lists the bullets/);
});

test("a role without a track fails and lists the tracks", () => {
    const doc = fixture();
    delete doc.roles[1].track;
    assert.throws(
        () => validateMaster(doc),
        /role "co": add "track: research \| industry \| teaching \| self-employed", which sets its typical week/
    );
});

test("a role section must list its tracks, and only role sections take them", () => {
    const listsTracks = /sections\[1\]: a role section lists the tracks it prints/;
    const missing = fixture();
    delete missing.sections[1].tracks;
    assert.throws(() => validateMaster(missing), listsTracks);
    for (const tracks of [[], "research", ["industry", "hobby"]]) {
        const bad = fixture();
        bad.sections[1].tracks = tracks;
        assert.throws(() => validateMaster(bad), listsTracks);
    }

    const misplaced = fixture();
    misplaced.sections[2].tracks = ["research"];
    assert.throws(
        () => validateMaster(misplaced),
        /sections\[2\]: "tracks" only applies to role sections/
    );
});

test("a track prints in one section, and a role's track must have one", () => {
    const twice = fixture();
    twice.sections.push({ title: "More Research", kind: "role", tracks: ["research"] });
    assert.throws(() => validateMaster(twice), /track "research" is in two sections/);

    const orphan = fixture();
    orphan.roles[1].track = "teaching";
    assert.throws(
        () => validateMaster(orphan),
        /role "co": track "teaching" has no section, so the role would be off the CV/
    );
});

test("a track no role has fails as dead content", () => {
    const doc = fixture();
    doc.sections.push({ title: "Teaching", kind: "role", tracks: ["teaching"] });
    assert.throws(() => validateMaster(doc), /no role has the "teaching" track/);
});

test("awards are optional, but a list needs its section and each award a term", () => {
    const award = { id: "reu", name: "An award", issuer: "A foundation", term: "Summer 2024" };

    const withSection = fixture();
    withSection.sections.splice(1, 0, { title: "Honors & Awards", kind: "award" });
    withSection.awards = [award];
    const cv = resolveCv(validateMaster(withSection));
    assert.deepEqual(
        cv.sections.find((s) => s.kind === "award").entries.map((e) => e.id),
        ["reu"]
    );

    const noSection = fixture();
    noSection.awards = [award];
    assert.throws(() => validateMaster(noSection), /no section renders "award"/);

    const empty = fixture();
    empty.sections.push({ title: "Honors & Awards", kind: "award" });
    assert.throws(() => validateMaster(empty), /the "award" section has no awards to print/);

    const badTerm = fixture();
    badTerm.sections.push({ title: "Honors & Awards", kind: "award" });
    badTerm.awards = [{ ...award, term: "June 2024" }];
    assert.throws(() => validateMaster(badTerm), /term must be like "Summer 2024" or "2024"/);
});

test("a role section prints the roles on its tracks, in file order", () => {
    const doc = fixture();
    doc.roles.push({
        id: "ta",
        org: "School",
        title: "Teaching Assistant",
        track: "teaching",
        start: "2024-01",
        end: "2024-03",
        bullets: [{ id: "a", text: "Taught a section." }]
    });
    doc.sections.push({ title: "Teaching", kind: "role", tracks: ["teaching"] });
    const cv = resolveCv(validateMaster(doc));
    const ids = (title) => cv.sections.find((s) => s.title === title).entries.map((e) => e.id);
    // Research and industry share Experience, newest first as the file has them.
    assert.deepEqual(ids("Experience"), ["lab", "co"]);
    assert.deepEqual(ids("Teaching"), ["ta"]);
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
    const tex = renderResumeTex(resolveCv(validateMaster(doc)));
    assert.ok(
        tex.includes("\\resumeInterests[2pt]{Research Interests}{Robot perception"),
        "Research Interests prints as a labelled line"
    );
    assert.ok(
        tex.includes(
            "\\resumeSubHeadingListEnd\n  \\resumeInterests[0pt]{Relevant Coursework}{\\mbox{Robots}\\hspace"
        ),
        "coursework follows the Education list, outside it"
    );
    assert.ok(!tex.includes("CSE 1"), "a course prints its title, not its code");
});

test("a degree prints as degree in field, with the month it ends", () => {
    const doc = fixture();
    Object.assign(doc.education[0], { degree: "M.S.", gpa: "3.9" });
    const tex = renderResumeTex(resolveCv(validateMaster(doc)));
    assert.ok(tex.includes("{M.S. in CS; GPA: 3.9}{Expected Mar 2027}"));
});

test("an entry can keep notes, which no document prints", () => {
    const doc = fixture();
    const fact = "The rig ran 4,096 trials before the first failure.";
    doc.roles[0].notes = [fact];
    doc.roles[0].subprojects = [
        {
            id: "rig",
            name: "Rig",
            start: "2025-09",
            end: "2025-12",
            bullets: [{ id: "r", text: "Built the rig." }],
            notes: ["The rig was a 4×4 array."]
        }
    ];
    doc.projects = [
        {
            id: "tool",
            name: "Tool",
            start: "2026-01",
            end: "2026-02",
            bullets: [{ id: "t", text: "Built a tool." }],
            notes: ["It shipped 3 releases."]
        }
    ];
    doc.publications = [
        {
            id: "paper",
            title: "A Paper",
            authors: "**A. Author**",
            venue: "A Venue",
            date: "2026-07",
            notes: ["The system cut interruptions by 70%."]
        }
    ];
    const tex = renderResumeTex(resolveCv(validateMaster(doc)));
    for (const text of ["4,096", "4×4", "3 releases", "70"]) {
        assert.ok(!tex.includes(text), `"${text}" is a note's, and the CV doesn't print it`);
    }
    // A list of sentences, or nothing.
    for (const notes of ["One sentence.", [], [""], [7]]) {
        const bad = fixture();
        bad.roles[0].notes = notes;
        assert.throws(() => validateMaster(bad), /role "lab": notes is a list of sentences/);
    }
    const sub = fixture();
    sub.roles[0].subprojects = [
        { id: "rig", name: "Rig", bullets: [{ id: "r", text: "Built the rig." }], notes: "x" }
    ];
    assert.throws(() => validateMaster(sub), /subproject "lab\/rig": notes is a list of sentences/);
});

test("a paper's link is escaped where the CV prints it", () => {
    const doc = fixture();
    doc.publications = [
        {
            id: "paper",
            title: "A Paper",
            authors: "**A. Author**",
            venue: "A Venue",
            date: "2026-07",
            // A DOI's encoded slash, a query and an anchor: a bare %, & or #
            // inside \resumePublication's argument would break the build.
            url: "https://example.org/doi/10.1%2Fx?a=1&b=2#abstract"
        }
    ];
    const tex = renderResumeTex(resolveCv(validateMaster(doc)));
    assert.ok(
        tex.includes("\\href{https://example.org/doi/10.1\\%2Fx?a=1\\&b=2\\#abstract}{[paper]}"),
        "the address is escaped like a link in a bullet"
    );
});

test("skills print as one compact list, a group to a line", () => {
    const tex = renderResumeTex(resolveCv(validateMaster(fixture())));
    assert.ok(
        tex.includes(
            "  \\begin{resumeSkills}\n    \\resumeSkill{Languages}{Python}\n  \\end{resumeSkills}"
        )
    );
});

test("a subproject that runs as long as its role leaves the dates to the role", () => {
    const doc = fixture();
    const bullet = (id) => [{ id, text: "Built a thing." }];
    doc.roles[0].subprojects = [
        { id: "rig", name: "Rig", start: "2025-09", end: "2026-06", bullets: bullet("r") },
        { id: "arm", name: "Arm", start: "2025-09", end: "2025-12", bullets: bullet("a") }
    ];
    const tex = renderResumeTex(resolveCv(validateMaster(doc)));
    assert.ok(tex.includes("{Rig}{}"), "same dates as the role: none of its own");
    assert.ok(tex.includes("{Arm}{Sep 2025 -- Dec 2025}"), "its own dates when they differ");
});

test("a lone subproject prints a heading only when it has dates of its own", () => {
    const doc = fixture();
    const bullet = (id) => [{ id, text: `Built the ${id}.` }];
    doc.roles[0].subprojects = [
        { id: "rig", name: "Rig", start: "2025-09", end: "2026-06", bullets: bullet("rig") }
    ];
    const tex = renderResumeTex(resolveCv(validateMaster(doc)));
    assert.ok(!tex.includes("\\resumeSubSubheading"), "the role's dates and the bullet say it all");
    assert.ok(
        tex.includes("\\resumeItem{Built a thing.}\n        \\resumeItem{Built the rig.}"),
        "its bullets join the role's own list"
    );

    doc.roles[0].subprojects[0].end = "2025-12";
    const dated = renderResumeTex(resolveCv(validateMaster(doc)));
    assert.ok(dated.includes("{Rig}{Sep 2025 -- Dec 2025}"), "dates of its own keep the heading");
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

test("what an entry's heading prints has to be there", () => {
    // A degree with no field would print "Master's in undefined".
    const noField = fixture();
    delete noField.education[0].field;
    assert.throws(
        () => validateMaster(noField),
        /education "ms": missing "field", which its heading prints/
    );
    const noOrg = fixture();
    noOrg.roles[1].org = "  ";
    assert.throws(
        () => validateMaster(noOrg),
        /role "co": missing "org", which its heading prints/
    );
    const noName = fixture();
    noName.roles[0].subprojects = [
        { id: "rig", start: "2025-09", end: "2026-06", bullets: [{ id: "a", text: "Built it." }] }
    ];
    assert.throws(() => validateMaster(noName), /subproject "lab\/rig": missing "name"/);
});

test("pageBreak is gone, and says so", () => {
    const doc = fixture();
    doc.sections[2].pageBreak = true;
    assert.throws(() => validateMaster(doc), /"pageBreak" is gone\. Pages break between entries/);
});
