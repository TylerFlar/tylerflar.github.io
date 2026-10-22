"use strict";

/**
 * Tailored resumes. A spec in _resumes/resumes/<name>.yaml starts from the CV
 * and says what to keep, in what order:
 *
 *   headline: ...                   optional line under the name
 *   summary: ...                    optional short paragraph at the top
 *   fontSize: 10pt                  optional; 11pt by default
 *   coursework: false               optional; hides the Relevant Coursework line
 *   sections:
 *     - Education                   a CV section's title prints it as on the CV
 *     - Research Experience:        a title with entries prints just those, in order
 *         arclab: all               every CV bullet of the entry
 *         e4e: [lead, rtt]          bullet ids; a subproject id takes all of it
 *         aquamesh: [aquaspectra.work]   subproject.bullet picks one of its bullets
 *     - Experience (role):          any title, with its kind in parentheses
 *         resmed: all
 *     - Skills: [languages, ml]     skill groups by key; a bare "Skills" takes all
 *
 * `npm run resume new <name>` writes a spec with the whole CV in it, so making
 * a resume is deleting lines and reordering the rest.
 */

const path = require("path");
const { loadInterests, resolveCv } = require("./load.js");

const RESUMES_DIR = path.join(__dirname, "..", "resumes");

// Collection kinds a custom "Title (kind)" section can draw from.
const COLLECTIONS = {
    role: "roles",
    project: "projects",
    publication: "publications",
    award: "awards",
    volunteer: "volunteering",
    education: "education"
};
// Kinds whose entries print whole: no bullets to pick, so only "id: all".
const WHOLE_KINDS = ["education", "publication", "award"];
const CUSTOM_KINDS = [...Object.keys(COLLECTIONS), "skills"];
const SPEC_KEYS = ["headline", "summary", "fontSize", "coursework", "sections"];

function fail(message) {
    throw new Error(message);
}

const onCv = (bullets) => (bullets || []).filter((bullet) => !bullet.alt);

/** "Its bullets: a, b. Subprojects: rtt (x, y)" for an error message or a scaffold comment. */
function bulletMenu(entry) {
    const own = (entry.bullets || []).map((bullet) => bullet.id + (bullet.alt ? " (short)" : ""));
    const subs = (entry.subprojects || []).map(
        (sub) => `${sub.id} (${(sub.bullets || []).map((bullet) => bullet.id).join(", ")})`
    );
    return [own.length ? own.join(", ") : null, subs.length ? subs.join(", ") : null]
        .filter(Boolean)
        .join("; ");
}

/** The section a spec item names: a CV section title, "Interests", or "Title (kind)". */
function parseTitle(raw, master, label) {
    const custom = new RegExp(`^(.*\\S)\\s*\\((${CUSTOM_KINDS.join("|")})\\)$`).exec(raw);
    if (custom) return { title: custom[1], kind: custom[2], fromCv: false };
    if (raw === "Interests") return { title: raw, kind: "interests", fromCv: false };
    const section = master.sections.find((candidate) => candidate.title === raw);
    if (!section) {
        const titles = master.sections.map((candidate) => candidate.title).join(", ");
        fail(
            `${label}: the CV has no section called "${raw}". Use one of ${titles}, ` +
                'or "Interests", or name your own with its kind, like "Experience (role)".'
        );
    }
    return { title: raw, kind: section.kind, fromCv: true };
}

/** An entry's bullets and subprojects, picked by "all" or a list of ids. */
function pickBullets(entry, selection, label) {
    if (selection === "all") {
        return {
            bullets: onCv(entry.bullets),
            subprojects: (entry.subprojects || []).map((sub) => ({
                ...sub,
                bullets: onCv(sub.bullets)
            }))
        };
    }
    if (!Array.isArray(selection) || !selection.length) {
        fail(`${label}: use "all" or a list of bullet ids. Its bullets: ${bulletMenu(entry)}`);
    }
    const bullets = [];
    const picked = new Map();
    for (const pick of selection) {
        const [first, second, ...extra] = String(pick).split(".");
        const sub = (entry.subprojects || []).find((candidate) => candidate.id === first);
        if (second === undefined && !extra.length) {
            const bullet = (entry.bullets || []).find((candidate) => candidate.id === first);
            if (bullet) bullets.push(bullet);
            else if (sub) picked.set(sub.id, "all");
            else
                fail(
                    `${label}: no bullet or subproject "${pick}". Its bullets: ${bulletMenu(entry)}`
                );
            continue;
        }
        const bullet = sub && !extra.length && (sub.bullets || []).find((b) => b.id === second);
        if (!bullet) fail(`${label}: no bullet "${pick}". Its bullets: ${bulletMenu(entry)}`);
        if (picked.get(sub.id) !== "all")
            picked.set(sub.id, [...(picked.get(sub.id) || []), bullet]);
    }
    // Subprojects keep the CV's order, whatever order they were picked in.
    const subprojects = (entry.subprojects || [])
        .filter((sub) => picked.has(sub.id))
        .map((sub) => ({
            ...sub,
            bullets: picked.get(sub.id) === "all" ? onCv(sub.bullets) : picked.get(sub.id)
        }));
    return { bullets, subprojects };
}

function resolveEntries(kind, value, master, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(`${label}: list entries as "id: all" or "id: [bullet ids]"`);
    }
    const collection = master[COLLECTIONS[kind]];
    return Object.entries(value).map(([id, selection]) => {
        const entry = collection.find((candidate) => candidate.id === id);
        if (!entry) {
            const valid = collection.map((candidate) => candidate.id).join(", ");
            fail(`${label}: no ${kind} "${id}". Valid ids: ${valid}`);
        }
        if (WHOLE_KINDS.includes(kind)) {
            if (selection !== "all") fail(`${label} -> ${id}: use "all"`);
            return { kind, ...entry };
        }
        return { kind, ...entry, ...pickBullets(entry, selection, `${label} -> ${id}`) };
    });
}

