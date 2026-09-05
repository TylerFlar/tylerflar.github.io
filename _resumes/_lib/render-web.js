"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadMaster, loadInterests, resolveBullets, DATA_DIR } = require("./load.js");
const { renderBulletHtml, renderHtml, formatMonthYear } = require("./markup.js");

/**
 * Render the website timeline data (the shape src/_data/resume.json used to
 * hold) from the master library + _resumes/data/website.yaml.
 */
function render() {
    const master = loadMaster();
    const spec = yaml.load(fs.readFileSync(path.join(DATA_DIR, "website.yaml"), "utf8"));

    const htmlBullets = (selection, entry, label) =>
        resolveBullets(selection, entry, label).map((bullet) =>
            renderBulletHtml(bullet, `${label} bullet "${bullet.id ?? "inline"}"`)
        );

    const education = (spec.education || []).map((item) => {
        const entry = master.index.education.get(item.id);
        if (!entry) throw new Error(`website.yaml: unknown education id "${item.id}"`);
        return {
            school: item.school ?? entry.school,
            degree: item.degree ?? entry.degree,
            field: item.field ?? entry.field,
            startDate: formatMonthYear(entry.start, item.id),
            endDate: formatMonthYear(entry.end, item.id),
            gpa: entry.gpa ?? null
        };
    });

    // One shape for every link line on the timeline: a label and the links it
    // introduces. Experience entries declare theirs in website.yaml;
    // publications build theirs from the paper URL and the project page.
    const linkLine = (label, items) => (items.length ? { label, items } : null);
    const specLinks = (item, label) => {
        if (item.links === undefined) return null;
        const { label: title, items } = item.links;
        if (typeof title !== "string" || !Array.isArray(items)) {
            throw new Error(`${label}: "links" needs a "label" and an "items" list`);
        }
        for (const link of items) {
            if (typeof link?.label !== "string" || typeof link?.href !== "string") {
                throw new Error(`${label}: every link needs a "label" and an "href"`);
            }
        }
        return linkLine(title, items);
    };

    const experience = (spec.experience || []).map((item) => {
        const entry = master.index.role.get(item.id);
        if (!entry) throw new Error(`website.yaml: unknown role id "${item.id}"`);
        const label = `website.yaml ${item.id}`;
        return {
            title: item.title ?? entry.title,
            organization: item.org ?? entry.org,
            location: item.location ?? entry.location,
            type: item.workType ?? null,
            startDate: formatMonthYear(entry.start, label),
            endDate: formatMonthYear(entry.end, label),
            bullets: htmlBullets(item.bullets, entry, label),
            links: specLinks(item, label)
        };
    });

    const volunteering = (spec.volunteering || []).map((item) => {
        const entry = master.index.volunteer.get(item.id);
        if (!entry) throw new Error(`website.yaml: unknown volunteering id "${item.id}"`);
        const label = `website.yaml ${item.id}`;
        return {
            title: item.title ?? entry.title,
            organization: item.org ?? entry.org,
            startDate: formatMonthYear(entry.start, label),
            endDate: formatMonthYear(entry.end, label),
            bullets: htmlBullets(item.bullets, entry, label)
        };
    });

    // Every publication in master.yaml is on the website, like the CV. The spec
    // may add a `project` link per id (the write-up page the paper came out of).
    const projectLinks = new Map((spec.publications || []).map((item) => [item.id, item]));
    for (const id of projectLinks.keys()) {
        if (!master.index.publication.has(id)) {
            throw new Error(`website.yaml: unknown publication id "${id}"`);
        }
    }
    const publications = master.publications.map((entry) => {
        const label = `website.yaml publication "${entry.id}"`;
        const extra = projectLinks.get(entry.id) || {};
        const items = [];
        if (entry.url) items.push({ label: entry.urlLabel || "Paper", href: entry.url });
        if (extra.project) items.push({ label: "Project write-up", href: extra.project });
        return {
            title: entry.title,
            authors: renderHtml(entry.authors, `${label} authors`),
            venue: entry.venue,
            location: entry.location ?? null,
            date: formatMonthYear(entry.date, label),
            note: entry.note ? renderHtml(entry.note, `${label} note`) : null,
            links: linkLine("Links", items)
        };
    });

    // The interests row is shared with the CV, emoji and all — the CV renderer
    // is the one that drops them.
    const interests = loadInterests().selected;

    return { education, experience, publications, volunteering, interests };
}

module.exports = { render };
