"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertBudget, TIER_LIMITS, SHARED_LIMIT } = require("./budget.js");
const { loadMaster } = require("./load.js");

// The bullet budget keeps the CV even: three bullets for a flagship entry,
// two by default, one for teaching and volunteering, four shared across a role
// and its subprojects. These pin the rule and its messages.

const bullets = (count, extra = {}) =>
    Array.from({ length: count }, (_, i) => ({ id: `b${i}`, text: "Did a thing.", ...extra }));

const master = ({ roles = [], projects = [], volunteering = [] }) => ({
    roles,
    projects,
    volunteering
});

test("the tiers are 3, 2 and 1, and a shared role budget is 4", () => {
    assert.deepEqual(TIER_LIMITS, { flagship: 3, standard: 2, minor: 1 });
    assert.equal(SHARED_LIMIT, 4);
});

test("a standard entry prints two bullets, a flagship three", () => {
    const two = { id: "p", bullets: bullets(2) };
    assert.doesNotThrow(() => assertBudget(master({ projects: [two] })));
    const three = { id: "p", bullets: bullets(3) };
    assert.throws(
        () => assertBudget(master({ projects: [three] })),
        /project "p": 3 CV bullets; a standard entry prints at most 2\. Delete the weakest/
    );
    assert.doesNotThrow(() => assertBudget(master({ projects: [{ ...three, tier: "flagship" }] })));
});

test("teaching roles and volunteering default to one bullet", () => {
    const ta = { id: "ta", track: "teaching", bullets: bullets(2) };
    assert.throws(
        () => assertBudget(master({ roles: [ta] })),
        /role "ta": 2 CV bullets; a minor entry prints at most 1/
    );
    const club = { id: "club", bullets: bullets(2) };
    assert.throws(() => assertBudget(master({ volunteering: [club] })), /a minor entry/);
    assert.doesNotThrow(() =>
        assertBudget(master({ volunteering: [{ ...club, tier: "standard" }] }))
    );
});

test("website-only alt bullets don't count", () => {
    const entry = { id: "p", bullets: [...bullets(2), { id: "web", alt: true, text: "Summary." }] };
    assert.doesNotThrow(() => assertBudget(master({ projects: [entry] })));
});

test("a role with subprojects shares four across all of them", () => {
    const role = (own, ...subs) => ({
        id: "lab",
        bullets: bullets(own),
        subprojects: subs.map((count, i) => ({ id: `s${i}`, bullets: bullets(count) }))
    });
    assert.doesNotThrow(() => assertBudget(master({ roles: [role(1, 2, 1)] })));
    assert.throws(
        () => assertBudget(master({ roles: [role(2, 2, 1)] })),
        /role "lab": 5 CV bullets counting its subprojects; the shared budget is 4/
    );
    assert.throws(
        () => assertBudget(master({ roles: [role(0, 4)] })),
        /role "lab"\/s0: 4 CV bullets; a subproject prints at most 3/
    );
});

test("tier is refused where it would do nothing, and must be a known tier", () => {
    const shared = { id: "lab", tier: "flagship", bullets: [], subprojects: [{ id: "s" }] };
    assert.throws(
        () => assertBudget(master({ roles: [shared] })),
        /shares a fixed 4; remove "tier"/
    );
    const sub = { id: "lab", bullets: [], subprojects: [{ id: "s", tier: "minor" }] };
    assert.throws(() => assertBudget(master({ roles: [sub] })), /lab"\/s: a subproject shares/);
    const odd = { id: "p", tier: "huge", bullets: [] };
    assert.throws(() => assertBudget(master({ projects: [odd] })), /unknown tier "huge"/);
});

test("master.yaml is within budget", () => {
    // loadMaster runs the same check; this names it in the test report.
    assert.doesNotThrow(() => loadMaster());
});
