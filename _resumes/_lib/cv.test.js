"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadMaster } = require("./load.js");
const { resolvePublicCv, loadCvSpec, belowStandard, triageProblems } = require("./cv.js");
const { standardProblems } = require("./standard.js");
const { resolveResume } = require("./resume.js");
const { renderResumeTex } = require("./render-tex.js");

// The deploy compiles the committed _resumes/_cv.tex, not the YAML, so an edit
// to master.yaml or cv.yaml that skips the regenerate step would leave /cv.pdf
// stale while the website moved on. This catches it before a push.

const CV_TEX = path.join(__dirname, "..", "_cv.tex");

test("the committed _cv.tex matches master.yaml and cv.yaml", () => {
    const committed = fs.readFileSync(CV_TEX, "utf8").replace(/\r\n/g, "\n");
    const fresh = renderResumeTex(resolvePublicCv(loadMaster()));
    if (committed === fresh) return;
    const was = committed.split("\n");
    const now = fresh.split("\n");
    const line = now.findIndex((text, i) => text !== was[i]);
    assert.fail(
        `_resumes/_cv.tex is stale (first difference at line ${line + 1}). ` +
            "Run: node _resumes/_generate.js, then commit _cv.tex."
    );
});

test("the CV header names its real source and the safe regenerate command", () => {
    const tex = renderResumeTex(resolvePublicCv(loadMaster()));
    const [first, second] = tex.split("\n");
    assert.equal(first, "% AUTO-GENERATED from _resumes/data/cv.yaml -- do not edit.");
    assert.equal(second, "% Edit _resumes/data/cv.yaml, then run: node _resumes/_generate.js");
    assert.ok(tex.includes("\\def\\resumeDocumentType{CV}"), "the PDF's title says CV");
    assert.ok(!tex.includes("\\def\\resumeCompact"), "the CV keeps the full heading");
});

test("cv.yaml takes picks and a page limit, not a headline, a summary or a one-line heading", () => {
    const master = loadMaster();
    const spec = (extra) => ({ maxPages: 2, sections: ["Education"], ...extra });
    assert.doesNotThrow(() => resolvePublicCv(master, spec()));
    for (const [key, value] of [
        ["headline", "Software engineer"],
        ["summary", "Short."],
        ["compactHeading", true]
    ]) {
        assert.throws(
            () => resolvePublicCv(master, spec({ [key]: value })),
            new RegExp(`the CV doesn't take "${key}"`)
        );
    }
    assert.throws(() => resolvePublicCv(master, { sections: ["Education"] }), /set maxPages/);
});

test("the CV prints master.yaml's wording, so a rewording in cv.yaml fails", () => {
    const master = loadMaster();
    const reworded = "Built a harness that replays the real game's moves and diffs its state.";
    assert.throws(
        () =>
            resolvePublicCv(master, {
                maxPages: 2,
                sections: [{ Projects: { jackdaw: [{ validation: reworded }] } }]
            }),
        /reword it there \(jackdaw -> validation\)/
    );
    // A pick that names nothing fails as cv.yaml's mistake, not a resume's.
    assert.throws(
        () => resolvePublicCv(master, { maxPages: 2, sections: [{ Projects: { nope: "all" } }] }),
        (error) => error.message.startsWith('cv.yaml section "Projects": no project "nope"')
    );
});

test("everything in master.yaml is placed: on the CV, or off with why", () => {
    const master = loadMaster();
    const spec = loadCvSpec();
    assert.deepEqual(triageProblems(master, spec, resolvePublicCv(master, spec)), []);
});