function resolveSection(item, master, context) {
    const isMap = item && typeof item === "object" && !Array.isArray(item);
    if (typeof item !== "string" && !(isMap && Object.keys(item).length === 1)) {
        fail(`${context.label}: each section is a title, or a title with what to include`);
    }
    const [raw, value] = typeof item === "string" ? [item, undefined] : Object.entries(item)[0];
    const label = `${context.label} section "${raw}"`;
    const { title, kind, fromCv } = parseTitle(raw, master, label);
    const section = { title, kind, pageBreak: false };

    if (kind === "research-interests" || kind === "interests") {
        if (value != null) fail(`${label}: takes no entries, just the title`);
        if (kind === "interests") return { ...section, items: loadInterests().selected };
        return { ...section, text: master.researchInterests };
    }
    if (kind === "skills") {
        if (value == null) return { ...section, groups: Object.values(master.skills) };
        if (!Array.isArray(value)) fail(`${label}: list skill groups by key`);
        const groups = value.map(
            (key) =>
                master.skills[key] ??
                fail(
                    `${label}: no skill group "${key}". Keys: ${Object.keys(master.skills).join(", ")}`
                )
        );
        return { ...section, groups };
    }

    let entries;
    if (value == null) {
        if (!fromCv) fail(`${label}: a section you name yourself needs its entries listed`);
        entries = context.cv.sections.find((cvSection) => cvSection.title === title).entries;
    } else {
        entries = resolveEntries(kind, value, master, label);
    }
    if (kind === "education" && context.coursework === false) {
        entries = entries.map(({ coursework, ...entry }) => entry);
    }
    return { ...section, entries };
}

/** Resolve a parsed spec against the CV into something render-tex can print. */
function resolveResume(spec, master, name) {
    const label = `resume "${name}"`;
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
        fail(`${label}: expected headline, summary, fontSize, coursework and a sections list`);
    }
    for (const key of Object.keys(spec)) {
        if (!SPEC_KEYS.includes(key))
            fail(`${label}: unknown key "${key}". A spec takes ${SPEC_KEYS.join(", ")}`);
    }
    for (const key of ["headline", "summary"]) {
        if (spec[key] !== undefined && (typeof spec[key] !== "string" || !spec[key].trim())) {
            fail(`${label}: "${key}" must be text`);
        }
    }
    const fontSize = spec.fontSize ?? "11pt";
    if (!/^(10|11|12)pt$/.test(fontSize)) fail(`${label}: fontSize is 10pt, 11pt or 12pt`);
    if (spec.coursework !== undefined && typeof spec.coursework !== "boolean") {
        fail(`${label}: coursework is true or false`);
    }
    if (!Array.isArray(spec.sections) || !spec.sections.length) {
        fail(`${label}: needs a sections list. Run "npm run resume new ${name}" for a full one.`);
    }
    const context = { label, coursework: spec.coursework, cv: resolveCv(master) };
    const sections = spec.sections.map((item) => resolveSection(item, master, context));

    const printed = new Set();
    for (const section of sections) {
        for (const entry of section.entries || []) {
            const key = `${entry.kind}:${entry.id}`;
            if (printed.has(key)) fail(`${label}: "${entry.id}" is in more than one section`);
            printed.add(key);
        }
    }
    return {
        name,
        fontSize,
        headline: spec.headline?.trim(),
        summary: spec.summary?.trim(),
        source: `_resumes/resumes/${name}.yaml`,
        regenerate: `npm run resume ${name}`,
        sections
    };
}

/** A spec with the whole CV in it, each entry annotated with its bullet ids. */
function scaffoldResume(master, name) {
    const lines = [
        `# Resume: ${name}`,
        "#",
        "# This starts as the whole CV. Delete what this job doesn't need, reorder the",
        `# rest, then build it with: npm run resume ${name}`,
        "#",
        "# A bare title prints that CV section as it is. Under a title, each entry is",
        '# "id: all" or a list of bullet ids. A subproject id takes all of it, and',
        '# subproject.bullet takes one of its bullets. A "(short)" bullet is the',
        "# one-line website summary. Name your own section with its kind, like",
        '# "Experience (role)", to mix entries from different CV sections.',
        "",
        "# headline: A line under your name",
        "# summary: A short paragraph at the top",
        "# fontSize: 10pt",
        "# coursework: false",
        "",
        "sections:"
    ];
    const cv = resolveCv(master);
    for (const section of master.sections) {
        if (["research-interests", "skills"].includes(section.kind)) {
            const groups = section.kind === "skills" ? Object.keys(master.skills).join(", ") : null;
            lines.push(`  - ${section.title}${groups ? `   # or pick groups: [${groups}]` : ""}`);
            continue;
        }
        const entries = cv.sections.find((cvSection) => cvSection.title === section.title).entries;
        lines.push(`  - ${section.title}:`);
        for (const entry of entries) {
            const source = master[COLLECTIONS[section.kind]].find((item) => item.id === entry.id);
            const menu = WHOLE_KINDS.includes(section.kind) ? "" : bulletMenu(source);
            lines.push(`      ${entry.id}: all${menu ? `   # ${menu}` : ""}`);
        }
    }
    return `${lines.join("\n")}\n`;
}

module.exports = { resolveResume, scaffoldResume, RESUMES_DIR };
