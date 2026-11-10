"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadMaster, loadInterests, loadProfile, DATA_DIR } = require("./load.js");
const { resolvePublicCv } = require("./cv.js");
const { loadProjectPages } = require("./pages.js");
const { renderBulletHtml, renderHtml, formatMonthYear, courseTitle } = require("./markup.js");
const { skillName, skillListed } = require("./skills.js");
const { fail } = require("./fail.js");

// The timeline partial's name for each kind of CV section.
const TIMELINE_TYPES = {
    education: "education",
    role: "experience",
    publication: "publication",
    award: "award",
    volunteer: "volunteering"
};

// website.yaml's schema is closed, like profile.yaml's: `order`, and under each
// kind of entry the web-only touches an entry may take.
const WEBSITE_KEYS = {
    order: null,
    education: ["school"],
    experience: ["org"],
    volunteering: ["org"],
    publications: ["project"]
};

// A project page's address, as a paper's `project` touch names its write-up.
const PROJECT_HREF = /^\/projects\/([a-z0-9-]+)\/$/;

const list = (items) => items.map((item) => `"${item}"`).join(", ");

/** Read and check website.yaml: only the keys above, each entry a map of its touches. */
function loadWebsite(file = path.join(DATA_DIR, "website.yaml")) {
    return validateWebsite(yaml.load(fs.readFileSync(file, "utf8")));
}

function validateWebsite(spec) {
    const label = "website.yaml";
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
        fail(`${label}: expected ${Object.keys(WEBSITE_KEYS).join(", ")}`);
    }
    for (const [key, value] of Object.entries(spec)) {
        if (!(key in WEBSITE_KEYS)) {
            fail(
                `${label}: unknown key "${key}". It takes ${Object.keys(WEBSITE_KEYS).join(", ")}`
            );
        }
        const touches = WEBSITE_KEYS[key];
        if (!touches) continue;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            fail(`${label} ${key}: list each entry as "id: { ${touches[0]}: ... }"`);
        }
        for (const [id, entry] of Object.entries(value)) {
            if (key === "experience" && entry?.workType !== undefined) {
                fail(
                    `${label} experience ${id}: workType lives in master.yaml now, so the CV and LinkedIn print it too`
                );
            }
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                fail(`${label} ${key} ${id}: write it as "{ ${touches[0]}: ... }"`);
            }
            for (const touch of Object.keys(entry)) {
                if (!touches.includes(touch)) {
                    fail(
                        `${label} ${key} ${id}: unknown key "${touch}". An entry here takes ${touches.join(", ")}`
                    );
                }
            }
            if (key === "publications" && !PROJECT_HREF.test(String(entry.project))) {
                fail(
                    `${label} publications ${id}: project is the address of the paper's write-up, like "/projects/followme-robot/"`
                );
            }
        }
    }
    return spec;
}

/**
 * The project pages website.yaml names as a paper's write-up, as file names
 * ("followme-robot.md"). A paper has no bullet budget, so its write-up stays on
 * the site for as long as the CV prints the paper, after the project behind it
 * has run out (pageNotes in budget.js).
 */
function paperWriteUps(spec = loadWebsite()) {
    return Object.values(spec.publications ?? {}).map(
        ({ project }) => `${PROJECT_HREF.exec(project)[1]}.md`
    );
}

/**
 * The CV's sections in the homepage's own order. The homepage shows what the CV
 * shows, but a web page leads with the work, where a CV for a student opens on
 * Education and Skills, so website.yaml's `order` lists the CV's section titles
 * in the order the homepage prints them. It names every one of them, once: a
 * section the CV gains fails here until it's given a place.
 */
