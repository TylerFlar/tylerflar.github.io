"use strict";

/**
 * Cover letters: Markdown with a little front matter, printed on one page
 * under the same one-line heading as a compact resume.
 *
 *   ---
 *   company: Acme Robotics           required
 *   role: Robotics Software Intern   optional; prints a "Re:" line
 *   recipient: Hiring Team           optional; the line above the company
 *   salutation: Dear Hiring Manager, optional
 *   closing: Sincerely,              optional
 *   date: 2026-10-21                 optional; today if left out
 *   ---
 *
 *   Paragraphs, separated by blank lines. **bold**, *italic* and [links](url)
 *   work as in master.yaml. <!-- comments --> aren't printed.
 *
 * A letter with no paragraphs yet is a draft, and the build skips it.
 */

const yaml = require("js-yaml");
const { renderTex } = require("./markup.js");
const { findTells } = require("./voice.js");

const LETTER_KEYS = ["company", "role", "recipient", "salutation", "closing", "date"];
const DEFAULTS = {
    recipient: "Hiring Team",
    salutation: "Dear Hiring Manager,",
    closing: "Sincerely,"
};
const SIGNATURE = "Tyler Flar";
const LONG_DATE = { year: "numeric", month: "long", day: "numeric" };

function fail(message) {
    throw new Error(message);
}

/**
 * "2026-10-21" -> "October 21, 2026". YAML reads an unquoted date as midnight
 * UTC, so a given date is formatted in UTC; the default is today, locally.
 */
function formatLetterDate(value, label) {
    if (value === undefined) return new Date().toLocaleDateString("en-US", LONG_DATE);
    const date =
        value instanceof Date
            ? value
            : /^\d{4}-\d{2}-\d{2}$/.test(String(value))
              ? new Date(`${value}T00:00:00Z`)
              : null;
    if (!date || Number.isNaN(date.getTime()))
        fail(`${label}: date is YYYY-MM-DD, like 2026-10-21`);
    return date.toLocaleDateString("en-US", { ...LONG_DATE, timeZone: "UTC" });
}

/** Parse cover-letter.md into the fields renderLetterTex prints. */
function parseLetter(source, label) {
    // Word processors paste non-breaking spaces and a one-character ellipsis.
    const text = source
        .replace(/\r\n?/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/…/g, "...");
    const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/.exec(text);
    if (!match) fail(`${label}: start with front matter between --- lines, with company: in it`);
    const paragraphs = (match[2] || "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .split(/\n\s*\n/)
        .map((block) =>
            block
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .join(" ")
        )
        .filter(Boolean);
    if (!paragraphs.length) return { paragraphs };

    const front = yaml.load(match[1]) ?? {};
    if (typeof front !== "object" || Array.isArray(front))
        fail(`${label}: front matter is key: value lines`);
    for (const key of Object.keys(front)) {
        if (!LETTER_KEYS.includes(key)) {
            fail(`${label}: unknown key "${key}". A letter takes ${LETTER_KEYS.join(", ")}`);
        }
    }
    if (typeof front.company !== "string" || !front.company.trim())
        fail(`${label}: fill in company`);
    for (const key of ["role", "recipient", "salutation", "closing"]) {
        if (front[key] !== undefined && (typeof front[key] !== "string" || !front[key].trim())) {
            fail(`${label}: "${key}" must be text, or leave it out`);
        }
    }
    return {
        company: front.company.trim(),
        role: front.role?.trim(),
        recipient: (front.recipient ?? DEFAULTS.recipient).trim(),
        salutation: (front.salutation ?? DEFAULTS.salutation).trim(),
        closing: (front.closing ?? DEFAULTS.closing).trim(),
        date: formatLetterDate(front.date, label),
        paragraphs
    };
}

/** The letter as a .tex document, on the resume's preamble and compact heading. */
function renderLetterTex(letter, { source, regenerate }) {
    const tex = (text, what) => renderTex(text, `${source} ${what}`);
    return [
        `% AUTO-GENERATED from ${source} -- do not edit.`,
        `% Edit ${source}, then run: ${regenerate}`,
        "\\documentclass[letterpaper,11pt]{article}",
        "\\input{_preamble}",
        "\\def\\resumeCompact{}",
        "\\def\\resumeDocumentType{Cover Letter}",
        "",
        "\\begin{document}",
        "\\thispagestyle{empty}",
        "\\input{_heading}",
        "\\vspace{4pt}",
        "\\setlength{\\parindent}{0pt}",
        "\\setlength{\\parskip}{9pt}",
        "",
        tex(letter.date, "date"),
        "",
        `${tex(letter.recipient, "recipient")} \\\\`,
        tex(letter.company, "company"),
        "",
        ...(letter.role ? [`Re: ${tex(letter.role, "role")}`, ""] : []),
        tex(letter.salutation, "salutation"),
        "",
        ...letter.paragraphs.flatMap((paragraph, i) => [tex(paragraph, `paragraph ${i + 1}`), ""]),
        `${tex(letter.closing, "closing")} \\\\[4pt]`,
        SIGNATURE,
        "\\end{document}",
        ""
    ].join("\n");
}

/** The voice lint's tells in the letter, to print as notes (not failures). */
function letterTells(letter) {
    return letter.paragraphs.flatMap((paragraph, i) =>
        findTells(paragraph).map((hit) => ({ paragraph: i + 1, ...hit }))
    );
}

module.exports = { parseLetter, renderLetterTex, letterTells, formatLetterDate };
