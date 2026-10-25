"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const yaml = require("js-yaml");
const { loadMaster, resolveCv } = require("./load.js");
const { resolveResume, scaffoldResume } = require("./resume.js");
const { renderResumeTex } = require("./render-tex.js");

// Tailored resumes start from the CV: a bare section title prints it as the
// CV does, and a title with entries prints just those, in that order. These
// pin the format and its error messages against the real master.yaml.

const master = loadMaster();
const resolve = (spec) => resolveResume(spec, master, "test");
const ids = (section) => section.entries.map((entry) => entry.id);
const bulletIds = (entry) => (entry.bullets || []).map((bullet) => bullet.id);

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
    assert.match(tex, /^% AUTO-GENERATED from _resumes\/applications\/test\/resume\.yaml/);
    assert.ok(!tex.includes("\\def\\resumeCompact"), "the full heading by default");
    const compact = renderResumeTex(resolve({ compactHeading: true, sections: ["Education"] }));
    assert.ok(compact.includes("\\def\\resumeCompact{}"), "compactHeading reaches the .tex");
});

test("mistakes fail with what to write instead", () => {
    const fails = (spec, pattern) => assert.throws(() => resolve(spec), pattern);
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

test("a new spec starts as the whole CV and builds to it", () => {
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
