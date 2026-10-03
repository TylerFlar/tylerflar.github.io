"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { monthKey, compareNewestFirst, assertNewestFirst } = require("./order.js");
const { loadMaster, findCvEntry } = require("./load.js");
const { render } = require("./render-web.js");

// Every dated list on the CV and the website runs newest first. These pin the
// rule; loadMaster and render-web hold the hand-ordered lists to it, and the
// projects page sorts by it (`newestFirst` in .eleventy.js).

const PROJECTS_DIR = path.join(__dirname, "..", "..", "src", "content", "projects");

const sortIds = (entries) => [...entries].sort(compareNewestFirst).map((entry) => entry.id);

test("still running first, then the latest end, then the latest start", () => {
    const entries = [
        { id: "rtt", start: "2024-08", end: "2025-10" },
        { id: "endonav", start: "2025-09", end: "2026-06" },
        { id: "music", start: "2026-05", end: "2026-06" },
        { id: "tasque", start: "2026-03", end: "present" },
        { id: "aquamesh", start: "2026-09", end: "present" }
    ];
    assert.deepEqual(sortIds(entries), ["aquamesh", "tasque", "music", "endonav", "rtt"]);
});

test("an expected end sorts as its month", () => {
    assert.equal(monthKey("expected 2027-03"), monthKey("2027-03"));
    assert.ok(monthKey("present") > monthKey("expected 2027-03"));
    assert.throws(() => monthKey("2026-13", "x"), /Invalid date "2026-13" \(x\)/);
    assert.throws(() => monthKey("Jun 2026", "x"), /Invalid date/);
});

test("a list out of order fails and names the entry to move", () => {
    const list = [
        { id: "rtt", start: "2024-08", end: "2025-10" },
        { id: "endonav", start: "2025-09", end: "2026-06" }
    ];
    assert.throws(
        () => assertNewestFirst(list, "projects"),
        /projects: move "endonav" \(2025-09 – 2026-06\) above "rtt" \(2024-08 – 2025-10\)/
    );
    assert.doesNotThrow(() => assertNewestFirst([...list].reverse(), "projects"));
});

test("entries tied on both dates may stand either way", () => {
    const tasque = { id: "tasque", start: "2026-03", end: "present" };
    const jackdaw = { id: "jackdaw", start: "2026-03", end: "present" };
    assert.doesNotThrow(() => assertNewestFirst([tasque, jackdaw], "projects"));
    assert.doesNotThrow(() => assertNewestFirst([jackdaw, tasque], "projects"));
});

test("an entry that starts after it ends fails", () => {
    assert.throws(
        () => assertNewestFirst([{ id: "x", start: "2026-06", end: "2025-09" }], "roles"),
        /roles "x": starts \(2026-06\) after it ends \(2025-09\)/
    );
});

test("the CV and the homepage timeline run newest first", () => {
    // loadMaster checks master.yaml's lists; render() checks website.yaml's.
    assert.doesNotThrow(() => render());
});

test("every project page names its CV entry", () => {
    const master = loadMaster();
    const pages = fs.readdirSync(PROJECTS_DIR).filter((file) => file.endsWith(".md"));
    assert.ok(pages.length > 0, "expected project pages");
    for (const file of pages) {
        const text = fs.readFileSync(path.join(PROJECTS_DIR, file), "utf8");
        const front = yaml.load(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)[1]);
        const entry = findCvEntry(master, front.cv, file);
        assert.ok(entry.start && entry.end, `${file}: its CV entry needs start and end`);
        assert.equal(front.date_range, undefined, `${file}: dates come from cv, not date_range`);
    }
});

test("a cv reference resolves to its entry or fails with the valid ids", () => {
    const master = loadMaster();
    const role = master.roles.find((entry) => entry.subprojects?.length);
    const sub = role.subprojects[0];
    const project = master.projects[0];
    assert.equal(findCvEntry(master, `role/${role.id}/${sub.id}`, "x.md"), sub);
    assert.equal(findCvEntry(master, `project/${project.id}`, "x.md"), project);
    assert.throws(() => findCvEntry(master, undefined, "x.md"), /x\.md: no cv; name its CV entry/);
    assert.throws(() => findCvEntry(master, "project/nope", "x.md"), /no project "nope"\. Valid/);
    assert.throws(
        () => findCvEntry(master, `role/${role.id}/nope`, "x.md"),
        /no subproject "nope"/
    );
    assert.throws(
        () => findCvEntry(master, `project/${project.id}/x`, "x.md"),
        /name its CV entry/
    );
});
