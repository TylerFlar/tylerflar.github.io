"use strict";

const {
    renderTex,
    renderBulletTex,
    texUrl,
    texDateRange,
    formatMonthYear,
    courseTitle
} = require("./markup.js");
const { contactTexLines } = require("./contact.js");

function texField(value, context) {
    return value ? renderTex(String(value), context) : "";
}

// Bullets as one list. Each group is [bullets, context], so bullets from a
// role and its subproject can share a list and still name where they came from
// in an error.
function itemList(groups, indent) {
    const items = groups.flatMap(([bullets, context]) =>
        bullets.map(
            (bullet) =>
                `  \\resumeItem{${renderBulletTex(bullet, `${context} bullet "${bullet.id ?? "inline"}"`)}}`
        )
    );
    if (!items.length) return [];
    const pad = " ".repeat(indent);
    return [
        `${pad}\\resumeItemListStart`,
        ...items.map((item) => pad + item),
        `${pad}\\resumeItemListEnd`
    ];
}

// A degree shows when it ends ("Expected Mar 2027"), not a range: the start
// stays in the data for ordering, the budget and the website.
function educationEntry(entry, context) {
    const degreeLine =
        `${entry.degree} in ${entry.field}` + (entry.gpa ? `; GPA: ${entry.gpa}` : "");
    return [
        "    \\resumeSubheading",
        `      {${texField(entry.school, context)}}{${texField(entry.location, context)}}`,
        `      {${texField(degreeLine, context)}}{${formatMonthYear(entry.end, context)}}`
    ];
}

// Where the work was, with how it was done: "San Diego, CA (Remote)", or just
// "Remote" when that's the location too.
function whereWorked(entry) {
    const { location, workType } = entry;
    if (!workType || workType === location) return location;
    return location ? `${location} (${workType})` : workType;
}

function roleEntry(entry, context) {
    // A subproject that runs as long as its role leaves the dates to the role's
    // line. Compared as printed, so "present" and "Present" are the same.
    const roleDates = texDateRange(entry.start, entry.end, context);
    const subs = (entry.subprojects || []).map((sub) => ({
        sub,
        context: `${context}/${sub.id}`,
        dates: texDateRange(sub.start, sub.end, `${context}/${sub.id}`)
    }));
    // A subproject heading prints only when it says something the bullets
    // don't: dates of its own, or which of two or more projects a bullet
    // belongs to. A lone one that runs as long as its role would cost a line
    // to repeat the role's dates and name work its bullets already name, so
    // its bullets join the role's list.
    const lone = subs.length === 1 && subs[0].dates === roleDates ? subs[0] : null;
    const lines = [
        "    \\resumeSubheading",
        `      {${texField(entry.org, context)}}{${texField(whereWorked(entry), context)}}`,
        `      {${texField(entry.title, context)}}{${roleDates}}`,
        ...(entry.blurb ? [`      \\resumeBlurb{${texField(entry.blurb, context)}}`] : []),
        ...itemList(
            [[entry.bullets, context], ...(lone ? [[lone.sub.bullets, lone.context]] : [])],
            6
        )
    ];
    if (lone) return lines;
    for (const { sub, context: where, dates } of subs) {
        lines.push(
            "",
            "      \\resumeSubSubheading",
            `        {${texField(sub.name, context)}}{${dates === roleDates ? "" : dates}}`,
            ...itemList([[sub.bullets, where]], 8)
        );
    }
    return lines;
}

function projectEntry(entry, context) {
    return [
        "    \\resumeSubheading",
        `      {${texField(entry.name, context)}}{}`,
        `      {${texField(entry.tagline, context)}}{${texDateRange(entry.start, entry.end, context)}}`,
        ...itemList([[entry.bullets, context]], 6)
    ];
}

// A citation line: authors, quoted title, italic venue with place and month,
// then an optional link. The `note` (what he contributed) hangs below as one
// bullet so a co-authored paper still says which part was his.
function publicationEntry(entry, context) {
    const where = [entry.venue, entry.location, formatMonthYear(entry.date, context)]
        .filter(Boolean)
        .map((part) => texField(part, context))
        .join(", ");
    const link = entry.url
        ? ` \\href{${texUrl(entry.url)}}{[${texField(entry.urlLabel || "paper", context)}]}`
        : "";
    return [
        "    \\resumePublication",
        `      {${texField(entry.authors, context)}}`,
        `      {${texField(entry.title, context)}}`,
        `      {${where}}{${link}}`,
        ...itemList([[entry.note ? [{ id: "note", text: entry.note }] : [], context]], 6)
    ];
}

// An award: its name, then who gave it and when, with the note (what it paid
// for) hanging below as one bullet, the way a publication's does.
function awardEntry(entry, context) {
    return [
        "    \\resumeSubheading",
        `      {${texField(entry.name, context)}}{}`,
        `      {${texField(entry.issuer, context)}}{${texField(entry.term, context)}}`,
        ...itemList([[entry.note ? [{ id: "note", text: entry.note }] : [], context]], 6)
    ];
}

