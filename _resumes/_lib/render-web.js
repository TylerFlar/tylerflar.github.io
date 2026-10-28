"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadMaster, loadInterests, loadProfile, DATA_DIR } = require("./load.js");
const { resolvePublicCv } = require("./cv.js");
const { loadProjectPages } = require("./pages.js");
const { renderBulletHtml, renderHtml, formatMonthYear, courseTitle } = require("./markup.js");

// The timeline partial's name for each kind of CV section.
const TIMELINE_TYPES = {
    education: "education",
    role: "experience",
    publication: "publication",
    award: "award",
    volunteer: "volunteering"
};

/**
 * The homepage's data: the CV's sections, in the CV's order and under its
 * titles, so the two always match (`sections`). cv.yaml picks the entries, and
 * each shows one line here, its website summary (the bullet marked alt) or else
 * its first CV bullet, so the homepage stays an overview and the CV has the
 * rest. A role links its subprojects on the CV that have pages, the Projects
 * section shows the CV's projects as cards (`refs`), and Skills shows the CV's
 * skills as chips, group by group. website.yaml only adds what's web-only, by
 * entry id, and an id that isn't on the CV fails the build. The bio, the
 * interests row and the projects intro are the homepage's own.
 */
function render() {
    const master = loadMaster();
    const cv = resolvePublicCv(master);
    const spec = yaml.load(fs.readFileSync(path.join(DATA_DIR, "website.yaml"), "utf8")) || {};
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
                type: tweak.workType ?? null,
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
            if (project) links.push({ label: "Project write-up", href: project });
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

    // A skill as a chip: its name, and the names in its parentheses as details
    // ("AWS" with Lambda, S3), so a chip stays short.
    const skillChip = (text) => {
        const listed = /^(.*?)\s*\((.*)\)$/.exec(text);
        return listed
            ? { name: listed[1], details: listed[2].split(",").map((name) => name.trim()) }
            : { name: text, details: [] };
    };

    const sections = cv.sections.map((section) => {
        const { kind, title } = section;
        if (kind === "skills") {
            return {
                kind,
                title,
                groups: section.groups.map(({ label, items: list }) => ({
                    label,
                    items: list.map(skillChip)
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

    // The about-me text from profile.yaml, and the interests row under it.
    const about = loadProfile();
    return {
        sections,
        profile: {
            bio: renderHtml(about.bio, "profile.yaml bio"),
            projectsIntro: renderHtml(about.projectsIntro, "profile.yaml projectsIntro")
        },
        interests: loadInterests().selected
    };
}

module.exports = { render };
