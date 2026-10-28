"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { renderTex, renderHtml } = require("./markup.js");
const { assertNewestFirst } = require("./order.js");
const { budgetRows } = require("./budget.js");
const { validateSkillClaims } = require("./skills.js");

const DATA_DIR = path.join(__dirname, "..", "data");

const KIND_COLLECTIONS = {
    education: "education",
    role: "roles",
    project: "projects",
    publication: "publications",
    award: "awards",
    volunteer: "volunteering"
};

// Collections a CV can do without: left out means empty, and only a non-empty
// one needs a section to print it.
const OPTIONAL_COLLECTIONS = new Set(["awards"]);

// An award is dated the way awards usually are: a season and year, or a year.
const AWARD_TERM = /^(?:(Winter|Spring|Summer|Fall) )?(\d{4})$/;
const SEASON_MONTH = { Winter: "01", Spring: "04", Summer: "07", Fall: "10" };

// Kinds that render a whole standalone collection rather than a list of master
// entries, so a section declaring one carries no `entries`.
const COLLECTION_KINDS = new Set(["skills", "interests", "research-interests"]);

// The CV's Research Interests line is held to the shape of a line, not a
// paragraph, so a summary can't hide in it (see validateResearchInterests).
const RESEARCH_INTERESTS_MAX = 110;

// Each role has a track, which sets its typical week for the bullet budget and
// the section it prints in: each `kind: role` section in master.yaml lists the
// tracks it prints, and every track is in exactly one.
const ROLE_TRACKS = ["research", "industry", "teaching"];

// The homepage row and the CV line stay a glance, not a list. Dating apps cap
// at five badges for the same reason; ten is the outer bound before it reads as
// a wall instead of a few things about a person.
const MAX_INTERESTS = 10;

function fail(message) {
    throw new Error(message);
}

/**
 * Optional `pageBreak: true` on a section — start it on a fresh page.
 *
 * This is how a deliberately multi-page resume is composed: the author says
 * where the break falls, so a later page opens on a clean section boundary
 * instead of a half-finished entry. Length is a judgment call about what
 * earns its space, not a builder-enforced limit.
 */
function resolvePageBreak(section, label) {
    if (section.pageBreak === undefined) return false;
    if (typeof section.pageBreak !== "boolean") {
        fail(`${label}: "pageBreak" must be true or false`);
    }
    return section.pageBreak;
}

function indexById(list, label) {
    const map = new Map();
    for (const item of list || []) {
        if (!item.id) fail(`${label}: entry missing id`);
        if (map.has(item.id)) fail(`${label}: duplicate id "${item.id}"`);
        map.set(item.id, item);
    }
    return map;
}

// A publication is a citation, not a job: no bullets, just the fields a reader
// needs to find the paper. `authors` is canonical text so the CV can bold his
// own name; `date` is the month it was presented or published.
function validatePublication(entry, label) {
    for (const field of ["title", "authors", "venue", "date"]) {
        if (typeof entry[field] !== "string" || !entry[field].trim()) {
            fail(`${label}: publication "${entry.id}" missing "${field}"`);
        }
    }
    if (!/^\d{4}-\d{2}$/.test(entry.date)) {
        fail(`${label}: publication "${entry.id}" date must be "YYYY-MM", got "${entry.date}"`);
    }
    for (const field of ["location", "url", "urlLabel", "note"]) {
        if (entry[field] !== undefined && typeof entry[field] !== "string") {
            fail(`${label}: publication "${entry.id}" field "${field}" must be a string`);
        }
    }
}

// An award is a line, not a job: what it was, who gave it, when, and an
// optional note on what it paid for, printed below it like a publication's.
function validateAward(entry, label) {
    for (const field of ["name", "issuer", "term"]) {
        if (typeof entry[field] !== "string" || !entry[field].trim()) {
            fail(`${label}: award "${entry.id}" missing "${field}"`);
        }
    }
    if (!AWARD_TERM.test(entry.term)) {
        fail(
            `${label}: award "${entry.id}" term must be like "Summer 2024" or "2024", got "${entry.term}"`
        );
    }
    if (entry.note !== undefined && typeof entry.note !== "string") {
        fail(`${label}: award "${entry.id}" field "note" must be a string`);
    }
}

