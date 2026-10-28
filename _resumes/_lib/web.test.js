"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMaster } = require("./load.js");
const { resolvePublicCv } = require("./cv.js");
const { render } = require("./render-web.js");

// The homepage shows what the CV shows: the same sections in the same order,
// the same entries in each, its coursework by title, its projects as the cards
// and its skills.

const site = render();
const cv = resolvePublicCv(loadMaster());

test("the homepage has the CV's sections, in the CV's order", () => {
    assert.deepEqual(
        site.sections.map((section) => [section.kind, section.title]),
        cv.sections.map((section) => [section.kind, section.title])
    );
});

test("each section shows the CV's entries, one line each", () => {
    for (const [i, section] of site.sections.entries()) {
        const entries = cv.sections[i].entries;
        if (section.kind === "project") {
            assert.deepEqual(
                section.refs,
                entries.map((entry) => `project/${entry.id}`)
            );
        } else if (section.kind === "skills") {
            assert.deepEqual(
                section.groups.map((group) => group.items),
                cv.sections[i].groups.map((group) => group.items)
            );
        } else if (section.items) {
            assert.equal(section.items.length, entries.length, section.title);
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