function renderEntry(entry, context) {
    switch (entry.kind) {
        case "education":
            return educationEntry(entry, context);
        case "role":
        case "volunteer":
            return roleEntry(entry, context);
        case "project":
            return projectEntry(entry, context);
        case "publication":
            return publicationEntry(entry, context);
        case "award":
            return awardEntry(entry, context);
        default:
            throw new Error(`Unknown entry kind "${entry.kind}" (${context})`);
    }
}

function renderSection(section, variantName) {
    const context = `${variantName}/${section.title}`;

    // Interests get their own shape: a flush-left, middot-separated line rather
    // than a ruled section, because it belongs near the top without competing
    // with Experience. Labels only — the website's emoji can't render here.
    if (section.kind === "interests") {
        const items = section.items
            .map((item) => renderTex(item.label, context))
            .join("\\hspace{0.45em}$\\cdot$\\hspace{0.45em}");
        return [
            `%-----------${section.title.toUpperCase()}-----------------`,
            `\\resumeInterests{${renderTex(section.title, context)}}{${items}}`
        ];
    }

    // Research Interests: one labelled line under the heading, the same shape
    // as the interests row, because a ruled section would give one line the
    // weight of Experience.
    if (section.kind === "research-interests") {
        return [
            `%-----------${section.title.toUpperCase()}-----------------`,
            `\\resumeInterests[2pt]{${renderTex(section.title, context)}}{${renderTex(section.text, context)}}`
        ];
    }

    const lines = [
        `%-----------${section.title.toUpperCase()}-----------------`,
        `\\section{${renderTex(section.title, context)}}`
    ];

    if (section.kind === "skills") {
        lines.push("  \\begin{resumeSkills}");
        for (const group of section.groups) {
            const items = group.items.map((item) => renderTex(String(item), context)).join(", ");
            lines.push(`    \\resumeSkill{${renderTex(group.label, context)}}{${items}}`);
        }
        lines.push("  \\end{resumeSkills}");
        return lines;
    }

    lines.push("  \\resumeSubHeadingListStart");
    if (section.kind === "education") {
        for (const entry of section.entries) {
            lines.push(...renderEntry(entry, `${context}/${entry.id}`));
        }
        lines.push("  \\resumeSubHeadingListEnd");
        // Coursework hangs off the section, after the list: inside a list
        // item the line's hanging indent would be lost. Each course is boxed so
        // a line only breaks between courses, never inside a name, and prints
        // its title without its code (courseTitle).
        const withCourses = section.entries.find((entry) => entry.coursework?.length);
        if (withCourses) {
            const courses = withCourses.coursework
                .map(
                    (course) => `\\mbox{${renderTex(courseTitle(course), `${context}/coursework`)}}`
                )
                .join("\\hspace{0.45em}$\\cdot$\\hspace{0.45em}");
            lines.push(`  \\resumeInterests[0pt]{Relevant Coursework}{${courses}}`);
        }
        return lines;
    }

    for (const entry of section.entries) {
        lines.push("", ...renderEntry(entry, `${context}/${entry.id}`));
    }
    lines.push("", "  \\resumeSubHeadingListEnd");
    return lines;
}

/**
 * Render a resolved resume to a full .tex document: the CV (load.resolveCv) or
 * a tailored resume (resume.resolveResume). Each names its source file and the
 * command that rebuilds it, and both go in the header. `contact` (contact.js)
 * gives the one-line heading its phone number, which no tracked file holds.
 */
function renderResumeTex(variant, { contact = null } = {}) {
    const lines = [
        `% AUTO-GENERATED from ${variant.source} -- do not edit.`,
        `% Edit ${variant.source}, then run: ${variant.regenerate}`,
        `\\documentclass[letterpaper,${variant.fontSize}]{article}`,
        "\\input{_preamble}",
        // The PDF's title, "Tyler Flar -- CV" or "-- Resume" (_preamble.tex).
        `\\def\\resumeDocumentType{${variant.documentType ?? "Resume"}}`,
        ""
    ];
    if (variant.headline) {
        lines.push(
            `\\def\\resumeHeadline{${renderTex(variant.headline, `${variant.name} headline`)}}`,
            ""
        );
    }
    // One contact line under the name instead of the CV's two (_heading.tex).
    if (variant.compactHeading) {
        lines.push("\\def\\resumeCompact{}", ...contactTexLines(contact), "");
    }
    // Page 1 carries the full name block, so it needs no running header; the
    // preamble's continuation header takes over from page 2 on.
    lines.push("\\begin{document}", "\\thispagestyle{empty}", "\\input{_heading}", "");
    if (variant.summary) {
        lines.push(
            "",
            "%-----------SUMMARY-----------------",
            "\\section{Summary}",
            `  {\\small ${renderTex(variant.summary, `${variant.name} summary`)}}`,
            ""
        );
    }
    for (const section of variant.sections) {
        lines.push("", ...renderSection(section, variant.name), "");
    }
    lines.push("\\end{document}", "");
    return lines.join("\n");
}

module.exports = { renderResumeTex };