test("a role that's still running is on the CV, whatever its results so far", () => {
    const master = loadMaster();
    const spec = loadCvSpec();
    const running = (dated) => /^(?:present|expected\b)/i.test(String(dated.end));
    const role = master.roles.find(running);
    assert.ok(role, "a running role to test with");
    const experience = spec.sections.find((section) => section.Experience).Experience;
    const withExperience = (picks, off) => ({
        ...spec,
        sections: spec.sections.map((section) =>
            section.Experience ? { Experience: picks } : section
        ),
        off: { ...spec.off, ...off }
    });
    const problems = (picks) => triageProblems(master, picks, resolvePublicCv(master, picks));
    const named = (list, key) =>
        list.some((problem) => problem.includes(`"${key}" is still running`));

    // Held below the standard for want of results, it fails.
    const { [role.id]: _, ...others } = experience;
    const held = problems(withExperience(others, { below: { [role.id]: "No results yet." } }));
    assert.ok(named(held, role.id), held.join("\n"));

    // Kept short is fine: one bullet, with its subprojects off for space.
    const [first] = role.bullets.filter((bullet) => !bullet.alt).map((bullet) => bullet.id);
    const subs = Object.fromEntries(
        (role.subprojects || []).map((sub) => [`${role.id}.${sub.id}`, "Out for space."])
    );
    const room = Object.fromEntries(
        Object.entries(spec.off.room).filter(([key]) => !key.startsWith(`${role.id}.`))
    );
    const short = withExperience(
        { ...experience, [role.id]: [first] },
        { room: { ...room, ...subs } }
    );
    assert.ok(!named(problems(short), role.id), problems(short).join("\n"));
});

test("the CV meets the standard every document does", () => {
    const master = loadMaster();
    const spec = loadCvSpec();
    const below = belowStandard(spec);
    assert.deepEqual(standardProblems(resolvePublicCv(master, spec), { below }), []);
});

test("something new fails until it's placed, and the off list can't drift", () => {
    const master = loadMaster();
    const spec = loadCvSpec();
    const problems = (doc, picks = spec) => triageProblems(doc, picks, resolvePublicCv(doc, picks));
    const matches = (doc, picks, pattern) =>
        assert.ok(
            problems(doc, picks).some((problem) => pattern.test(problem)),
            `expected ${pattern} in:\n${problems(doc, picks).join("\n")}`
        );

    // A new project, a new bullet on an entry the CV picks by list, a new
    // skill and a new course: each one has to be placed.
    const tasque = master.projects.find((entry) => entry.id === "tasque");
    const grown = {
        ...master,
        projects: [
            ...master.projects.map((entry) =>
                entry === tasque
                    ? { ...entry, bullets: [...entry.bullets, { id: "new", text: "Built more." }] }
                    : entry
            ),
            { ...master.projects.at(-1), id: "brand-new" }
        ],
        skills: {
            ...master.skills,
            languages: {
                ...master.skills.languages,
                items: [...master.skills.languages.items, "Zig"]
            }
        },
        education: master.education.map((entry) =>
            entry.coursework
                ? { ...entry, coursework: [...entry.coursework, "CSE 291 Special Topics"] }
                : entry
        )
    };
    matches(grown, spec, /not placed yet: .*project "brand-new"/);
    matches(grown, spec, /not placed yet: .*bullet "tasque\.new"/);
    matches(grown, spec, /not placed yet: .*skill "Zig" \(languages\)/);
    matches(grown, spec, /not placed yet: .*course "CSE 291 Special Topics"/);

    // An off key master.yaml doesn't have, and one that's on the CV too.
    const off = (room) => ({ ...spec, off: { ...spec.off, room: { ...spec.off.room, ...room } } });
    matches(master, off({ gone: "It was here." }), /lists "gone", which master\.yaml doesn't have/);
    matches(master, off({ jackdaw: "Too long." }), /"jackdaw" is on the CV and in off\.room/);
    matches(master, off({ "tasque.audit": "" }), /off\.room tasque\.audit: say why/);
});

test("a resume can't print what cv.yaml holds below the standard", () => {
    const master = loadMaster();
    const resume = resolveResume(
        { sections: [{ Experience: { aquamesh: "all" } }] },
        master,
        "test"
    );
    const below = new Map([["aquamesh", "No results yet."]]);
    const problems = standardProblems(resume, { below });
    assert.ok(problems.some((problem) => /prints aquamesh, .*\(No results yet\.\)/.test(problem)));
    assert.ok(problems.some((problem) => /prints aquamesh\.aquaspectra\.work, /.test(problem)));
});