function arrange(sections, order) {
    const titles = sections.map((section) => section.title);
    const want = `Write order: [${titles.join(", ")}], in the order the homepage should print them.`;
    if (order === undefined) {
        fail(`website.yaml: set order, the CV's section titles in the homepage's order. ${want}`);
    }
    if (!Array.isArray(order) || order.some((title) => typeof title !== "string")) {
        fail(`website.yaml order: expected a list of the CV's section titles. ${want}`);
    }
    const repeated = titles.filter((title, i) => titles.indexOf(title) !== i);
    if (repeated.length) {
        fail(
            `website.yaml order: the CV has two sections titled ${list([...new Set(repeated)])}, so order can't place them. Give one another title in cv.yaml.`
        );
    }
    const twice = order.filter((title, i) => order.indexOf(title) !== i);
    const missing = titles.filter((title) => !order.includes(title));
    const extra = order.filter((title) => !titles.includes(title));
    const problems = [
        twice.length && `it lists ${list([...new Set(twice)])} twice`,
        missing.length && `it leaves out ${list(missing)}, which the CV prints`,
        extra.length && `it lists ${list([...new Set(extra)])}, which the CV doesn't print`
    ].filter(Boolean);
    if (problems.length) {
        fail(`website.yaml order: ${problems.join(", and ")}. ${want}`);
    }
    return order.map((title) => sections.find((section) => section.title === title));
}

/**
 * The homepage's data: the CV's sections, under its titles and with its
 * entries, in the order website.yaml gives (`sections`). cv.yaml picks the
 * entries, and each shows one line here, its website summary (the bullet marked
 * alt) or else its first CV bullet, so the homepage stays an overview and the CV
 * has the rest. A role links its subprojects on the CV that have pages, the
 * Projects section shows the CV's projects as cards (`refs`), and Skills shows
 * the CV's skills as a card per group. website.yaml adds the order and what's
 * web-only, by entry id, and an id that isn't on the CV fails the build. The
 * bio, the interests row and the projects intro are the homepage's own.
 */
