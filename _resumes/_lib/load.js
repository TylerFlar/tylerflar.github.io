"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const DATA_DIR = path.join(__dirname, "..", "data");
const VARIANTS_DIR = path.join(__dirname, "..", "variants");

const KIND_COLLECTIONS = {
    education: "education",
    role: "roles",
    project: "projects",
    volunteer: "volunteering"
};

function fail(message) {
    throw new Error(message);
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

/** Load and validate _resumes/data/master.yaml (the CV itself). */
function loadMaster() {
    const file = path.join(DATA_DIR, "master.yaml");
    const master = yaml.load(fs.readFileSync(file, "utf8"));

    for (const key of ["education", "roles", "projects", "volunteering"]) {
        if (!Array.isArray(master[key])) fail(`master.yaml: missing "${key}" array`);
    }
    if (!master.skills || typeof master.skills !== "object") {
        fail('master.yaml: missing "skills" map');
    }

    // master.yaml carries the CV's own presentation: headline, summary, and the
    // section order. Every entry in the file is on the CV, so sections name a
    // collection rather than listing entries.
    for (const key of ["headline", "summary"]) {
        if (typeof master[key] !== "string" || !master[key].trim()) {
            fail(`master.yaml: "${key}" must be a non-empty string`);
        }
    }
    if (!Array.isArray(master.sections) || master.sections.length === 0) {
        fail('master.yaml: missing "sections" list (the CV section order)');
    }
    const seenKinds = new Set();
    for (const [idx, section] of master.sections.entries()) {
        const label = `master.yaml sections[${idx}]`;
        if (!section.title) fail(`${label}: missing title`);
        if (section.kind !== "skills" && !KIND_COLLECTIONS[section.kind]) {
            const valid = ["skills", ...Object.keys(KIND_COLLECTIONS)].join(", ");
            fail(`${label}: unknown kind "${section.kind}". Valid kinds: ${valid}`);
        }
        if (seenKinds.has(section.kind)) fail(`${label}: duplicate kind "${section.kind}"`);
        seenKinds.add(section.kind);
        if (section.entries !== undefined) {
            fail(
                `${label}: remove "entries" — every entry in master.yaml is on the CV. ` +
                    "Delete the entry itself to take it off, or tailor a variant spec."
            );
        }
    }
    for (const kind of Object.keys(KIND_COLLECTIONS)) {
        if (!seenKinds.has(kind)) {
            fail(
                `master.yaml: no section renders "${kind}", so ${KIND_COLLECTIONS[kind]} would ` +
                    "be dead content. Add a section for it or delete the collection."
            );
        }
    }

    master.index = {
        education: indexById(master.education, "master education"),
        role: indexById(master.roles, "master roles"),
        project: indexById(master.projects, "master projects"),
        volunteer: indexById(master.volunteering, "master volunteering")
    };

    for (const role of master.roles) {
        validateBullets(role.bullets, `role "${role.id}"`);
        role.subprojectIndex = indexById(role.subprojects || [], `role "${role.id}" subprojects`);
        for (const sub of role.subprojects || []) {
            validateBullets(sub.bullets, `subproject "${role.id}/${sub.id}"`);
        }
    }
    for (const project of master.projects) {
        validateBullets(project.bullets, `project "${project.id}"`);
    }
    for (const vol of master.volunteering) {
        validateBullets(vol.bullets, `volunteering "${vol.id}"`);
    }

    return master;
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
            // Per-variant text override keeps provenance but replaces rendering.
            return spec.text !== undefined ? { id: spec.id, text: spec.text } : found;
        }
        if (typeof spec.text !== "string") {
            fail(`${label}: bullet entry needs an "id" or inline "text"`);
        }
        return { text: spec.text };
    });
}

function resolveSubprojects(selection, role, label) {
    const all = role.subprojects || [];
    if (selection === "all") {
        return all.map((sub) => ({
            ...sub,
            bullets: (sub.bullets || []).filter((b) => !b.alt)
        }));
    }
    if (!Array.isArray(selection)) {
        fail(`${label}: "subprojects" must be "all" or a list`);
    }
    return selection.map((item) => {
        const spec = typeof item === "string" ? { id: item } : item;
        const sub = role.subprojectIndex.get(spec.id);
        if (!sub) {
            const valid = all.map((s) => s.id).join(", ");
            fail(`${label}: unknown subproject id "${spec.id}". Valid ids: ${valid}`);
        }
        return {
            ...sub,
            bullets: resolveBullets(spec.bullets ?? "all", sub, `${label}/${spec.id}`)
        };
    });
}

function resolveSkillsGroups(groups, master, label) {
    if (groups === "all") {
        return Object.values(master.skills);
    }
    if (!Array.isArray(groups)) fail(`${label}: "groups" must be "all" or a list`);
    return groups.map((group) => {
        if (group.use !== undefined) {
            const base = master.skills[group.use];
            if (!base) {
                const valid = Object.keys(master.skills).join(", ");
                fail(`${label}: unknown skills group "${group.use}". Valid keys: ${valid}`);
            }
            return { label: group.label ?? base.label, items: group.items ?? base.items };
        }
        if (!group.label || !Array.isArray(group.items)) {
            fail(`${label}: inline skills group needs "label" and "items"`);
        }
        return { label: group.label, items: group.items };
    });
}

