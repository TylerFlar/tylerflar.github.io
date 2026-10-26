"use strict";

/**
 * Which of the CV's skills a job posting names, and whether a resume prints
 * them, so a skill trimmed off the resume can't be one the posting asks for.
 * The CV's skills are the vocabulary, so every term is one the CV backs up:
 * "AWS (EC2, Lambda, S3)" answers to AWS, EC2, Lambda and S3,
 * "JavaScript/TypeScript" to both names, and "GitHub Actions" to GitHub too.
 * A term the posting names that the CV doesn't have isn't listed, since a
 * resume can't add it anyway.
 */

const { renderPlain } = require("./markup.js");

/**
 * The posting itself: posting.md below the notes at its top, which end at its
 * first --- line, or below its Link: line when it has no such line.
 */
function postingBody(markdown) {
    const lines = markdown
        .replace(/\r\n?/g, "\n")
        .replace(/<!--[\s\S]*?-->/g, "")
        .split("\n");
    const rule = lines.findIndex((line) => line.trim() === "---");
    const start = rule >= 0 ? rule : lines.findIndex((line) => line.startsWith("Link:"));
    return lines.slice(start + 1).join("\n");
}

// A first word that names a tool on its own: one with a capital inside it
// (GitHub), all capitals (MCP, BLE) or a digit (x86).
const STANDALONE_WORD = /^(?:\w*[a-z][A-Z]\w*|[A-Z0-9]{2,}|\w*\d\w*)$/;

/** The names a skill item answers to: "AWS (EC2, S3)" gives AWS, EC2 and S3. */
function termsOf(item) {
    const parts = /^(.*?)\s*\((.*)\)$/.exec(item);
    const names = (parts ? [parts[1], ...parts[2].split(",")] : [item])
        .flatMap((name) => name.split("/"))
        .map((name) => name.trim())
        // "C" alone, from "C/C++", would match too much.
        .filter((name) => name.length > 1);
    const terms = names.flatMap((name) => {
        const first = name.split(/\s+/)[0];
        return first !== name && STANDALONE_WORD.test(first) ? [name, first] : [name];
    });
    return [...new Set(terms)];
}

/** Every skill term with the item and group it's from. A term two items share goes to the first. */
function skillTerms(skills) {
    const terms = new Map();
    for (const [group, { items }] of Object.entries(skills)) {
        for (const item of items) {
            for (const term of termsOf(String(item))) {
                const key = term.toLowerCase();
                if (!terms.has(key)) terms.set(key, { term, item: String(item), group });
            }
        }
    }
    return [...terms.values()];
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Where `text` first names `term`, or -1: as a whole name, so Git isn't GitHub
 * and Java isn't JavaScript, in any case, except that a term with a capital
 * needs one in the match, so React isn't "react to" and Confluence isn't "a
 * confluence of".
 */
function findTerm(text, term) {
    const body = escapeRegExp(term).replace(/\s+/g, "\\s+");
    const pattern = new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9+#])`, "gi");
    const needsCapital = /[A-Z]/.test(term);
    for (const match of text.matchAll(pattern)) {
        if (!needsCapital || /[A-Z]/.test(match[0])) return match.index;
    }
    return -1;
}

/** Everything a resolved resume (resume.resolveResume) prints, as plain text. */
function resumeText(resume) {
    const parts = [resume.headline, resume.summary];
    for (const section of resume.sections) {
        for (const group of section.groups || []) parts.push(group.label, ...group.items);
        for (const item of section.items || []) parts.push(item.label);
        parts.push(section.text);
        for (const entry of section.entries || []) {
            parts.push(
                ...["org", "title", "name", "tagline", "school", "degree", "field"].map(
                    (key) => entry[key]
                ),
                ...["blurb", "authors", "venue", "issuer", "note"].map((key) => entry[key]),
                ...(entry.coursework || [])
            );
            for (const bullet of entry.bullets || []) parts.push(bullet.text);
            for (const sub of entry.subprojects || []) {
                parts.push(sub.name, ...(sub.bullets || []).map((bullet) => bullet.text));
            }
        }
    }
    return parts
        .filter((part) => typeof part === "string" && part)
        .map((part) => renderPlain(part, "posting check", { urls: false }))
        .join("\n");
}

/**
 * The CV's skill terms a posting names, in the order it first names them,
 * each with its item, its skill group and whether the resume prints it:
 * [{ term, item, group, onResume }].
 */
function postingCoverage(postingMarkdown, resume, skills) {
    const posting = postingBody(postingMarkdown);
    const printed = resumeText(resume);
    return skillTerms(skills)
        .map((entry) => ({ ...entry, at: findTerm(posting, entry.term) }))
        .filter((entry) => entry.at >= 0)
        .sort((a, b) => a.at - b.at)
        .map(({ at, ...entry }) => ({ ...entry, onResume: findTerm(printed, entry.term) >= 0 }));
}

module.exports = { postingBody, termsOf, skillTerms, findTerm, resumeText, postingCoverage };
