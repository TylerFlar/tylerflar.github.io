"use strict";

/**
 * An application's resume. _resumes/applications/<name>/resume.yaml starts
 * from master.yaml, the whole record, and says what to keep, in what order.
 * The public CV is one of these too: _resumes/data/cv.yaml, through cv.js.
 *
 *   headline, summary, fontSize     read, but the standard every document meets
 *                                   (standard.js) holds them off: no headline or
 *                                   summary, and the CV's 11pt
 *   coursework: false               optional; hides the Relevant Coursework line,
 *                                   and a list of courses keeps just those
 *   maxPages: 1                     optional; the build fails if the PDF runs longer
 *   compactHeading: true            optional; one contact line instead of the CV's two
 *   sections:
 *     - Education                   a CV section's title prints it as on the CV
 *     - Experience:                 a title with entries prints just those, in order
 *         arclab: all               every CV bullet of the entry
 *         resmed:
 *           - docs-toolchain
 *           - usage-analysis: ...   a bullet reworded for this job
 *         e4e: [lead, rtt.software] bullet ids; a subproject id takes all of it,
 *                                   and subproject.bullet picks one of its bullets
 *         cubic: []                 a role with no bullets prints just its heading
 *     - Teaching and Mentoring (role):   any title, with its kind in parentheses
 *         ta: all
 *     - Projects:
 *         followme: { tagline: ..., bullets: all }   a reworded tagline
 *     - Publications:
 *         chaser: { note: ... }     a reworded note, on a paper or an award
 *     - Skills: [languages, { systems: [Linux, Git] }]
 *                                   skill groups by key, or some of a group's items;
 *                                   a bare "Skills" takes all
 *
 * A resume can only say what the CV says, so a rewording has to pass the CV's
 * own rules (rewordProblems): the voice lint, the bullet rules for a bullet or
 * a note, and no number that isn't in the CV's text for its entry or on the
 * entry's project page. The build prints each one as a word diff against the
 * CV for the rest. Skills and coursework can be trimmed, never added to. Past
 * resolving, npm run apply holds a resume to the standard the CV meets
 * (standard.js): nothing cv.yaml holds below it can be picked, and every role
 * the CV has stays on, if only as its heading.
 *
 * `npm run apply new <name>` writes one with every entry in it, so making a
 * resume is deleting lines and reordering the rest (see _apply.js).
 */

const { loadInterests, resolveCv } = require("./load.js");
const { normalizeBulletText } = require("./markup.js");
const { findTells, bulletProblems } = require("./voice.js");
const { loadProjectPages } = require("./pages.js");

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
// What an entry can set in the map form, "id: { ... }": a project's tagline
// and its bullets, and a paper's or an award's note.
const MAP_KEYS = { project: ["tagline", "bullets"], publication: ["note"], award: ["note"] };
const CUSTOM_KINDS = [...Object.keys(COLLECTIONS), "skills"];
const SPEC_KEYS = [
    "headline",
    "summary",
    "fontSize",
    "coursework",
    "maxPages",
    "compactHeading",
    "sections"
];

// Number words the CV spells out ("two wildlife-tracking projects"), so a
// rewording that writes the digit still finds its number.
const NUMBER_WORDS = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    dozen: 12,
    hundred: 100,
    thousand: 1000
};

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
                'or "Interests", or name your own with its kind, like "Teaching and Mentoring (role)".'
        );
    }
    return { title: raw, kind: section.kind, fromCv: true };
}

/** The key and value of a one-key map, which is how YAML reads "- key: value" in a list. */
function soleEntry(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const entries = Object.entries(item);
    return entries.length === 1 ? entries[0] : null;
}

/** New wording for a bullet, tagline or note, on one line however the YAML wrapped it. */
function wording(value, label) {
    if (typeof value !== "string" || !value.trim()) fail(`${label}: give the new wording as text`);
    return value.replace(/\s+/g, " ").trim();
}

/** A bullet pick: "id", "subproject", "subproject.id", or "id: new wording". */
function parsePick(pick, label) {
    if (pick === null || typeof pick !== "object") return { ref: String(pick) };
    const sole = soleEntry(pick);
    if (!sole) fail(`${label}: pick a bullet by its id, or reword one as "id: new wording"`);
    return { ref: sole[0], text: wording(sole[1], `${label} -> ${sole[0]}`) };
}

