"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadMaster, DATA_DIR } = require("./load.js");
const { resolvePublicCv } = require("./cv.js");
const { render, arrange, validateWebsite, bioParagraphs } = require("./render-web.js");

// The homepage shows what the CV shows: the same sections with the same
// entries, its coursework by title, its projects as the cards and its skills.
// Only the order is the homepage's own, from website.yaml, since a web page
// leads with the work.

const site = render();
const cv = resolvePublicCv(loadMaster());
const onCv = (title) => cv.sections.find((section) => section.title === title);

test("the homepage has the CV's sections, in website.yaml's order", () => {
    const named = (section) => `${section.kind}: ${section.title}`;
    assert.deepEqual(site.sections.map(named).sort(), cv.sections.map(named).sort());
    const { order } = yaml.load(fs.readFileSync(path.join(DATA_DIR, "website.yaml"), "utf8"));
    assert.deepEqual(
        site.sections.map((section) => section.title),
        order
    );
});

test("each section shows the CV's entries, one line each", () => {
    for (const section of site.sections) {
        const printed = onCv(section.title);
        if (section.kind === "project") {
            assert.deepEqual(
                section.refs,
                printed.entries.map((entry) => `project/${entry.id}`)
            );
        } else if (section.kind === "skills") {
            // Each skill is its name, with what its parentheses list as details.
            const asText = ({ name, details }) =>
                details.length ? `${name} (${details.join(", ")})` : name;
            assert.deepEqual(
                section.groups.map((group) => [group.label, group.items.map(asText)]),
                printed.groups.map((group) => [group.label, group.items])
            );
        } else if (section.items) {
            assert.equal(section.items.length, printed.entries.length, section.title);
            for (const item of section.items) {
                if (item.bullets) assert.equal(item.bullets.length, 1, item.title);
            }
        }
    }
});

test("coursework prints by title, as on the CV", () => {
    const education = site.sections.find((section) => section.kind === "education");
    for (const school of education.items) {
        for (const course of school.coursework) assert.doesNotMatch(course, /^[A-Z]{2,5} \d/);
    }
});

test("order names each of the CV's sections once, and says what to write otherwise", () => {
    const sections = [{ title: "Education" }, { title: "Projects" }];
    assert.deepEqual(
        arrange(sections, ["Projects", "Education"]).map((section) => section.title),
        ["Projects", "Education"]
    );
    assert.throws(() => arrange(sections, undefined), /set order.*\[Education, Projects\]/);
    assert.throws(() => arrange(sections, "Projects"), /expected a list/);
    assert.throws(() => arrange(sections, ["Projects"]), /leaves out "Education"/);
    assert.throws(
        () => arrange(sections, ["Projects", "Education", "Skills"]),
        /lists "Skills", which the CV doesn't print/
    );
    assert.throws(
        () => arrange(sections, ["Projects", "Projects", "Education"]),
        /lists "Projects" twice/
    );
    assert.throws(
        () => arrange([{ title: "Work" }, { title: "Work" }], ["Work"]),
        /two sections titled "Work"/
    );
});

test("website.yaml takes only its own keys", () => {
    assert.doesNotThrow(() =>
        validateWebsite({ order: ["Projects"], education: { ms: { school: "UC San Diego" } } })
    );
    assert.throws(() => validateWebsite({ publication: {} }), /unknown key "publication"/);
    assert.throws(
        () => validateWebsite({ education: { ms: { degree: "M.S." } } }),
        /education ms: unknown key "degree"/
    );
    assert.throws(
        () => validateWebsite({ experience: { lab: { workType: "Hybrid" } } }),
        /workType lives in master.yaml/
    );
    assert.throws(() => validateWebsite({ education: ["ms"] }), /list each entry as/);
});

test("a paper's write-up link is a project page's address", () => {
    // The page is its project's, and goes when the project runs out of budget.
    // The paper stays on the CV either way, so the link is optional.
    const spec = { publications: { paper: { project: "/projects/some-robot/" } } };
    assert.doesNotThrow(() => validateWebsite(spec));
    for (const project of ["some-robot", "https://example.com/projects/some-robot/", undefined]) {
        assert.throws(
            () => validateWebsite({ publications: { paper: { project } } }),
            /publications paper: project is the address of the paper's write-up/
        );
    }
    // The homepage's papers link only what's there: the paper, and a page that exists.
    const papers = site.sections.find((section) => section.type === "publication");
    for (const paper of papers?.items ?? []) {
        for (const link of paper.links?.items ?? []) {
            assert.ok(link.href.startsWith("https://") || link.href.startsWith("/projects/"));
        }
    }
});

test("the bio is a paragraph to each block of profile.yaml", () => {
    // In YAML's folded text a blank line between paragraphs is one line break.
    assert.deepEqual(bioParagraphs("One.\nTwo.\n\nThree.\n"), ["One.", "Two.", "Three."]);
    assert.ok(site.profile.bio.length >= 1);
    for (const paragraph of site.profile.bio) assert.doesNotMatch(paragraph, /\n/);
});
