"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const yaml = require("js-yaml");
const { loadMaster, resolveCv } = require("./load.js");
const { resolveResume, scaffoldResume } = require("./resume.js");
const { renderResumeTex } = require("./render-tex.js");
const { wordDiff } = require("./word-diff.js");
const { normalizeBulletText } = require("./markup.js");

// Tailored resumes start from the CV: a bare section title prints it as the
// CV does, and a title with entries prints just those, in that order. These
// pin the format and its error messages against the real master.yaml.

const master = loadMaster();
const resolve = (spec) => resolveResume(spec, master, "test");
const ids = (section) => section.entries.map((entry) => entry.id);
const bulletIds = (entry) => (entry.bullets || []).map((bullet) => bullet.id);
const fails = (spec, pattern) => assert.throws(() => resolve(spec), pattern);

test("a bare CV section title prints that section as the CV does", () => {
    const cv = resolveCv(master);
    const resume = resolve({ sections: ["Research Experience", "Skills"] });
    const cvSection = cv.sections.find((section) => section.title === "Research Experience");
    assert.deepEqual(ids(resume.sections[0]), ids(cvSection));
    assert.equal(resume.sections[1].groups.length, Object.keys(master.skills).length);
});

test("listed entries print in the listed order with the picked bullets", () => {
    const resume = resolve({
        sections: [{ Projects: { followme: "all", jackdaw: ["validation"] } }]
    });
    const [section] = resume.sections;
    assert.deepEqual(ids(section), ["followme", "jackdaw"]);
    assert.deepEqual(bulletIds(section.entries[1]), ["validation"]);
    // "all" means the CV's bullets: website-only ones stay out.
    const all = section.entries[0].bullets;
    assert.ok(all.length > 0 && all.every((bullet) => !bullet.alt));
});

test("a subproject id takes all of it, and subproject.bullet takes one bullet", () => {
    const [section] = resolve({
        sections: [{ "Research Experience": { e4e: ["lead", "rtt", "baboons.baselines"] } }]
    }).sections;
    const e4e = section.entries[0];
    assert.deepEqual(bulletIds(e4e), ["lead"]);
    assert.deepEqual(
        e4e.subprojects.map((sub) => [sub.id, bulletIds(sub)]),
        [
            ["rtt", ["modernized", "software"]],
            ["baboons", ["baselines"]]
        ]
    );
});

test("a short website bullet can stand in for a role's CV bullets", () => {
    const [section] = resolve({
        sections: [{ "Industry Experience": { resmed: ["web-summary"] } }]
    }).sections;
    assert.deepEqual(bulletIds(section.entries[0]), ["web-summary"]);
});

test("a title with its kind in parentheses mixes entries from different CV sections", () => {
    const [section] = resolve({
        sections: [{ "Experience (role)": { resmed: "all", arclab: "all" } }]
    }).sections;
    assert.equal(section.title, "Experience");
    assert.deepEqual(ids(section), ["resmed", "arclab"]);
});

test("skills by group key, and coursework can be switched off", () => {
    const resume = resolve({
        coursework: false,
        sections: ["Education", { Skills: ["languages"] }]
    });
    assert.ok(resume.sections[0].entries.every((entry) => !entry.coursework));
    assert.deepEqual(resume.sections[1].groups, [master.skills.languages]);
    const withCourses = resolve({ sections: ["Education"] }).sections[0];
    assert.ok(withCourses.entries.some((entry) => entry.coursework?.length));
});

test("headline, summary and font size reach the .tex", () => {
    const tex = renderResumeTex(
        resolve({
            headline: "Robotics engineer",
            summary: "Short.",
            fontSize: "10pt",
            sections: ["Education"]
        })
    );
    assert.match(tex, /\\documentclass\[letterpaper,10pt\]\{article\}/);
    assert.match(tex, /\\def\\resumeHeadline\{Robotics engineer\}/);
    assert.match(tex, /\\section\{Summary\}/);
    assert.match(tex, /\\def\\resumeDocumentType\{Resume\}/, "the PDF's title says Resume");
    assert.match(tex, /^% AUTO-GENERATED from _resumes\/applications\/test\/resume\.yaml/);
    assert.ok(!tex.includes("\\def\\resumeCompact"), "the full heading by default");
    const compact = renderResumeTex(resolve({ compactHeading: true, sections: ["Education"] }));
    assert.ok(compact.includes("\\def\\resumeCompact{}"), "compactHeading reaches the .tex");
});

