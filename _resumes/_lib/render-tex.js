"use strict";

const { renderTex, renderBulletTex, texDateRange } = require("./markup.js");

function texField(value, context) {
    return value ? renderTex(String(value), context) : "";
}

function itemList(bullets, indent, context) {
    if (!bullets.length) return [];
    const pad = " ".repeat(indent);
    const lines = [`${pad}\\resumeItemListStart`];
    for (const bullet of bullets) {
        lines.push(
            `${pad}  \\resumeItem{${renderBulletTex(bullet, `${context} bullet "${bullet.id ?? "inline"}"`)}}`
        );
    }
    lines.push(`${pad}\\resumeItemListEnd`);
    return lines;
}

function educationEntry(entry, context) {
    const degreeLine = `${entry.degree}, ${entry.field}` + (entry.gpa ? `; GPA: ${entry.gpa}` : "");
    return [
        "    \\resumeSubheading",
        `      {${texField(entry.school, context)}}{${texField(entry.location, context)}}`,
        `      {${texField(degreeLine, context)}}{${texDateRange(entry.start, entry.end, context)}}`
    ];
}

function roleEntry(entry, context) {
    const lines = [
        "    \\resumeSubheading",
        `      {${texField(entry.org, context)}}{${texField(entry.location, context)}}`,
        `      {${texField(entry.title, context)}}{${texDateRange(entry.start, entry.end, context)}}`,
        ...itemList(entry.bullets, 6, context)
    ];
    for (const sub of entry.subprojects || []) {
        lines.push(
            "",
            "      \\resumeSubSubheading",
            `        {${texField(sub.name, context)}}{${texDateRange(sub.start, sub.end, context)}}`,
            ...itemList(sub.bullets, 8, `${context}/${sub.id}`)
        );
    }
    return lines;
}

function projectEntry(entry, context) {
    return [
        "    \\resumeSubheading",
        `      {${texField(entry.name, context)}}{}`,
        `      {${texField(entry.tagline, context)}}{${texDateRange(entry.start, entry.end, context)}}`,
        ...itemList(entry.bullets, 6, context)
    ];
}

function courseEntry(entry, context) {
    return [
        "    \\resumeCourseheading",
        `      {${texField(entry.name, context)}}{${texDateRange(entry.start, entry.end, context)}}`,
        ...itemList(entry.bullets, 6, context)
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
        case "course":
            return courseEntry(entry, context);
        default:
            throw new Error(`Unknown entry kind "${entry.kind}" (${context})`);
    }
}

function renderSection(section, variantName) {
    const context = `${variantName}/${section.title}`;
    const lines = [
        `%-----------${section.title.toUpperCase()}-----------------`,
        `\\section{${renderTex(section.title, context)}}`
    ];

    if (section.kind === "skills") {
        lines.push(" \\resumeSubHeadingListStart");
        for (const group of section.groups) {
            const items = group.items.map((item) => renderTex(String(item), context)).join(", ");
            lines.push(
                "   \\item{",
                `     \\textbf{${renderTex(group.label, context)}}{: ${items}}`,
                "   }"
            );
        }
        lines.push(" \\resumeSubHeadingListEnd");
        return lines;
    }

    lines.push("  \\resumeSubHeadingListStart");
    if (section.kind === "education") {
        for (const entry of section.entries) {
            lines.push(...renderEntry(entry, `${context}/${entry.id}`));
        }
        lines.push("  \\resumeSubHeadingListEnd");
        return lines;
    }

    for (const entry of section.entries) {
        lines.push("", ...renderEntry(entry, `${context}/${entry.id}`));
    }
    lines.push("", "  \\resumeSubHeadingListEnd");
    return lines;
}

/** Render a resolved variant (from load.resolveVariant) to a full .tex document. */
function renderVariantTex(variant) {
    const lines = [
        `% AUTO-GENERATED from _resumes/variants/${variant.name}.yaml -- do not edit.`,
        "% Edit the variant spec or _resumes/data/master.yaml, then run: npm run gen:resumes",
        `\\documentclass[letterpaper,${variant.fontSize}]{article}`,
        "\\input{_preamble}",
        "",
        "\\begin{document}",
        "\\input{_heading}",
        ""
    ];
    for (const section of variant.sections) {
        lines.push("", ...renderSection(section, variant.name), "");
    }
    lines.push("\\end{document}", "");
    return lines.join("\n");
}

module.exports = { renderVariantTex };
