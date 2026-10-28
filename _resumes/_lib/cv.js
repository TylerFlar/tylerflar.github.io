"use strict";

/**
 * The public CV, /cv.pdf. master.yaml is the record. _resumes/data/cv.yaml
 * picks the pages the CV prints from it, in the same form as an application's
 * resume.yaml (resume.js), minus what the CV doesn't take:
 *
 *   maxPages: 2           required; npm run cv fails if the PDF runs longer
 *   coursework: [...]     optional; the courses to print, by code or name
 *   sections: [...]       which sections, entries and bullets, in order
 *   off: {...}            everything else in master.yaml, and why it's off
 *
 * No headline or summary, since the CV opens on Education, and no compact
 * heading, since it has the full one. No rewording either: the CV prints
 * master.yaml's words, so a better bullet goes in master.yaml, where LinkedIn
 * and the site get it too. LinkedIn and the homepage print what the CV does.
 *
 * `off` is how something new gets placed. Every entry, subproject, bullet,
 * skill and course in master.yaml is either on the CV or listed there, so a
 * new one fails npm run cv and the tests until someone decides:
 *
 *   room:        up to the standard, left off for space ("id" or "id.bullet": why)
 *   below:       not up to the standard yet, so no resume prints it either
 *   skills:      skills the CV leaves off, by group key
 *   coursework:  courses the CV leaves off, by code
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { resolveResume, skillMatches, courseMatches } = require("./resume.js");
const { ancestors, printedKeys } = require("./standard.js");

const CV_SPEC = path.join(__dirname, "..", "data", "cv.yaml");
const CV_KEYS = ["maxPages", "coursework", "sections", "off"];
const OFF_KEYS = ["room", "below", "skills", "coursework"];

function fail(message) {
    throw new Error(message);
}

function loadCvSpec(file = CV_SPEC) {
    return yaml.load(fs.readFileSync(file, "utf8"));
}

/** cv.yaml resolved against master.yaml into something render-tex can print. */
function resolvePublicCv(master, spec = loadCvSpec()) {
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
        fail("cv.yaml: expected maxPages, coursework and a sections list");
    }
    for (const key of Object.keys(spec)) {
        if (!CV_KEYS.includes(key)) {
            fail(
                `cv.yaml: the CV doesn't take "${key}". It takes ${CV_KEYS.join(", ")}. ` +
                    "A headline or summary is on no document, and the one-line heading is a resume's."
            );
        }
    }
    if (spec.maxPages === undefined) {
        fail("cv.yaml: set maxPages, the most pages the CV may run to");
    }

    // The off list is bookkeeping (triageProblems); the picks are what prints.
    const picks = Object.fromEntries(Object.entries(spec).filter(([key]) => key !== "off"));
    let cv;
    try {
        // No project pages to read: a rewording fails below either way.
        cv = resolveResume(picks, master, "cv", { pages: [] });
    } catch (error) {
        error.message = error.message.replaceAll('resume "cv"', "cv.yaml");
        throw error;
    }
    if (cv.rewordings.length) {
        const where = cv.rewordings.map((change) => change.where).join(", ");
        fail(`cv.yaml: the CV prints master.yaml's wording, so reword it there (${where})`);
    }
    return {
        ...cv,
        name: "_cv",
        documentType: "CV",
        source: "_resumes/data/cv.yaml",
        regenerate: "node _resumes/_generate.js"
    };
}

/** What cv.yaml holds below the standard: key -> why. No resume prints these. */
function belowStandard(spec = loadCvSpec()) {
    return new Map(Object.entries(spec?.off?.below ?? {}));
}

/** Everything in master.yaml the CV could print, by key, with a name for messages. */
function inventory(master) {
    const items = [];
    const add = (key, what) => items.push({ key, what });
    const collections = [
        ["education", master.education],
        ["role", master.roles],
        ["project", master.projects],
        ["publication", master.publications],
        ["award", master.awards || []],
        ["volunteer", master.volunteering]
    ];
    for (const [kind, list] of collections) {
        for (const entry of list) {
            add(entry.id, `${kind} "${entry.id}"`);
            for (const bullet of entry.bullets || []) {
                if (!bullet.alt)
                    add(`${entry.id}.${bullet.id}`, `bullet "${entry.id}.${bullet.id}"`);
            }
            for (const sub of entry.subprojects || []) {
                add(`${entry.id}.${sub.id}`, `subproject "${entry.id}.${sub.id}"`);
                for (const bullet of sub.bullets || []) {
                    if (bullet.alt) continue;
                    const key = `${entry.id}.${sub.id}.${bullet.id}`;
                    add(key, `bullet "${key}"`);
                }
            }
        }
    }
    return { items, collections };
}

/**
 * Whether everything in master.yaml is placed: on the CV, or in cv.yaml's off
 * list with why. Returns messages that say what to do; empty when it all is.
 */