function render() {
    const master = loadMaster();
    const cv = resolvePublicCv(master);
    const spec = loadWebsite();
    const pages = loadProjectPages();
    const onCv = (kind) =>
        cv.sections
            .filter((section) => section.kind === kind)
            .flatMap((section) => section.entries);

    // website.yaml dresses what the CV shows and nothing else.
    const tweaks = (key, kind) => {
        const map = spec[key] ?? {};
        const shown = new Set(onCv(kind).map((entry) => entry.id));
        for (const id of Object.keys(map)) {
            if (!shown.has(id)) {
                throw new Error(
                    `website.yaml ${key}: "${id}" isn't on the CV, and the homepage shows only what the CV does (cv.yaml)`
                );
            }
        }
        return (id) => map[id] ?? {};
    };
    const educationTweak = tweaks("education", "education");
    const roleTweak = tweaks("experience", "role");
    const volunteerTweak = tweaks("volunteering", "volunteer");
    const publicationTweak = tweaks("publications", "publication");

    // One line per entry: its website summary, or else its first CV bullet.
    const oneLine = (kind, entry, label) => {
        const source = master.index[kind].get(entry.id);
        const bullet =
            (source.bullets || []).find((candidate) => candidate.alt) ??
            entry.bullets?.[0] ??
            entry.subprojects?.[0]?.bullets?.[0];
        return bullet ? [renderBulletHtml(bullet, `${label} bullet "${bullet.id}"`)] : [];
    };

    // One shape for every link line on the timeline: a label and the links it
    // introduces.
    const linkLine = (label, items) => (items.length ? { label, items } : null);
    const pageHref = (ref) => {
        const page = pages.find((candidate) => candidate.cv === ref);
        return page ? `/projects/${path.basename(page.file, ".md")}/` : null;
    };

    const items = {
        education: (entry) => ({
            school: educationTweak(entry.id).school ?? entry.school,
            degree: entry.degree,
            field: entry.field,
            startDate: formatMonthYear(entry.start, entry.id),
            endDate: formatMonthYear(entry.end, entry.id),
            gpa: entry.gpa ?? null,
            coursework: (entry.coursework ?? []).map(courseTitle)
        }),
        role: (entry) => {
            const tweak = roleTweak(entry.id);
            const label = `homepage ${entry.id}`;
            const projects = (entry.subprojects || [])
                .map((sub) => ({ label: sub.name, href: pageHref(`role/${entry.id}/${sub.id}`) }))
                .filter((link) => link.href);
            return {
                title: entry.title,
                organization: tweak.org ?? entry.org,
                location: entry.location,
                // "Remote" once when it's the location too.
                type: entry.workType && entry.workType !== entry.location ? entry.workType : null,
                startDate: formatMonthYear(entry.start, label),
                endDate: formatMonthYear(entry.end, label),
                bullets: oneLine("role", entry, label),
                links: linkLine("Projects", projects)
            };
        },
        volunteer: (entry) => {
            const label = `homepage ${entry.id}`;
            return {
                title: entry.title,
                organization: volunteerTweak(entry.id).org ?? entry.org,
                startDate: formatMonthYear(entry.start, label),
                endDate: formatMonthYear(entry.end, label),
                bullets: oneLine("volunteer", entry, label)
            };
        },
        // A paper, with its link and the write-up page it came out of when
        // website.yaml names one.
        publication: (entry) => {
            const label = `homepage publication "${entry.id}"`;
            const links = [];
            if (entry.url) links.push({ label: entry.urlLabel || "Paper", href: entry.url });
            const project = publicationTweak(entry.id).project;
            if (project) {
                const file = `${PROJECT_HREF.exec(project)[1]}.md`;
                if (!pages.some((page) => page.file === file)) {
                    fail(
                        `website.yaml publications ${entry.id}: there's no project page at "${project}" (src/content/projects/${file})`
                    );
                }
                links.push({ label: "Project write-up", href: project });
            }
            return {
                title: entry.title,
                authors: renderHtml(entry.authors, `${label} authors`),
                venue: entry.venue,
                location: entry.location ?? null,
                date: formatMonthYear(entry.date, label),
                note: entry.note ? renderHtml(entry.note, `${label} note`) : null,
                links: linkLine("Links", links)
            };
        },
        award: (entry) => ({
            name: entry.name,
            issuer: entry.issuer,
            term: entry.term,
            note: entry.note ? renderHtml(entry.note, `homepage award "${entry.id}" note`) : null
        })
    };

    // A skill's name, and the names in its parentheses as details ("AWS" with
    // Lambda, S3), which the homepage prints smaller.
    const skillParts = (text) => ({ name: skillName(text), details: skillListed(text) });

    const sections = cv.sections.map((section) => {
        const { kind, title } = section;
        if (kind === "skills") {
            return {
                kind,
                title,
                groups: section.groups.map(({ label, items: skills }) => ({
                    label,
                    items: skills.map(skillParts)
                }))
            };
        }
        if (kind === "research-interests") {
            return { kind, title, text: renderHtml(section.text, "master.yaml researchInterests") };
        }
        if (kind === "project") {
            return { kind, title, refs: section.entries.map((entry) => `project/${entry.id}`) };
        }
        return { kind, title, type: TIMELINE_TYPES[kind], items: section.entries.map(items[kind]) };
    });

    // The about-me text from profile.yaml, and the interests row under it. The
    // bio is a paragraph to a line of the YAML's folded text.
    const about = loadProfile();
    return {
        sections: arrange(sections, spec.order),
        profile: {
            bio: bioParagraphs(about.bio).map((paragraph, i) =>
                renderHtml(paragraph, `profile.yaml bio, paragraph ${i + 1}`)
            ),
            projectsIntro: renderHtml(about.projectsIntro, "profile.yaml projectsIntro")
        },
        interests: loadInterests().selected
    };
}

/**
 * The bio's paragraphs. In profile.yaml's folded text (`>-`) a blank line
 * between paragraphs comes through as one line break.
 */
function bioParagraphs(bio) {
    return bio
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

module.exports = { render, arrange, loadWebsite, validateWebsite, paperWriteUps, bioParagraphs };