/**
 * An entry's bullets and subprojects, picked by "all" or a list of picks. A
 * bullet picked with new wording goes through `reword`, which records it.
 */
function pickBullets(entry, selection, label, reword) {
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
    const seen = new Set();
    const mixed = (sub) =>
        `${label}: "${sub.id}" is picked whole and one bullet at a time. Pick it one way.`;
    for (const pick of selection) {
        const { ref, text } = parsePick(pick, label);
        if (seen.has(ref)) fail(`${label}: "${ref}" is picked twice`);
        seen.add(ref);
        const [first, second, ...extra] = ref.split(".");
        const sub = (entry.subprojects || []).find((candidate) => candidate.id === first);
        if (second === undefined && !extra.length) {
            const bullet = (entry.bullets || []).find((candidate) => candidate.id === first);
            if (bullet) {
                bullets.push(reword(bullet, text, ref));
                continue;
            }
            if (!sub) {
                fail(
                    `${label}: no bullet or subproject "${ref}". Its bullets: ${bulletMenu(entry)}`
                );
            }
            if (text !== undefined) {
                const example = (sub.bullets || [])[0]?.id ?? "bullet";
                fail(
                    `${label} -> ${ref}: that's a whole subproject. Reword one of its bullets, like ${ref}.${example}`
                );
            }
            if (picked.has(sub.id)) fail(mixed(sub));
            picked.set(sub.id, "all");
            continue;
        }
        const bullet = sub && !extra.length && (sub.bullets || []).find((b) => b.id === second);
        if (!bullet) fail(`${label}: no bullet "${ref}". Its bullets: ${bulletMenu(entry)}`);
        if (picked.get(sub.id) === "all") fail(mixed(sub));
        picked.set(sub.id, [...(picked.get(sub.id) || []), reword(bullet, text, ref)]);
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

function resolveEntries(kind, value, master, label, context) {
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
        const where = `${label} -> ${id}`;
        const record = (what, cv, text, isBullet) =>
            context.rewordings.push({ where: what, kind, entry, cv, text, isBullet });

        const isMap =
            Boolean(selection) && typeof selection === "object" && !Array.isArray(selection);
        if (isMap && !MAP_KEYS[kind]) {
            fail(
                WHOLE_KINDS.includes(kind)
                    ? `${where}: use "all"`
                    : `${where}: use "all" or a list of bullet ids. Its bullets: ${bulletMenu(entry)}`
            );
        }
        const options = isMap ? selection : {};
        for (const key of Object.keys(options)) {
            if (!MAP_KEYS[kind].includes(key)) {
                fail(`${where}: a ${kind} sets ${MAP_KEYS[kind].join(" and ")} here, not "${key}"`);
            }
        }
        const reworded = {};
        for (const field of ["tagline", "note"]) {
            if (options[field] === undefined) continue;
            if (typeof entry[field] !== "string") {
                fail(`${where}: it has no ${field} on the CV to reword`);
            }
            reworded[field] = wording(options[field], `${where} ${field}`);
            record(`${id} ${field}`, entry[field], reworded[field], field === "note");
        }

        if (WHOLE_KINDS.includes(kind)) {
            if (!isMap && selection !== "all") fail(`${where}: use "all"`);
            return { kind, ...entry, ...reworded };
        }
        const reword = (bullet, text, ref) => {
            if (text === undefined) return bullet;
            record(`${id} -> ${ref}`, bullet.text, text, true);
            // Only the id and the new text: a tex: or html: escape hatch on the
            // CV's bullet would print the old wording.
            return { id: bullet.id, text };
        };
        const bullets = isMap ? (options.bullets ?? "all") : selection;
        // A role the job doesn't need keeps its heading, so its dates still
        // count toward the years of experience a parser adds up.
        if (kind === "role" && Array.isArray(bullets) && !bullets.length) {
            return { kind, ...entry, bullets: [], subprojects: [] };
        }
        return { kind, ...entry, ...reworded, ...pickBullets(entry, bullets, where, reword) };
    });
}

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase();
// A skill by its name, or by what comes before its parentheses ("AWS" for
// "AWS (EC2, Lambda, ...)"), which saves quoting the commas in a YAML list.
const skillMatches = (item, pick) =>
    sameText(item, pick) || sameText(item.replace(/\s*\(.*\)$/, ""), pick);