function triageProblems(master, spec, cv) {
    const problems = [];
    const off = spec.off ?? {};
    if (typeof off !== "object" || Array.isArray(off)) {
        return [
            "cv.yaml off: list what the CV leaves out under room, below, skills and coursework"
        ];
    }
    for (const key of Object.keys(off)) {
        if (!OFF_KEYS.includes(key)) {
            problems.push(`cv.yaml off: "${key}" isn't a list here. Use ${OFF_KEYS.join(", ")}`);
        }
    }

    // An entry's key is its id alone, so ids have to be unique across master.yaml.
    const { items, collections } = inventory(master);
    const seen = new Map();
    for (const [kind, list] of collections) {
        for (const entry of list) {
            if (seen.has(entry.id)) {
                problems.push(
                    `master.yaml: "${entry.id}" is both a ${seen.get(entry.id)} and a ${kind}. Rename one, so cv.yaml can tell them apart`
                );
            }
            seen.set(entry.id, kind);
        }
    }

    const known = new Set(items.map((item) => item.key));
    const printed = new Set(printedKeys(cv));
    const placed = new Map();
    for (const tier of ["room", "below"]) {
        const list = off[tier] ?? {};
        if (typeof list !== "object" || Array.isArray(list)) {
            problems.push(`cv.yaml off.${tier}: list it as "key: why it's off"`);
            continue;
        }
        for (const [key, why] of Object.entries(list)) {
            if (typeof why !== "string" || !why.trim()) {
                problems.push(`cv.yaml off.${tier} ${key}: say why it's off`);
            }
            if (placed.has(key)) {
                problems.push(
                    `cv.yaml: "${key}" is under both off.${placed.get(key)} and off.${tier}`
                );
            }
            placed.set(key, tier);
            if (!known.has(key)) {
                problems.push(
                    `cv.yaml off.${tier} lists "${key}", which master.yaml doesn't have. Take it out, or fix the key`
                );
            } else if (printed.has(key)) {
                problems.push(
                    `cv.yaml: "${key}" is on the CV and in off.${tier}. It's one or the other`
                );
            }
        }
    }
    // A role that's still running is on the CV whatever its results so far:
    // career centers say to list a current position (MIT, CMU, UCSD), and to
    // keep it short while it's new, so its bullets and subprojects are placed
    // like any others. Once it ends, the role is placed like anything else.
    const running = (dated) => /^(?:present|expected\b)/i.test(String(dated.end));
    for (const role of master.roles.filter(running)) {
        if (printed.has(role.id)) continue;
        problems.push(
            `cv.yaml: "${role.id}" is still running, so it's on the CV whatever its results so far, ` +
                "if only with one bullet. Pick it under Experience, and once it ends, place it like anything else"
        );
    }

    const unplaced = items
        .filter((item) => !printed.has(item.key))
        .filter((item) => !ancestors(item.key).some((key) => placed.has(key)))
        .map((item) => item.what);

    // Skills, by group: on the CV, or under off.skills.
    const printedSkills = new Map();
    for (const section of cv.sections.filter((candidate) => candidate.kind === "skills")) {
        for (const group of section.groups) printedSkills.set(group.label, group.items);
    }
    const offSkills = off.skills ?? {};
    for (const [key, picks] of Object.entries(offSkills)) {
        const group = master.skills[key];
        if (!group) {
            problems.push(`cv.yaml off.skills: no skill group "${key}" in master.yaml`);
            continue;
        }
        for (const pick of Array.isArray(picks) ? picks : []) {
            const item = group.items.find((candidate) => skillMatches(candidate, String(pick)));
            if (!item) {
                problems.push(`cv.yaml off.skills ${key}: master.yaml has no skill "${pick}"`);
            } else if (
                (printedSkills.get(group.label) || []).some((shown) => skillMatches(item, shown))
            ) {
                problems.push(`cv.yaml: skill "${item}" is on the CV and in off.skills`);
            }
        }
    }
    // A skill shown with some of its parentheses (AWS's services) is on the CV.
    for (const [key, group] of Object.entries(master.skills)) {
        const onCv = printedSkills.get(group.label) || [];
        const offList = (offSkills[key] || []).map(String);
        for (const item of group.items) {
            if (onCv.some((shown) => skillMatches(item, shown))) continue;
            if (offList.some((pick) => skillMatches(item, pick))) continue;
            unplaced.push(`skill "${item}" (${key})`);
        }
    }

    // Courses: on the CV, or under off.coursework.
    const carrier = master.education.find((entry) => entry.coursework);
    if (carrier) {
        const printedEducation = cv.sections
            .flatMap((section) => section.entries || [])
            .find((entry) => entry.kind === "education" && entry.id === carrier.id);
        const onCv = printedEducation?.coursework || [];
        const offCourses = (off.coursework || []).map(String);
        for (const pick of offCourses) {
            const course = carrier.coursework.find((candidate) => courseMatches(candidate, pick));
            if (!course)
                problems.push(`cv.yaml off.coursework: master.yaml has no course "${pick}"`);
            else if (onCv.includes(course)) {
                problems.push(`cv.yaml: course "${course}" is on the CV and in off.coursework`);
            }
        }
        for (const course of carrier.coursework) {
            if (onCv.includes(course)) continue;
            if (offCourses.some((pick) => courseMatches(course, pick))) continue;
            unplaced.push(`course "${course}"`);
        }
    }

    if (unplaced.length) {
        problems.push(
            `cv.yaml: not placed yet: ${unplaced.join(", ")}. Put each on the CV under sections, ` +
                "or under off with why: room (up to the standard, no space), below (not up to it yet), " +
                "skills or coursework. The cv skill (.claude/skills/cv) says how to decide."
        );
    }
    return problems;
}

module.exports = { resolvePublicCv, loadCvSpec, belowStandard, triageProblems, CV_SPEC };