test("mistakes fail with what to write instead", () => {
    fails(
        { sections: ["Experience"] },
        /no section called "Experience"\. Use one of Education, Industry Experience/
    );
    fails(
        { sections: [{ Projects: { nope: "all" } }] },
        /no project "nope"\. Valid ids: .*jackdaw/
    );
    fails(
        { sections: [{ Projects: { jackdaw: ["nope"] } }] },
        /no bullet or subproject "nope"\. Its bullets: engine/
    );
    fails(
        { sections: [{ "Research Experience": { e4e: ["rtt.nope"] } }] },
        /no bullet "rtt\.nope"/
    );
    fails({ sections: ["Experience (role)"] }, /needs its entries listed/);
    fails({ sections: [{ Skills: ["nope"] }] }, /no skill group "nope"\. Keys: languages/);
    fails({ sections: ["Education"], summery: "x" }, /unknown key "summery"/);
    fails({ sections: ["Education"], maxPages: 0 }, /maxPages is a whole number of pages, like 1/);
    fails({ sections: ["Education"], maxPages: "one" }, /maxPages is a whole number/);
    fails({ sections: ["Education"], compactHeading: "yes" }, /compactHeading is true or false/);
    fails({ sections: [] }, /needs a sections list/);
    fails(
        {
            sections: [
                { Projects: { jackdaw: "all" } },
                { "Software (project)": { jackdaw: "all" } }
            ]
        },
        /"jackdaw" is in more than one section/
    );
});

// RTT's hardware bullet, reworded to name the drone from the RTT page (the
// Matrice 350) and keep the CV's numbers (about 4 hours, a 20-minute flight).
const RTT_REWORDED =
    "Revived a dormant drone radio-tracking system for the San Diego Zoo Wildlife Alliance, " +
    "flying a new SDR payload on a DJI Matrice 350, so about 4 hours of tracking on foot " +
    "became a 20-minute flight.";

test("a bullet can be reworded for one resume, and the build gets it beside the CV's", () => {
    const resume = resolve({
        sections: [
            {
                "Research Experience": {
                    e4e: ["lead", { "rtt.modernized": RTT_REWORDED }, "rtt.software"]
                }
            }
        ]
    });
    const [rtt] = resume.sections[0].entries[0].subprojects;
    assert.deepEqual(bulletIds(rtt), ["modernized", "software"]);
    assert.equal(rtt.bullets[0].text, RTT_REWORDED);
    assert.match(renderResumeTex(resume), /DJI Matrice 350/);
    const cv = master.index.role.get("e4e").subprojectIndex.get("rtt").bullets[0];
    assert.deepEqual(resume.rewordings, [
        { where: "e4e -> rtt.modernized", cv: normalizeBulletText(cv.text), text: RTT_REWORDED }
    ]);
});

test("a rewording is held to the CV's rules, and its numbers to the CV and the project page", () => {
    const reword = (text) => ({ sections: [{ Projects: { jackdaw: [{ validation: text }] } }] });
    fails(
        reword("Built a harness that replays the real game across 9,999 scenarios."),
        /jackdaw -> validation: "9,999" isn't in the CV's text for jackdaw or on its project page/
    );
    fails(reword("Leveraged a harness that diffs the real game's state."), /"leverage"/);
    fails(reword("Built a harness; it diffs the real game's state."), /a semicolon/);
    fails(reword(`Built ${"a very long harness ".repeat(12)}`), /a bullet is at most 220/);
    const cv = master.index.project.get("jackdaw").bullets.find((b) => b.id === "validation");
    fails(reword(cv.text), /that's the CV's wording already/);
    // One build lists every problem, not just the first.
    assert.throws(
        () => resolve(reword("Leveraged 9,999 scenarios; more.")),
        (error) => ["leverage", "9,999", "semicolon"].every((part) => error.message.includes(part))
    );
    // A number the CV spells out ("two wildlife-tracking projects") can be digits.
    const lead = "Led 2 wildlife-tracking projects and mentored the student teams building them.";
    assert.doesNotThrow(() =>
        resolve({ sections: [{ "Research Experience": { e4e: [{ lead }] } }] })
    );
});

test("a project's tagline and a paper's note can be reworded too", () => {
    const tagline = "Bluetooth direction finding on a 4×4 antenna array";
    const note =
        "Contribution: the BLE angle-of-arrival module, from a 4×4 antenna array to a heading.";
    const resume = resolve({
        sections: [
            { Projects: { followme: { tagline, bullets: ["aoa"] } } },
            { Publications: { chaser: { note } } }
        ]
    });
    const [followme] = resume.sections[0].entries;
    assert.equal(followme.tagline, tagline);
    assert.deepEqual(bulletIds(followme), ["aoa"]);
    assert.equal(resume.sections[1].entries[0].note, note);
    assert.deepEqual(
        resume.rewordings.map((change) => change.where),
        ["followme tagline", "chaser note"]
    );
    // Without a bullets key, the map form takes all of them.
    const [entry] = resolve({ sections: [{ Projects: { followme: { tagline } } }] }).sections[0]
        .entries;
    const cvBullets = master.index.project.get("followme").bullets.filter((b) => !b.alt);
    assert.deepEqual(bulletIds(entry), bulletIds({ bullets: cvBullets }));
});

