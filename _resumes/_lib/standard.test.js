"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    STANDARD,
    ancestors,
    printedKeys,
    standardProblems,
    fillProblem
} = require("./standard.js");

// The standard every document meets, the CV and each resume alike, held to
// small documents so each rule's message is pinned.

const bullet = (id, text = "Built a thing.") => ({ id, text });
const role = (id, start, end, more = {}) => ({
    kind: "role",
    id,
    start,
    end,
    bullets: [bullet("a")],
    subprojects: [],
    ...more
});
const doc = (sections, extra = {}) => ({ maxPages: 1, fontSize: "11pt", sections, ...extra });
const roles = (...entries) => ({ title: "Experience", kind: "role", entries });
const skills = (...groups) => ({ title: "Skills", kind: "skills", groups });
const group = (label, count) => ({
    label,
    items: Array.from({ length: count }, (_, i) => `${label} ${i}`)
});

test("a document that meets the standard has no problems", () => {
    const fine = doc([
        roles(role("now", "2026-01", "present"), role("then", "2024-01", "2025-01")),
        skills(group("Languages", 10), group("Tools", 15))
    ]);
    assert.deepEqual(standardProblems(fine), []);
});

test("no headline or summary, and the CV's 11pt", () => {
    const [headline] = standardProblems(doc([], { headline: "Engineer" }));
    assert.match(headline, /has a headline or summary/);
    assert.match(standardProblems(doc([], { summary: "Short." }))[0], /headline or summary/);
    assert.match(standardProblems(doc([], { fontSize: "10pt" }))[0], /set in 10pt.*11pt/);
});

test("skills: at most 15 in a group and 30 a page", () => {
    assert.match(
        standardProblems(doc([skills(group("Tools", 16))]))[0],
        /lists 16 Tools skills\. Pick at most 15/
    );
    assert.match(
        standardProblems(doc([skills(group("A", 15), group("B", 15), group("C", 1))]))[0],
        /lists 31 skills over 1 page\. Keep it to 30/
    );
    // Two pages hold twice as many.
    const twoPages = doc([skills(group("A", 15), group("B", 15), group("C", 15))], { maxPages: 2 });
    assert.deepEqual(standardProblems(twoPages), []);
});

test("at most 6 courses", () => {
    const school = {
        kind: "education",
        id: "ms",
        start: "2025-04",
        end: "expected 2027-03",
        coursework: Array.from({ length: STANDARD.maxCourses + 1 }, (_, i) => `CSE ${i} Course`)
    };
    const section = { title: "Education", kind: "education", entries: [school] };
    assert.match(standardProblems(doc([section]))[0], /lists 7 courses\. Pick at most 6/);
});

test("every section runs newest first", () => {
    const backwards = doc([
        roles(role("then", "2024-01", "2025-01"), role("now", "2026-01", "present"))
    ]);
    assert.match(
        standardProblems(backwards)[0],
        /lists Experience out of order: move "now" .* above "then"/
    );
});

test("a website summary picked as a bullet meets the CV's bullet rules", () => {
    const summary = { id: "web-summary", alt: true, text: "Working on navigation." };
    const entry = role("lab", "2025-09", "present", { bullets: [summary] });
    assert.match(
        standardProblems(doc([roles(entry)]))[0],
        /website summary lab\.web-summary.*opens with "Working"/
    );
});

test("nothing cv.yaml holds below the standard prints, nor anything under it", () => {
    const sub = { id: "sensor", name: "Sensor", bullets: [bullet("work")] };
    const entry = role("startup", "2026-09", "present", { subprojects: [sub] });
    const below = new Map([["startup", "No results yet."]]);
    const problems = standardProblems(doc([roles(entry)]), { below });
    assert.equal(problems.length, printedKeys(doc([roles(entry)])).length);
    assert.match(
        problems[0],
        /prints startup, which cv\.yaml holds below the standard \(No results yet\.\)/
    );
    assert.match(problems.at(-1), /prints startup\.sensor\.work, which/);
});

test("a resume picks its roles by relevance: leaving one off isn't a problem", () => {
    const now = role("now", "2026-01", "present");
    assert.deepEqual(standardProblems(doc([roles(now)])), []);
});

test("every role prints at least one bullet, its own or a subproject's", () => {
    const now = role("now", "2026-01", "present");
    const heading = role("then", "2024-01", "2025-01", { bullets: [] });
    assert.deepEqual(standardProblems(doc([roles(now, heading)])), [
        "prints then with no bullets. A role prints at least one, as on the CV: pick one, or leave the role off"
    ]);
    // A subproject's bullet counts, so a role can print just one of its tracker's.
    const sub = { id: "rtt", name: "RTT", bullets: [bullet("software")] };
    const e4e = role("e4e", "2023-01", "2025-10", { bullets: [], subprojects: [sub] });
    assert.deepEqual(standardProblems(doc([roles(now, e4e)])), []);
});

test("a role held to one bullet prints one its oneBullet names", () => {
    const sub = { id: "rtt", name: "RTT", bullets: [bullet("software")] };
    const lead = role("e4e", "2023-01", "2025-10", {
        bullets: [],
        subprojects: [sub],
        oneBullet: ["lead", "rtt.modernized"]
    });
    assert.deepEqual(standardProblems(doc([roles(lead)])), [
        "prints e4e with one bullet, rtt.software. A role held to one bullet prints one that stands for the whole role (its oneBullet in master.yaml): pick lead or rtt.modernized, or give the role another bullet"
    ]);
    // One it names is fine, and a role with two isn't held to one.
    const named = { ...lead, bullets: [bullet("lead")], subprojects: [] };
    assert.deepEqual(standardProblems(doc([roles(named)])), []);
    const two = { ...lead, bullets: [bullet("a")] };
    assert.deepEqual(standardProblems(doc([roles(two)])), []);
    // A role without the list can print any one bullet.
    assert.deepEqual(standardProblems(doc([roles(role("lab", "2025-09", "present"))])), []);
});

test("a key and the keys above it", () => {
    assert.deepEqual(ancestors("e4e.baboons.baselines"), [
        "e4e.baboons.baselines",
        "e4e.baboons",
        "e4e"
    ]);
    const sub = { id: "rtt", name: "RTT", bullets: [bullet("software")] };
    const entry = role("e4e", "2023-01", "2025-10", { subprojects: [sub] });
    assert.deepEqual(printedKeys(doc([roles(entry)])), [
        "e4e",
        "e4e.a",
        "e4e.rtt",
        "e4e.rtt.software"
    ]);
});

test("a page is full with at most 8 lines free, and the CV keeps 2", () => {
    const line = 12;
    const page = (free) => ({ goal: 700, need: 700 - free * line, small: line });
    const check = (free, more = {}) =>
        fillProblem({ pages: 1, fill: page(free), maxPages: 1, what: "The resume", ...more });
    assert.equal(check(STANDARD.maxFreeLines), null);
    assert.match(check(STANDARD.maxFreeLines + 1), /about 9 lines free.*at most 8\. Put an entry/);
    assert.equal(check(2, { minFree: STANDARD.cvMinFreeLines }), null);
    assert.match(check(1, { minFree: STANDARD.cvMinFreeLines }), /about 1 line free.*Leave 2/);
    // A page short of the limit isn't full, and past the limit is reported elsewhere.
    assert.match(
        fillProblem({ pages: 1, fill: page(0), maxPages: 2, what: "The CV" }),
        /runs to 1 page of 2/
    );
    assert.equal(fillProblem({ pages: 3, fill: page(0), maxPages: 2, what: "The CV" }), null);
});