/** An award's term as a "YYYY-MM" month, for ordering: "Summer 2024" -> "2024-07". */
function awardMonth(term) {
    const [, season, year] = AWARD_TERM.exec(term);
    return `${year}-${season ? SEASON_MONTH[season] : "12"}`;
}

/**
 * The one-line Research Interests under the CV heading. It is the one
 * exception to the no-headline/no-summary guard in validateMaster, allowed
 * because academic readers look for it, and kept to a line of topics: short,
 * no first person, no closing punctuation. It needs its section and the
 * section needs it, so neither can be dead content.
 */
function validateResearchInterests(master, hasSection) {
    const label = 'master.yaml "researchInterests"';
    const text = master.researchInterests;
    if (text === undefined) {
        if (hasSection) fail(`${label}: the research-interests section needs this line`);
        return;
    }
    if (!hasSection) {
        fail(
            `${label} is set but no section prints it. Add ` +
                "{ title: Research Interests, kind: research-interests } to sections or delete it."
        );
    }
    if (typeof text !== "string" || !text.trim()) fail(`${label}: must be one line of text`);
    const length = [...text.trim()].length;
    if (length > RESEARCH_INTERESTS_MAX) {
        fail(
            `${label} is ${length} characters; keep it to ${RESEARCH_INTERESTS_MAX}, ` +
                "a line of topics rather than a summary"
        );
    }
    if (/\bI\b/.test(text) || /\b(I['’]m|my|me)\b/i.test(text)) {
        fail(`${label}: a line of topics, so leave out first person`);
    }
    if (/[.!?]\s*$/.test(text)) fail(`${label}: a line of topics, so drop the closing punctuation`);
    renderTex(text, label);
}

/**
 * Relevant coursework: one list, on one education entry, printed once at the
 * end of the Education section.
 */
function validateCoursework(education) {
    const carriers = education.filter((entry) => entry.coursework !== undefined);
    if (carriers.length > 1) {
        const ids = carriers.map((entry) => `"${entry.id}"`).join(" and ");
        fail(`master.yaml education: only one entry may list coursework; found it on ${ids}`);
    }
    for (const entry of carriers) {
        const label = `master.yaml education "${entry.id}" coursework`;
        if (!Array.isArray(entry.coursework) || !entry.coursework.length) {
            fail(`${label}: must be a non-empty list of courses`);
        }
        for (const course of entry.coursework) {
            if (typeof course !== "string" || !course.trim()) fail(`${label}: each course is text`);
            renderTex(course, label);
        }
    }
}

function validateBullets(bullets, label) {
    const seen = new Set();
    for (const bullet of bullets || []) {
        if (!bullet.id) fail(`${label}: bullet missing id`);
        if (seen.has(bullet.id)) fail(`${label}: duplicate bullet id "${bullet.id}"`);
        seen.add(bullet.id);
        if (typeof bullet.text !== "string" || !bullet.text.trim()) {
            fail(`${label}: bullet "${bullet.id}" missing text`);
        }
    }
}

/**
 * Load and validate _resumes/data/interests.yaml — the interests row.
 *
 * `bank` is the vocabulary (dating-app style: broad labels a stranger reads at
 * a glance); `selected` is what shows, and every id in it must exist in the
 * bank. That check is the guard rail: it stops the row from drifting into
 * one-off specifics.
 */
function loadInterests() {
    const file = path.join(DATA_DIR, "interests.yaml");
    const doc = yaml.load(fs.readFileSync(file, "utf8"));

    if (!doc || typeof doc !== "object") fail("interests.yaml: expected a mapping");
    if (!doc.bank || typeof doc.bank !== "object") fail('interests.yaml: missing "bank" map');

    const index = new Map();
    const groups = Object.entries(doc.bank).map(([key, group]) => {
        const label = `interests.yaml bank.${key}`;
        if (!group || typeof group !== "object") fail(`${label}: expected a mapping`);
        if (typeof group.label !== "string" || !group.label.trim()) {
            fail(`${label}: missing "label"`);
        }
        if (!Array.isArray(group.items) || !group.items.length) {
            fail(`${label}: needs a non-empty "items" list`);
        }
        const items = group.items.map((item) => {
            const where = `${label} item "${item?.id ?? "?"}"`;
            if (!item || typeof item !== "object" || !item.id) fail(`${where}: missing id`);
            if (index.has(item.id)) fail(`${where}: duplicate id "${item.id}"`);
            if (typeof item.label !== "string" || !item.label.trim()) {
                fail(`${where}: missing "label"`);
            }
            if (typeof item.emoji !== "string" || !item.emoji.trim()) {
                fail(`${where}: missing "emoji"`);
            }
            // The label goes on the CV through the LaTeX escaper; catch an
            // unrenderable character here, where the message names the entry,
            // rather than mid-render.
            renderTex(item.label, where);
            const resolved = { id: item.id, label: item.label, emoji: item.emoji, group: key };
            index.set(item.id, resolved);
            return resolved;
        });
        return { key, label: group.label, items };
    });

    const selected = resolveInterestIds(doc.selected ?? [], { index }, "interests.yaml selected");
    return { selected, groups, index };
}

/** Resolve a list of bank ids against the loaded bank, with the shared limits. */
function resolveInterestIds(ids, interests, label) {
    if (!Array.isArray(ids)) fail(`${label}: must be a list of bank ids`);
    if (ids.length > MAX_INTERESTS) {
        fail(
            `${label}: ${ids.length} interests selected; keep it to ${MAX_INTERESTS} or fewer ` +
                "(6-8 reads best)."
        );
    }
    const seen = new Set();
    return ids.map((id) => {
        if (typeof id !== "string") fail(`${label}: entries must be bank ids`);
        if (seen.has(id)) fail(`${label}: duplicate interest "${id}"`);
        seen.add(id);
        const found = interests.index.get(id);
        if (!found) {
            fail(
                `${label}: "${id}" is not in the bank. Add it under a bank category in ` +
                    "_resumes/data/interests.yaml first (as a broad, recognizable label), or " +
                    `pick from: ${[...interests.index.keys()].join(", ")}`
            );
        }
        return found;
    });
}

// _resumes/data/profile.yaml: which keys exist, which must, and the limits the
// sites they're pasted into enforce (LinkedIn's headline, GitHub's bio).
const PROFILE_FIELDS = {
    bio: "required",
    projectsIntro: "required",
    linkedinHeadline: "required",
    githubBio: "required"
};
const PROFILE_LIMITS = { linkedinHeadline: 220, githubBio: 160 };

// Profile text never goes to LaTeX, so rendering it as HTML is the whole check:
// the markup parses and there are no raw backslashes.
const assertCanonicalText = (text, label) => renderHtml(text, label);

/** Load and validate _resumes/data/profile.yaml, the about-me text. */
function loadProfile() {
    const file = path.join(DATA_DIR, "profile.yaml");
    return validateProfile(yaml.load(fs.readFileSync(file, "utf8")));
}

function validateProfile(profile) {
    const label = "profile.yaml";
    if (!profile || typeof profile !== "object") fail(`${label}: expected a mapping`);
    const allowed = Object.keys(PROFILE_FIELDS);
    for (const key of Object.keys(profile)) {
        if (!allowed.includes(key)) {
            fail(`${label}: unknown key "${key}". The schema is closed: ${allowed.join(", ")}`);
        }
    }
    for (const [key, need] of Object.entries(PROFILE_FIELDS)) {
        const value = profile[key];
        if (value === undefined) {
            if (need === "required") fail(`${label}: missing "${key}"`);
            continue;
        }
        if (typeof value !== "string" || !value.trim()) fail(`${label}: "${key}" must be text`);
        assertCanonicalText(value, `${label} ${key}`);
        const limit = PROFILE_LIMITS[key];
        const length = [...value.trim()].length;
        if (limit && length > limit) {
            fail(`${label}: "${key}" is ${length} characters; the limit there is ${limit}`);
        }
    }
    return profile;
}

/** Load and validate _resumes/data/master.yaml (the CV itself). */
function loadMaster() {
    const file = path.join(DATA_DIR, "master.yaml");
    return validateMaster(yaml.load(fs.readFileSync(file, "utf8")));
}

/**
 * Validate a parsed master.yaml document and index it. Split from the file
 * read so tests can hold every rule to a small fixture instead of the real CV.
 */
function validateMaster(master) {
    for (const key of ["education", "roles", "projects", "publications", "volunteering"]) {
        if (!Array.isArray(master[key])) fail(`master.yaml: missing "${key}" array`);
    }
    if (!master.skills || typeof master.skills !== "object") {
        fail('master.yaml: missing "skills" map');
    }
    for (const key of OPTIONAL_COLLECTIONS) {
        if (master[key] === undefined) master[key] = [];
        if (!Array.isArray(master[key])) fail(`master.yaml: "${key}" must be a list`);
    }

    // The CV carries no headline, no summary, and no interests row, on
    // purpose. That is enforced here rather than left as an unset key, because an
    // unset key is a toggle: any automated regeneration that re-adds one would
    // put it back on the CV silently. Turning them back on has to be a
    // deliberate edit to THIS check, never a side effect of a resume build.
    // Tailored resumes are unaffected and carry their own (see resume.js).
    // The one-line Research Interests is the deliberate exception, and
    // validateResearchInterests keeps it a line of topics.
    for (const key of ["headline", "summary"]) {
        if (master[key] !== undefined) {
            fail(
                `master.yaml: "${key}" is deliberately off the CV — delete the key. ` +
                    `An application's resume sets its own "${key}" in its resume.yaml; ` +
                    "to put it back on the CV, remove this guard in _resumes/_lib/load.js."
            );
        }
    }
    if (!Array.isArray(master.sections) || master.sections.length === 0) {
        fail('master.yaml: missing "sections" list (the CV section order)');
    }
    // Roles print under the section that lists their track (Experience for
    // industry and research, Teaching), so `role` is the one kind that may
    // repeat: once per set of tracks, and never two sections for one track.
    const seenKinds = new Set();
    const roleTracks = new Set();
    for (const [idx, section] of master.sections.entries()) {
        const label = `master.yaml sections[${idx}]`;
        if (!section.title) fail(`${label}: missing title`);
        if (!COLLECTION_KINDS.has(section.kind) && !KIND_COLLECTIONS[section.kind]) {
            const valid = [...COLLECTION_KINDS, ...Object.keys(KIND_COLLECTIONS)].join(", ");
            fail(`${label}: unknown kind "${section.kind}". Valid kinds: ${valid}`);
        }
        if (section.kind === "role") {
            const { tracks } = section;
            if (
                !Array.isArray(tracks) ||
                !tracks.length ||
                tracks.some((track) => !ROLE_TRACKS.includes(track))
            ) {
                fail(
                    `${label}: a role section lists the tracks it prints, some of ` +
                        `${ROLE_TRACKS.join(", ")}, like "tracks: [industry, research]"`
                );
            }
            for (const track of tracks) {
                if (roleTracks.has(track)) fail(`${label}: track "${track}" is in two sections`);
                roleTracks.add(track);
            }
        } else if (section.tracks !== undefined) {
            fail(`${label}: "tracks" only applies to role sections`);
        }
        // Same guard as headline/summary: the interests row is off the CV, and a
        // section re-added by an unattended run must fail the build loudly
        // instead of quietly printing. The picks themselves stay live for the
        // website and for any variant that wants them.
        if (section.kind === "interests") {
            fail(
                `${label}: the interests row is deliberately off the CV — delete this section. ` +
                    "Variants may declare one, and the website hero still renders " +
                    "_resumes/data/interests.yaml either way."
            );
        }
        // Two role sections can't share a track (checked above), so only the
        // other kinds can repeat by accident.
        if (section.kind !== "role" && seenKinds.has(section.kind)) {
            fail(`${label}: duplicate kind "${section.kind}"`);
        }
        seenKinds.add(section.kind);
        if (resolvePageBreak(section, label) && idx === 0) {
            fail(`${label}: "pageBreak" on the first section would leave page 1 empty`);
        }
        if (section.entries !== undefined) {
            fail(
                `${label}: remove "entries" — a section here prints every entry in it. ` +
                    "Pick entries for the CV in _resumes/data/cv.yaml, or in an application's resume.yaml."
            );
        }
    }
    for (const [kind, key] of Object.entries(KIND_COLLECTIONS)) {
        const optional = OPTIONAL_COLLECTIONS.has(key);
        if (!seenKinds.has(kind) && !(optional && master[key].length === 0)) {
            fail(
                `master.yaml: no section renders "${kind}", so ${key} would ` +
                    "be dead content. Add a section for it or delete the collection."
            );
        }
        if (seenKinds.has(kind) && optional && master[key].length === 0) {
            fail(`master.yaml: the "${kind}" section has no ${key} to print. Delete it.`);
        }
    }

    validateResearchInterests(master, seenKinds.has("research-interests"));
    validateCoursework(master.education);

    master.index = {
        education: indexById(master.education, "master education"),
        role: indexById(master.roles, "master roles"),
        project: indexById(master.projects, "master projects"),
        publication: indexById(master.publications, "master publications"),
        award: indexById(master.awards, "master awards"),
        volunteer: indexById(master.volunteering, "master volunteering")
    };

    for (const role of master.roles) {
        if (!ROLE_TRACKS.includes(role.track)) {
            fail(
                `role "${role.id}": add "track: ${ROLE_TRACKS.join(" | ")}", ` +
                    "which sets its typical week and the section it prints under"
            );
        }
        if (!roleTracks.has(role.track)) {
            fail(
                `role "${role.id}": track "${role.track}" has no section, so the role would be ` +
                    `off the CV. Add ${role.track} to a role section's tracks, or change its track.`
            );
        }
    }
    for (const track of roleTracks) {
        if (!master.roles.some((role) => role.track === track)) {
            fail(
                `master.yaml: no role has the "${track}" track, so its section lists it for ` +
                    "nothing. Take it out of the section's tracks, or give a role that track."
            );
        }
    }

    for (const role of master.roles) {
        validateBullets(role.bullets, `role "${role.id}"`);
        role.subprojectIndex = indexById(role.subprojects || [], `role "${role.id}" subprojects`);
        for (const sub of role.subprojects || []) {
            validateBullets(sub.bullets, `subproject "${role.id}/${sub.id}"`);
            // Cutting bullets to a shrinking budget can empty one, and an empty
            // subproject is a heading with nothing under it.
            if (!(sub.bullets || []).some((bullet) => !bullet.alt)) {
                fail(
                    `subproject "${role.id}/${sub.id}": no CV bullets left. Give it one, or delete ` +
                        "it along with its project page."
                );
            }
        }
    }
    for (const project of master.projects) {
        validateBullets(project.bullets, `project "${project.id}"`);
    }
    for (const vol of master.volunteering) {
        validateBullets(vol.bullets, `volunteering "${vol.id}"`);
    }
    for (const pub of master.publications) {
        validatePublication(pub, "master publications");
    }
    for (const award of master.awards) {
        validateAward(award, "master awards");
    }

    // The bullet budget depends on today's date (budget.js has the rule), so it
    // fails npm run cv and the tests, not every load: a month turning over
    // shouldn't stop the site or an application from building. A leftover tier
    // or an impossible hoursPerWeek is a mistake in the file, so it fails here.
    budgetRows(master);

    // Every skill is backed by an entry that names it (skills.js), so taking an
    // entry off fails here until the skills only it backed come off too.
    validateSkillClaims(master);

    // The CV prints every list in file order, so the file keeps each one newest
    // first (order.js has the rule). A role or project that ends moves down past
    // the ones still running, or the build fails here and names the entry.
    for (const key of ["roles", "projects", "volunteering", "education"]) {
        assertNewestFirst(master[key], `master.yaml ${key}`);
    }
    for (const entry of [...master.roles, ...master.volunteering]) {
        assertNewestFirst(entry.subprojects || [], `master.yaml ${entry.id} subprojects`);
    }
    assertNewestFirst(master.publications, "master.yaml publications", (pub) => ({
        start: pub.date,
        end: pub.date
    }));
    assertNewestFirst(master.awards, "master.yaml awards", (award) => ({
        start: awardMonth(award.term),
        end: awardMonth(award.term)
    }));

    return master;
}

/**
 * The master.yaml entry a project page is for, from its `cv:` front matter:
 * "project/<id>", "role/<id>", or "role/<id>/<subproject id>". The page's card
 * takes its dates from that entry. A project on the site is a project on the
 * CV, so a page that names no entry fails the build.
 */
function findCvEntry(master, ref, label) {
    const usage = "name its CV entry as cv: project/<id>, role/<id> or role/<id>/<subproject>";
    const [kind, id, subId, ...extra] = typeof ref === "string" ? ref.split("/") : [];
    if (!["project", "role"].includes(kind) || !id || extra.length) {
        fail(`${label}: ${ref === undefined ? "no cv" : `cv "${ref}"`}; ${usage}`);
    }
    if (subId !== undefined && kind !== "role") fail(`${label}: cv "${ref}"; ${usage}`);
    const collection = master.index[kind];
    const entry = collection.get(id);
    if (!entry) {
        const valid = [...collection.keys()].join(", ");
        fail(`${label}: cv "${ref}": master.yaml has no ${kind} "${id}". Valid ids: ${valid}`);
    }
    if (subId === undefined) return entry;
    const sub = entry.subprojectIndex.get(subId);
    if (!sub) {
        const valid = [...entry.subprojectIndex.keys()].join(", ") || "none";
        fail(
            `${label}: cv "${ref}": role "${id}" has no subproject "${subId}". Valid ids: ${valid}`
        );
    }
    return sub;
}

function bulletIds(entry) {
    return (entry.bullets || []).map((b) => b.id).join(", ");
}

/** Resolve a bullet selection ("all" | list) against a master entry. */
function resolveBullets(selection, entry, label) {
    if (selection === "all") {
        return (entry.bullets || []).filter((b) => !b.alt);
    }
    if (!Array.isArray(selection)) {
        fail(`${label}: "bullets" must be "all" or a list (tailoring is explicit)`);
    }
    return selection.map((item) => {
        const spec = typeof item === "string" ? { id: item } : item;
        if (spec.id !== undefined) {
            const found = (entry.bullets || []).find((b) => b.id === spec.id);
            if (!found) {
                fail(`${label}: unknown bullet id "${spec.id}". Valid ids: ${bulletIds(entry)}`);
            }
            // An inline text override keeps the id but replaces the wording.
            return spec.text !== undefined ? { id: spec.id, text: spec.text } : found;
        }
        if (typeof spec.text !== "string") {
            fail(`${label}: bullet entry needs an "id" or inline "text"`);
        }
        return { text: spec.text };
    });
}

/**
 * The whole record, straight from master.yaml: every entry in master order with
 * all non-alt bullets and all subprojects, in the section order master.yaml
 * declares. A resume spec's bare section title prints from this, and a new
 * application's resume.yaml starts as all of it. The public CV is cv.yaml's
 * pick from it (cv.js).
 */
function resolveCv(master) {
    const sections = master.sections.flatMap((section) => {
        const pageBreak = section.pageBreak === true;
        if (section.kind === "skills") {
            return {
                title: section.title,
                kind: "skills",
                pageBreak,
                groups: Object.values(master.skills)
            };
        }
        if (section.kind === "research-interests") {
            return {
                title: section.title,
                kind: section.kind,
                pageBreak,
                text: master.researchInterests
            };
        }
        // No interests branch here on purpose: loadMaster rejects that section
        // outright, so the CV has no path to an interests row at all.
        const collection = master[KIND_COLLECTIONS[section.kind]];
        // A role section prints the roles on its tracks, still in file order,
        // which is newest first.
        const members =
            section.kind === "role"
                ? collection.filter((role) => section.tracks.includes(role.track))
                : collection;
        const entries = members.map((entry) => {
            if (["education", "publication", "award"].includes(section.kind)) {
                return { kind: section.kind, ...entry };
            }

            const resolved = {
                kind: section.kind,
                ...entry,
                bullets: (entry.bullets || []).filter((b) => !b.alt)
            };
            if (section.kind === "role" || section.kind === "volunteer") {
                resolved.subprojects = (entry.subprojects || []).map((sub) => ({
                    ...sub,
                    bullets: (sub.bullets || []).filter((b) => !b.alt)
                }));
            }
            return resolved;
        });

        return { title: section.title, kind: section.kind, pageBreak, entries };
    });

    // No headline/summary keys in the returned object: renderResumeTex emits
    // each only when truthy, so their absence here is the second half of the
    // guard in loadMaster — the CV cannot grow either one by accident.
    // `source` and `regenerate` go into the .tex header.
    return {
        name: "_cv",
        fontSize: master.fontSize ?? "11pt",
        source: "_resumes/data/master.yaml",
        regenerate: "node _resumes/_generate.js",
        sections
    };
}

module.exports = {
    loadMaster,
    validateMaster,
    loadProfile,
    validateProfile,
    findCvEntry,
    loadInterests,
    resolveInterestIds,
    resolveCv,
    resolveBullets,
    MAX_INTERESTS,
    ROLE_TRACKS,
    DATA_DIR
};
