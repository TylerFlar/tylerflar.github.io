"use strict";

/**
 * Character limits in an application's answers.md. A form question with a
 * limit gets its own heading with the limit in it, like "## Why do you want
 * this job? (3000 characters)", and the answer to paste goes in the first
 * blockquote under it, so the notes around the answer aren't counted. The
 * build prints each answer's length against its limit and fails one that runs
 * over, since the form wouldn't take it.
 *
 * The length is the answer as it reads once pasted: a paragraph's wrapped
 * lines joined into one, a blank line between paragraphs, and every line break
 * one character, the way a text box's "characters remaining" counts them.
 */

// "(2000 characters)", "2,000 characters", "1000 character limit", "80 chars".
const LIMIT = /(\d[\d,]*)\s*(?:characters?|chars)\b/i;

/** The length of a blockquote's lines once pasted. */
function pastedLength(lines) {
    const paragraphs = [];
    let current = [];
    for (const line of [...lines, ""]) {
        if (line) {
            current.push(line);
        } else if (current.length) {
            paragraphs.push(current.join(" "));
            current = [];
        }
    }
    return [...paragraphs.join("\n\n")].length;
}

/**
 * Each answer in answers.md that has a character limit, in order: the
 * question (its heading's text), the limit, the heading's line, and the
 * length of the answer to paste, or null when there's no blockquote under the
 * heading: [{ question, limit, line, length }].
 */
function answerLengths(markdown) {
    // Comments are blanked, not removed, so line numbers still match the file.
    const lines = markdown
        .replace(/\r\n?/g, "\n")
        .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ""))
        .split("\n");
    const answers = [];
    let answer = null;
    // Under the current heading: before its first blockquote, in it, or past it.
    let state = "before";
    lines.forEach((line, i) => {
        const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line);
        if (heading) {
            const limit = LIMIT.exec(heading[1]);
            answer = limit && {
                question: heading[1],
                limit: Number(limit[1].replace(/,/g, "")),
                line: i + 1,
                quote: []
            };
            if (answer) answers.push(answer);
            state = "before";
            return;
        }
        if (!answer || state === "after") return;
        const quoted = /^\s*>\s?(.*)$/.exec(line);
        if (quoted) {
            answer.quote.push(quoted[1].trim());
            state = "in";
        } else if (state === "in") {
            state = "after";
        }
    });
    return answers.map(({ quote, ...rest }) => ({
        ...rest,
        length: quote.some(Boolean) ? pastedLength(quote) : null
    }));
}

/** A question for the build's output: its limit dropped, and cut short past `max` characters. */
function questionLabel(question, max = 60) {
    const text = question.replace(/\s*\([^)]*\d[^)]*\)\s*$/, "").trim();
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 3);
    // Keep a last word that ends right at the cut, or else drop the partial one.
    const end = /\s/.test(text[cut.length]) ? cut.length : cut.lastIndexOf(" ");
    return `${cut.slice(0, end > 0 ? end : cut.length).trimEnd()}...`;
}

module.exports = { answerLengths, questionLabel };