test("rewording mistakes fail with what to write instead", () => {
    const research = (e4e) => ({ sections: [{ "Research Experience": { e4e } }] });
    fails(
        research([{ rtt: "New wording" }]),
        /e4e -> rtt: that's a whole subproject\. Reword one of its bullets, like rtt\.modernized/
    );
    fails(
        research(["rtt", { "rtt.modernized": RTT_REWORDED }]),
        /"rtt" is picked whole and one bullet at a time/
    );
    fails(research(["lead", "lead"]), /"lead" is picked twice/);
    fails(research([{ lead: " " }]), /e4e -> lead: give the new wording as text/);
    fails(research({ tagline: "x" }), /e4e: use "all" or a list of bullet ids/);
    fails(
        { sections: [{ Projects: { followme: { note: "x" } } }] },
        /a project sets tagline and bullets here, not "note"/
    );
    fails(
        { sections: [{ Publications: { chaser: { tagline: "x" } } }] },
        /a publication sets note here, not "tagline"/
    );
    fails({ sections: [{ Education: { "ucsd-ms": { note: "x" } } }] }, /ucsd-ms: use "all"/);
});

test("a skill group can be trimmed to some of its skills, in the order picked", () => {
    const { languages, systems } = master.skills;
    const aws = systems.items.find((item) => item.startsWith("AWS ("));
    const [section] = resolve({
        sections: [{ Skills: ["languages", { systems: ["git", "Linux", "AWS"] }] }]
    }).sections;
    assert.deepEqual(section.groups, [languages, { ...systems, items: ["Git", "Linux", aws] }]);
    fails(
        { sections: [{ Skills: [{ systems: ["Kubernetes"] }] }] },
        /-> systems: no skill "Kubernetes"\. Its skills: Linux, Git/
    );
    fails({ sections: [{ Skills: [{ systems: ["Git", "git"] }] }] }, /"Git" is picked twice/);
    fails({ sections: [{ Skills: [{ systems: [] }] }] }, /list the skills to keep/);
    fails({ sections: [{ Skills: ["systems", "systems"] }] }, /"systems" is listed twice/);
});

test("coursework can be trimmed to some courses, by code or by name", () => {
    const carrier = master.education.find((entry) => entry.coursework);
    const [first, second] = carrier.coursework;
    const code = (course) => course.split(" ").slice(0, 2).join(" ");
    const [section] = resolve({
        coursework: [code(second), first],
        sections: ["Education"]
    }).sections;
    const printed = section.entries.find((entry) => entry.coursework);
    assert.deepEqual(printed.coursework, [second, first]);
    fails(
        { coursework: ["CSE 999"], sections: ["Education"] },
        /coursework: no course "CSE 999"\. Its courses: /
    );
    fails({ coursework: ["CSE"], sections: ["Education"] }, /"CSE" matches more than one course/);
    fails(
        { coursework: [code(first)], sections: [{ Skills: ["languages"] }] },
        new RegExp(`coursework comes from ${carrier.id}, which isn't on this resume`)
    );
    fails(
        { coursework: "some", sections: ["Education"] },
        /coursework is true, false or a list of courses to keep/
    );
});

test("a rewording prints as a word diff against the CV", () => {
    assert.equal(
        wordDiff("so about 4 hours of tracking", "so 4 hours of tracking"),
        "so [-about-] 4 hours of tracking"
    );
    assert.equal(
        wordDiff("picking new payload hardware", "picking an SDR"),
        "picking [-new payload hardware-] {+an SDR+}"
    );
    assert.equal(wordDiff("same words", "same words"), "same words");
});

test("a new spec starts as the whole record and builds to it", () => {
    const spec = yaml.load(scaffoldResume(master, "test"));
    const resume = resolve(spec);
    const cv = resolveCv(master);
    const shape = (resolved) =>
        resolved.sections.map((section) => [
            section.title,
            (section.entries || []).map((entry) => [
                entry.id,
                bulletIds(entry),
                (entry.subprojects || []).map((sub) => bulletIds(sub))
            ])
        ]);
    assert.deepEqual(shape(resume), shape(cv));
});

test("a new spec leaves out what cv.yaml holds below the standard", () => {
    const below = new Map([
        ["aquamesh", "No results yet."],
        ["e4e.baboons", "Weaker."],
        ["tasque.audit", "Weaker."]
    ]);
    const text = scaffoldResume(master, "test", { below });
    assert.ok(!/^\s+aquamesh:/m.test(text), "a held entry isn't offered");
    assert.match(text, /^\s+e4e: \[lead, rtt\]/m, "nor a held subproject");
    assert.match(text, /^\s+tasque: \[experiment, tools\]/m, "nor a held bullet");
    assert.match(text, /^\s+jackdaw: all/m, "the rest stays whole");
    assert.ok(
        !/^#?\s*(headline|summary|fontSize):/m.test(text),
        "no option the standard holds off"
    );
});