/** Load a variant spec and resolve it against the master library. */
function resolveVariant(variantPath, master) {
    const name = path.basename(variantPath, ".yaml");
    const spec = yaml.load(fs.readFileSync(variantPath, "utf8"));
    if (!Array.isArray(spec.sections) || spec.sections.length === 0) {
        fail(`${name}: variant needs a non-empty "sections" list`);
    }
    const fontSize = spec.fontSize ?? "11pt";
    if (!/^\d+pt$/.test(fontSize)) fail(`${name}: invalid fontSize "${fontSize}"`);

    // Optional headline (one line under the name) and summary (short first
    // section) — plain canonical text, tailored per variant.
    for (const key of ["headline", "summary"]) {
        if (spec[key] !== undefined && (typeof spec[key] !== "string" || !spec[key].trim())) {
            fail(`${name}: "${key}" must be a non-empty string`);
        }
    }

    const sections = spec.sections.map((section, idx) => {
        const label = `${name} section "${section.title || idx}"`;
        if (!section.title) fail(`${label}: missing title`);

        if (section.kind === "skills" || section.groups !== undefined) {
            return {
                title: section.title,
                kind: "skills",
                groups: resolveSkillsGroups(section.groups, master, label)
            };
        }

        if (!KIND_COLLECTIONS[section.kind]) {
            fail(`${label}: unknown kind "${section.kind}"`);
        }
        if (!Array.isArray(section.entries) || section.entries.length === 0) {
            fail(`${label}: needs a non-empty "entries" list`);
        }

        const entries = section.entries.map((item) => {
            const entrySpec = typeof item === "string" ? { id: item } : item;
            const kind = entrySpec.kind ?? section.kind;
            const collection = master.index[kind];
            if (!collection) fail(`${label}: unknown entry kind "${kind}"`);
            const entry = collection.get(entrySpec.id);
            if (!entry) {
                const valid = [...collection.keys()].join(", ");
                fail(`${label}: unknown ${kind} id "${entrySpec.id}". Valid ids: ${valid}`);
            }
            const entryLabel = `${label} -> ${entrySpec.id}`;

            if (kind === "education") {
                return { kind, ...entry, ...pickOverrides(entrySpec) };
            }

            const resolved = {
                kind,
                ...entry,
                ...pickOverrides(entrySpec),
                bullets:
                    entrySpec.bullets !== undefined
                        ? resolveBullets(entrySpec.bullets, entry, entryLabel)
                        : entrySpec.subprojects !== undefined
                          ? []
                          : fail(
                                `${entryLabel}: "bullets" is required (use "all" to take everything)`
                            )
            };
            if (kind === "role" || kind === "volunteer") {
                resolved.subprojects =
                    entrySpec.subprojects !== undefined
                        ? resolveSubprojects(entrySpec.subprojects, entry, entryLabel)
                        : [];
            }
            return resolved;
        });

        return { title: section.title, kind: section.kind, entries };
    });

    return {
        name,
        fontSize,
        headline: spec.headline?.trim(),
        summary: spec.summary?.trim(),
        sections
    };
}

/**
 * Build the CV directly from master.yaml — no spec file.
 *
 * Takes every entry in master order with all non-alt bullets and all
 * subprojects, in the section order master.yaml declares. This is the
 * definition of "the CV is the master": there is nothing to select.
 */
function resolveCv(master, name = "_cv") {
    const sections = master.sections.map((section) => {
        if (section.kind === "skills") {
            return {
                title: section.title,
                kind: "skills",
                groups: Object.values(master.skills)
            };
        }

        const collection = master[KIND_COLLECTIONS[section.kind]];
        const entries = collection.map((entry) => {
            if (section.kind === "education") return { kind: section.kind, ...entry };

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

        return { title: section.title, kind: section.kind, entries };
    });

    return {
        name,
        fontSize: master.fontSize ?? "11pt",
        headline: master.headline.trim(),
        summary: master.summary.trim(),
        sections
    };
}

const OVERRIDE_FIELDS = [
    "org",
    "title",
    "location",
    "name",
    "tagline",
    "school",
    "degree",
    "field",
    "gpa",
    "blurb"
];

function pickOverrides(spec) {
    const out = {};
    for (const field of OVERRIDE_FIELDS) {
        if (spec[field] !== undefined) out[field] = spec[field];
    }
    return out;
}

function listVariantFiles() {
    return fs
        .readdirSync(VARIANTS_DIR)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => path.join(VARIANTS_DIR, f));
}

module.exports = {
    loadMaster,
    resolveVariant,
    resolveCv,
    resolveBullets,
    listVariantFiles,
    VARIANTS_DIR,
    DATA_DIR
};
