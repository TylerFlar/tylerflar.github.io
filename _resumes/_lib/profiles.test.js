"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { renderProfiles, LIMITS } = require("./render-profiles.js");
const { loadMaster } = require("./load.js");

// LinkedIn and GitHub get the CV's words verbatim from one renderer. These
// hold it to the sites' limits and to the CV: every role once, every
// subproject under its role, and no markup leaking into plain text.

test("every field fits its site's limit", () => {
    const { fields, problems } = renderProfiles();
    assert.deepEqual(problems, []);
    assert.ok(fields.length > 0);
    for (const item of fields) assert.ok(item.length <= item.limit, item.name);
    assert.deepEqual(LIMITS, {
        linkedinHeadline: 220,
        linkedinAbout: 2600,
        linkedinDescription: 2000,
        githubBio: 160
    });
});

test("LinkedIn lists every role once, each subproject under its role", () => {
    const master = loadMaster();
    const linkedin = renderProfiles().files["linkedin.md"];
    for (const role of master.roles) {
        const heading = `### ${role.title}, ${role.org}`;
        assert.equal(linkedin.split(heading).length - 1, 1, `${role.id} appears once`);
        for (const sub of role.subprojects || []) {
            assert.ok(linkedin.includes(`\n${sub.name} (`), `${role.id}/${sub.id} has its line`);
        }
    }
    for (const project of master.projects) {
        assert.ok(linkedin.includes(`### ${project.name}, `), `project ${project.id}`);
        // The tagline carries the team context ("three-person CSE 252D project").
        if (project.tagline)
            assert.ok(linkedin.includes(`\n${project.tagline}\n•`), `${project.id} tagline`);
    }
});

test("plain text carries no markup, and it renders the same every time", () => {
    const first = renderProfiles().files;
    const plain = first["linkedin.md"] + first["github-bio.txt"];
    assert.ok(!plain.includes("**"), "no bold markers");
    assert.ok(!/\]\(/.test(plain), "no markdown links");
    assert.deepEqual(renderProfiles().files, first);
});
