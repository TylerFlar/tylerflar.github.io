"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadMaster, resolveBullets, DATA_DIR } = require("./load.js");
const { renderBulletHtml, formatMonthYear } = require("./markup.js");

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
            bullets: htmlBullets(item.bullets, entry, label)
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

    return { education, experience, volunteering };
}

module.exports = { render };