// A course by its full name or by its code, like "CSE 237D".
const courseMatches = (course, pick) =>
    sameText(course, pick) || course.toLowerCase().startsWith(`${pick.toLowerCase()} `);

/**
 * Some of a list's items, in the order picked: skills from a group, or courses
 * from the coursework. Each pick matches exactly one item, which prints as the
 * CV has it, so a resume can trim a list but never add to it.
 */
function pickFrom(items, picks, label, noun, matches) {
    if (!Array.isArray(picks) || !picks.length) {
        fail(`${label}: list the ${noun}s to keep. Its ${noun}s: ${items.join(", ")}`);
    }
    const kept = picks.map((pick) => {
        const found = items.filter((item) => matches(item, String(pick)));
        if (found.length > 1) {
            fail(`${label}: "${pick}" matches more than one ${noun}: ${found.join(", ")}`);
        }
        return (
            found[0] ?? fail(`${label}: no ${noun} "${pick}". Its ${noun}s: ${items.join(", ")}`)
        );
    });
    const twice = kept.find((item, i) => kept.indexOf(item) !== i);
    if (twice) fail(`${label}: "${twice}" is picked twice`);
    return kept;
}

function resolveSkills(value, master, label) {
    if (value == null) return Object.values(master.skills);
    if (!Array.isArray(value)) fail(`${label}: list skill groups by key`);
    const keys = Object.keys(master.skills).join(", ");
    const seen = new Set();
    return value.map((item) => {
        const [key, picks] =
            typeof item === "string"
                ? [item, undefined]
                : (soleEntry(item) ??
                  fail(`${label}: list a skill group by its key, or as "key: [skills to keep]"`));
        if (seen.has(key)) fail(`${label}: "${key}" is listed twice`);
        seen.add(key);
        const group =
            master.skills[key] ?? fail(`${label}: no skill group "${key}". Keys: ${keys}`);
        if (picks === undefined) return group;
        return {
            ...group,
            items: pickFrom(group.items, picks, `${label} -> ${key}`, "skill", skillMatches)
        };
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
    if (kind === "skills") return { ...section, groups: resolveSkills(value, master, label) };

    let entries;
    if (value == null) {
        if (!fromCv) fail(`${label}: a section you name yourself needs its entries listed`);
        entries = context.cv.sections.find((cvSection) => cvSection.title === title).entries;
    } else {
        entries = resolveEntries(kind, value, master, label, context);
    }
    if (kind === "education" && context.coursework === false) {
        entries = entries.map(({ coursework, ...entry }) => entry);
    } else if (kind === "education" && Array.isArray(context.coursework)) {
        entries = entries.map((entry) =>
            entry.coursework ? { ...entry, coursework: context.coursework } : entry
        );
    }
    return { ...section, entries };
}

/** The numbers written as digits in a text, each with the value it stands for. */
function numbersIn(text) {
    return (text.match(/\d+(?:[.,]\d+)*/g) || []).map((raw) => {
        const value = Number(raw.replace(/,/g, ""));
        return { raw, value: Number.isNaN(value) ? raw : String(value) };
    });
}

/** Every value a set of texts gives a number, in digits or spelled out. */
function knownNumbers(texts) {
    const known = new Set();
    for (const text of texts) {
        for (const { value } of numbersIn(text)) known.add(value);
        for (const word of text.toLowerCase().match(/[a-z]+/g) || []) {
            if (NUMBER_WORDS[word] !== undefined) known.add(String(NUMBER_WORDS[word]));
        }
    }
    return known;
}

/** Every piece of text in a master.yaml entry, its subprojects included. */
function entryText(value) {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(entryText);
    if (value && typeof value === "object" && !(value instanceof Map)) {
        return Object.values(value).flatMap(entryText);
    }
    return [];
}

/** The project pages about an entry: its own, its subprojects', or one linking the paper. */
function pagesFor(kind, entry, pages) {
    return pages.filter((page) => {
        const cv = String(page.cv);
        if (kind === "project") return cv === `project/${entry.id}`;
        if (kind === "role") return cv === `role/${entry.id}` || cv.startsWith(`role/${entry.id}/`);
        if (kind === "publication") return Boolean(entry.url) && page.raw.includes(entry.url);
        return false;
    });
}

/** A bullet or note as the resume prints it, closing period and all. */
const printed = (text, isBullet) => {
    const flat = text.replace(/\s+/g, " ").trim();
    return isBullet ? normalizeBulletText(flat) : flat;
};

/**
 * What keeps a rewording off the resume: the voice lint's tells, the bullet
 * rules for a bullet or a note, a number that isn't in the CV's text for its
 * entry or on the entry's project page, and wording that's the CV's already.
 * A stretched verb gets past all of these, which is what the build's word diff
 * is for.
 */
function rewordProblems(change, sources) {
    const problems = findTells(change.text).map((hit) => `${hit.reason}: "${hit.snippet}"`);
    if (change.isBullet) problems.push(...bulletProblems(change.text, change.where));
    const known = knownNumbers(sources);
    const unknown = new Set(
        numbersIn(change.text)
            .filter((number) => !known.has(number.value))
            .map((number) => number.raw)
    );
    for (const raw of unknown) {
        problems.push(
            `"${raw}" isn't in the CV's text for ${change.entry.id} or on its project page`
        );
    }
    if (printed(change.text, change.isBullet) === printed(change.cv, change.isBullet)) {
        problems.push("that's the CV's wording already, so leave the rewording out");
    }
    return problems;
}

/** Resolve a parsed spec against the CV into something render-tex can print. */
function resolveResume(spec, master, name, { pages } = {}) {
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
    if (spec.compactHeading !== undefined && typeof spec.compactHeading !== "boolean") {
        fail(`${label}: compactHeading is true or false`);
    }
    if (spec.maxPages !== undefined && !(Number.isInteger(spec.maxPages) && spec.maxPages > 0)) {
        fail(`${label}: maxPages is a whole number of pages, like 1`);
    }
    let coursework = spec.coursework;
    const courseCarrier = master.education.find((entry) => entry.coursework);
    if (Array.isArray(coursework)) {
        if (!courseCarrier) fail(`${label}: the CV lists no coursework to pick from`);
        coursework = pickFrom(
            courseCarrier.coursework,
            coursework,
            `${label} coursework`,
            "course",
            courseMatches
        );
    } else if (coursework !== undefined && typeof coursework !== "boolean") {
        fail(`${label}: coursework is true, false or a list of courses to keep`);
    }
    if (!Array.isArray(spec.sections) || !spec.sections.length) {
        fail(`${label}: needs a sections list. A new application's resume.yaml has a full one.`);
    }
    const context = { label, coursework, cv: resolveCv(master), rewordings: [] };
    const sections = spec.sections.map((item) => resolveSection(item, master, context));

    const printedEntries = new Set();
    for (const section of sections) {
        for (const entry of section.entries || []) {
            const key = `${entry.kind}:${entry.id}`;
            if (printedEntries.has(key))
                fail(`${label}: "${entry.id}" is in more than one section`);
            printedEntries.add(key);
        }
    }
    if (Array.isArray(coursework) && !printedEntries.has(`education:${courseCarrier.id}`)) {
        fail(`${label}: coursework comes from ${courseCarrier.id}, which isn't on this resume`);
    }

    // Every rewording's problems at once, so one build lists everything to fix.
    if (context.rewordings.length) {
        const allPages = pages ?? loadProjectPages();
        const problems = context.rewordings.flatMap((change) => {
            const sources = [
                ...entryText(change.entry),
                ...pagesFor(change.kind, change.entry, allPages).map((page) => page.prose)
            ];
            return rewordProblems(change, sources).map(
                (problem) => `  ${change.where}: ${problem}`
            );
        });
        if (problems.length) fail(`${label}: fix these rewordings:\n${problems.join("\n")}`);
    }

    return {
        name,
        fontSize,
        maxPages: spec.maxPages,
        compactHeading: spec.compactHeading === true,
        headline: spec.headline?.trim(),
        summary: spec.summary?.trim(),
        source: `_resumes/applications/${name}/resume.yaml`,
        regenerate: `npm run apply ${name}`,
        // Each rewording as it prints, beside the CV's, for the build to diff.
        rewordings: context.rewordings.map(({ where, cv, text, isBullet }) => ({
            where,
            cv: printed(cv, isBullet),
            text: printed(text, isBullet)
        })),
        sections
    };
}

/**
 * An entry's picks for a new resume: "all", or the bullets and subprojects
 * left once what cv.yaml holds below the standard is taken out.
 */
function scaffoldPicks(entry, below) {
    const held = (key) => below.has(key);
    const bullets = onCv(entry.bullets).filter((bullet) => !held(`${entry.id}.${bullet.id}`));
    const picks = bullets.map((bullet) => bullet.id);
    let trimmed = bullets.length !== onCv(entry.bullets).length;
    for (const sub of entry.subprojects || []) {
        const key = `${entry.id}.${sub.id}`;
        if (held(key)) {
            trimmed = true;
            continue;
        }
        const kept = onCv(sub.bullets).filter((bullet) => !held(`${key}.${bullet.id}`));
        if (kept.length === onCv(sub.bullets).length) picks.push(sub.id);
        else {
            trimmed = true;
            picks.push(...kept.map((bullet) => `${sub.id}.${bullet.id}`));
        }
    }
    return trimmed ? `[${picks.join(", ")}]` : "all";
}

/**
 * A new application's resume.yaml: every entry in master.yaml but what cv.yaml
 * holds below the standard (`below`), each annotated with its bullet ids, held
 * to one page with the one-line heading.
 */
function scaffoldResume(master, name, { below = new Map() } = {}) {
    const lines = [
        `# Resume for ${name}. It starts with every entry in master.yaml. Delete what`,
        `# this job doesn't need, reorder the rest, then build it with: npm run apply ${name}`,
        "#",
        "# A bare title prints that CV section as it is. Under a title, each entry is",
        '# "id: all" or a list of bullet ids. A subproject id takes all of it, and',
        '# subproject.bullet takes one of its bullets. A "(short)" bullet is the',
        "# one-line website summary. Name your own section with its kind, like",
        '# "Teaching and Mentoring (role)", to mix entries from different CV sections.',
        "#",
        "# Every role the CV has stays on. One this job doesn't need keeps its",
        '# heading as "id: []", since a parser adds up the roles\' dates into years',
        "# of experience.",
        "#",
        "# To reword a bullet for this job, give it new text in the list, as",
        "# \"- bullet-id: new wording\". A project's tagline and a paper's note can be",
        "# reworded too (see the README). The build prints each rewording as a",
        "# word diff against the CV, and fails one that breaks a rule the CV keeps or",
        "# has a number the CV and the project page don't. Skills and coursework can",
        "# be trimmed, but not added to.",
        "#",
        "# The build holds it to the CV's standard (_resumes/_lib/standard.js): one",
        "# full page, no headline or summary, 11pt, at most 6 courses, at most 15",
        "# skills in a group and 30 in all, and every role the CV has. What cv.yaml",
        "# holds below the standard isn't here, since no resume prints it.",
        "",
        "# coursework: false   (or up to 6 courses to keep, by code)",
        "maxPages: 1",
        "compactHeading: true",
        "",
        "sections:"
    ];
    const cv = resolveCv(master);
    for (const section of master.sections) {
        if (["research-interests", "skills"].includes(section.kind)) {
            let hint = "";
            if (section.kind === "skills") {
                const keys = Object.keys(master.skills);
                const last = keys[keys.length - 1];
                const some = master.skills[last].items.slice(0, 2).join(", ");
                hint = `   # pick groups: [${keys.join(", ")}], and trim one like { ${last}: [${some}] }`;
            }
            lines.push(`  - ${section.title}${hint}`);
            continue;
        }
        const entries = cv.sections
            .find((cvSection) => cvSection.title === section.title)
            .entries.filter((entry) => !below.has(entry.id));
        if (!entries.length) continue;
        lines.push(`  - ${section.title}:`);
        for (const entry of entries) {
            const source = master[COLLECTIONS[section.kind]].find((item) => item.id === entry.id);
            const whole = WHOLE_KINDS.includes(section.kind);
            const menu = whole ? "" : bulletMenu(source);
            const picks = whole ? "all" : scaffoldPicks(source, below);
            lines.push(`      ${entry.id}: ${picks}${menu ? `   # ${menu}` : ""}`);
        }
    }
    return `${lines.join("\n")}\n`;
}

module.exports = { resolveResume, scaffoldResume, skillMatches, courseMatches };
