"use strict";

/**
 * The voice lint: surface tells of model-written text, checked on everything
 * a reader sees. It catches tells, not voice. Plain, short and in your own
 * words is the actual rule, and _resumes/VOICE.md says how. These patterns are
 * the part a test can hold.
 *
 * Exact word forms on purpose: "robust" is a robotics term (and in a paper
 * title), "synergies" is a Balatro term, and "genuine" and "crucial" are fine.
 * Only the adverbs read as tells.
 */

const { renderPlain, normalizeBulletText } = require("./markup.js");

const APOSTROPHE = "['’]";

const TELLS = [
    // An en dash is fine between numbers (2–6, 21–108); every other long dash
    // is the house style of a model, not of this author.
    [/—|(?<!\d)–|–(?!\d)/, "a long dash; use a comma, a colon, parentheses or two sentences"],
    [/\bhonest(ly)?\b/i, '"honest"'],
    [/\bdependabl[ey]\b/i, '"dependable"'],
    [/\bgenuinely\b/i, '"genuinely"'],
    [/\bcrucially\b/i, '"crucially"'],
    [/\bload-bearing\b/i, '"load-bearing"'],
    [/\bnuanced\b/i, '"nuanced"'],
    [/\bclear-eyed\b/i, '"clear-eyed"'],
    [/\bdelv(e|es|ed|ing)\b/i, '"delve"'],
    [/\bleverag(e|es|ed|ing)\b/i, '"leverage"'],
    [/\butili[sz](e|es|ed|ing|ation)\b/i, '"utilize"'],
    [/\bseamless(ly)?\b/i, '"seamless"'],
    [/\bcutting-edge\b/i, '"cutting-edge"'],
    [/\binnovative\b/i, '"innovative"'],
    [/\bgame-?changer\b/i, '"game-changer"'],
    [/\bspearhead(s|ed|ing)?\b/i, '"spearheaded"'],
    [/\bpassionate about\b/i, '"passionate about"'],
    [/\b(excited|thrilled|delighted|eager) to\b/i, "manufactured enthusiasm"],
    [/\bworth noting\b/i, '"worth noting"'],
    [/\bnot only\b[^.!?]{0,80}\bbut also\b/i, '"not only … but also"'],
    [new RegExp(`\\bin today${APOSTROPHE}s\\b`, "i"), '"in today\'s"']
];

const BULLET_MAX = 220;

/** Every tell in a piece of text: [{ snippet, reason }]. */
function findTells(text) {
    const hits = [];
    for (const [pattern, reason] of TELLS) {
        const match = pattern.exec(text);
        if (!match) continue;
        const from = Math.max(0, match.index - 25);
        const snippet = text.slice(from, match.index + match[0].length + 25).replace(/\s+/g, " ");
        hits.push({ snippet: snippet.trim(), reason });
    }
    return hits;
}

/** The bullet-only rules, on the text as the CV prints it. */
function bulletProblems(text, context) {
    const plain = renderPlain(normalizeBulletText(text), context, { urls: false });
    const problems = [];
    const length = [...plain].length;
    if (length > BULLET_MAX) {
        problems.push(
            `${length} characters; a bullet is at most ${BULLET_MAX}, so split or cut it`
        );
    }
    if (plain.includes(";")) problems.push("a semicolon; make it one sentence or two bullets");
    return problems;
}

/**
 * Markdown with everything that isn't prose blanked out, line breaks kept so a
 * hit still has its line number: front matter, code fences, display and inline
 * math, inline code, HTML, and URLs. Link text, image alt text and table cells
 * stay, because visitors read them.
 */
function proseFromMarkdown(markdown) {
    const blank = (text) => text.replace(/[^\n]/g, " ");
    return markdown
        .replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, blank)
        .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank)
        .replace(/\$\$[\s\S]*?\$\$/g, blank)
        .replace(/\$(?=\S)[^$\n]*?\S\$(?!\d)/g, blank)
        .replace(/`[^`\n]+`/g, blank)
        .replace(/<!--[\s\S]*?-->/g, blank)
        .replace(/<[^>\n]+>/g, blank)
        .replace(/\]\([^)\s]*\)/g, (link) => "]" + blank(link.slice(1)))
        .replace(/https?:\/\/\S+/g, blank);
}

/** Tells in a markdown page, with line numbers: [{ line, snippet, reason }]. */
function findMarkdownTells(markdown) {
    const hits = [];
    proseFromMarkdown(markdown)
        .split("\n")
        .forEach((text, i) => {
            for (const hit of findTells(text)) hits.push({ line: i + 1, ...hit });
        });
    return hits;
}

module.exports = {
    TELLS,
    BULLET_MAX,
    findTells,
    bulletProblems,
    proseFromMarkdown,
    findMarkdownTells
};
