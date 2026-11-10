"use strict";

/**
 * Canonical-text markup renderer.
 *
 * Resume content is stored once as plain Unicode prose with a tiny inline
 * markup, then rendered to LaTeX or HTML:
 *
 *   **bold**          -> \textbf{...}   / <strong>...</strong>
 *   *italic*          -> \emph{...}     / <em>...</em>
 *   [text](url)       -> \href{url}{..} / <a href="url">...</a>
 *
 * Literal characters are escaped per target. Raw backslashes are banned in
 * canonical text, which is what makes LaTeX escaping provably correct; the
 * bounded escape hatch is a per-bullet `tex:` / `html:` override.
 */

const TEX_CHAR_MAP = new Map([
    ["%", "\\%"],
    ["&", "\\&"],
    ["#", "\\#"],
    ["$", "\\$"],
    ["_", "\\_"],
    ["{", "\\{"],
    ["}", "\\}"],
    ["^", "\\^{}"],
    ["~", "$\\sim$"],
    ["×", "$\\times$"],
    ["λ", "$\\lambda$"],
    ["–", "--"],
    ["—", "---"],
    ["“", "``"],
    ["”", "''"],
    ["‘", "`"],
    ["’", "'"]
]);

function assertCanonical(text, context) {
    if (typeof text !== "string") {
        throw new Error(`Canonical text must be a string (${context})`);
    }
    if (text.includes("\\")) {
        throw new Error(
            `Raw backslash in canonical text (${context}). ` +
                `Use the markup conventions or a tex:/html: override instead: ${text}`
        );
    }
}

function escapeTexLiteral(text, context) {
    let out = "";
    for (const ch of text) {
        const mapped = TEX_CHAR_MAP.get(ch);
        if (mapped !== undefined) {
            out += mapped;
        } else if (ch.codePointAt(0) > 126) {
            throw new Error(
                `Unmapped non-ASCII character "${ch}" (U+${ch
                    .codePointAt(0)
                    .toString(16)
                    .toUpperCase()}) in (${context}). ` +
                    `Add it to TEX_CHAR_MAP in _resumes/_lib/markup.js or use a tex: override.`
            );
        } else {
            out += ch;
        }
    }
    return out;
}

function escapeHtmlLiteral(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A link's address inside \href. The link sits in the argument of another
 * macro (a bullet, a heading cell), where TeX has already read the characters:
 * a bare % would start a comment, # would be a parameter and & a column break.
 * hyperref turns the escaped forms back into the plain characters.
 */
function texUrl(url) {
    return url.replace(/[%#&]/g, (char) => `\\${char}`);
}

/** A link's address inside href="...". */
function htmlUrl(url) {
    return escapeHtmlLiteral(url).replace(/"/g, "&quot;");
}

// Flat (non-nesting) inline spans: bold, italic, links.
const SPAN_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^()\s]+\))/g;

function tokenize(text) {
    const tokens = [];
    let last = 0;
    for (const match of text.matchAll(SPAN_PATTERN)) {
        if (match.index > last) {
            tokens.push({ type: "text", value: text.slice(last, match.index) });
        }
        const span = match[0];
        if (span.startsWith("**")) {
            tokens.push({ type: "bold", value: span.slice(2, -2) });
        } else if (span.startsWith("*")) {
            tokens.push({ type: "italic", value: span.slice(1, -1) });
        } else {
            const close = span.indexOf("](");
            tokens.push({
                type: "link",
                value: span.slice(1, close),
                url: span.slice(close + 2, -1)
            });
        }
        last = match.index + span.length;
    }
    if (last < text.length) {
        tokens.push({ type: "text", value: text.slice(last) });
    }
    return tokens;
}

/** Render canonical text to LaTeX. */
function renderTex(text, context = "text") {
    assertCanonical(text, context);
    return tokenize(text)
        .map((tok) => {
            switch (tok.type) {
                case "bold":
                    return `\\textbf{${escapeTexLiteral(tok.value, context)}}`;
                case "italic":
                    return `\\emph{${escapeTexLiteral(tok.value, context)}}`;
                case "link":
                    return `\\href{${texUrl(tok.url)}}{${escapeTexLiteral(tok.value, context)}}`;
                default:
                    return escapeTexLiteral(tok.value, context);
            }
        })
        .join("");
}

/** Render canonical text to HTML. */
function renderHtml(text, context = "text") {
    assertCanonical(text, context);
    return tokenize(text)
        .map((tok) => {
            switch (tok.type) {
                case "bold":
                    return `<strong>${escapeHtmlLiteral(tok.value)}</strong>`;
                case "italic":
                    return `<em>${escapeHtmlLiteral(tok.value)}</em>`;
                case "link":
                    return `<a href="${htmlUrl(tok.url)}">${escapeHtmlLiteral(tok.value)}</a>`;
                default:
                    return escapeHtmlLiteral(tok.value);
            }
        })
        .join("");
}

/**
 * Render canonical text to plain text: bold and italic become bare text, and a
 * link becomes "text (url)", or just its text with `urls: false` (how long a
 * line reads on the CV, where a link shows only its text).
 */
function renderPlain(text, context = "text", { urls = true } = {}) {
    assertCanonical(text, context);
    // A link whose text is its own address ("arena.tylerflar.com") prints once.
    const bare = (url) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return tokenize(text)
        .map((tok) =>
            tok.type === "link" && urls && tok.value !== bare(tok.url)
                ? `${tok.value} (${tok.url})`
                : tok.value
        )
        .join("");
}

// Characters that may precede the first word without blocking capitalization
// (markup markers, quotes, an opening paren). Anything else — "λ-calculus",
// "(~138 MHz)" — means the bullet doesn't open with a plain word: leave it.
const CAP_PREFIX = new Set(["*", "[", '"', "'", "“", "‘", "("]);

/**
 * Bullet house style, enforced at render time so per-variant rewordings can't
 * drift: every bullet ends with terminal punctuation, and a bullet opening
 * with a plain all-lowercase word gets its first letter capitalized. Mixed-case
 * openers ("iOS", "gRPC") are left alone. tex:/html: overrides bypass this.
 */
function normalizeBulletText(text) {
    if (typeof text !== "string") return text;
    let out = text.trimEnd();
    if (out && !/[.!?…]["'”’)\]]*$/.test(out)) out += ".";
    let i = 0;
    while (i < out.length && CAP_PREFIX.has(out[i])) i++;
    const word = /^[a-z]+(?=[^A-Za-z]|$)/.exec(out.slice(i));
    if (word) out = out.slice(0, i) + out[i].toUpperCase() + out.slice(i + 1);
    return out;
}

/** Render a bullet object ({ text, tex?, html? }) to LaTeX. */
function renderBulletTex(bullet, context = "bullet") {
    if (bullet.tex !== undefined) return bullet.tex;
    return renderTex(normalizeBulletText(bullet.text), context);
}

/** Render a bullet object ({ text, tex?, html? }) to HTML. */
function renderBulletHtml(bullet, context = "bullet") {
    if (bullet.html !== undefined) return bullet.html;
    return renderHtml(normalizeBulletText(bullet.text), context);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// An end still ahead, like a degree in progress: "expected 2027-03".
const EXPECTED = /^expected\s+/i;

/** "2025-05" -> "May 2025"; "present" -> "Present"; "expected 2027-03" -> "Expected Mar 2027". */
function formatMonthYear(value, context = "date") {
    if (typeof value === "string" && value.toLowerCase() === "present") return "Present";
    if (typeof value === "string" && EXPECTED.test(value)) {
        return `Expected ${formatMonthYear(value.replace(EXPECTED, ""), context)}`;
    }
    const match = /^(\d{4})-(\d{2})$/.exec(String(value));
    if (!match) {
        throw new Error(
            `Invalid date "${value}" (${context}); expected "YYYY-MM", present or "expected YYYY-MM"`
        );
    }
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
        throw new Error(`Invalid month in date "${value}" (${context})`);
    }
    return `${MONTHS[month - 1]} ${match[1]}`;
}

/**
 * A span of months, "May 2025 – Sep 2025", with the dash its target wants: an en
 * dash on the site, two hyphens in LaTeX, one in plain text. One month prints once.
 */
function dateRange(start, end, context = "date range", dash = " – ") {
    if (start === end) return formatMonthYear(start, context);
    return `${formatMonthYear(start, context)}${dash}${formatMonthYear(end, context)}`;
}

/** "2025-05".."2025-09" -> "May 2025 -- Sep 2025" (LaTeX en dash). */
const texDateRange = (start, end, context = "date range") => dateRange(start, end, context, " -- ");

/** "2025-05" -> "2025"; "present" -> "Present"; "expected 2027-03" -> "Expected 2027". */
function formatYear(value, context = "date") {
    if (typeof value === "string" && value.toLowerCase() === "present") return "Present";
    if (typeof value === "string" && EXPECTED.test(value)) {
        return `Expected ${formatYear(value.replace(EXPECTED, ""), context)}`;
    }
    const match = /^(\d{4})-(\d{2})$/.exec(String(value));
    if (!match) {
        throw new Error(
            `Invalid date "${value}" (${context}); expected "YYYY-MM", present or "expected YYYY-MM"`
        );
    }
    return match[1];
}

// A course's code: "CSE 252D" in "CSE 252D Advanced Computer Vision".
const CODE = "[A-Z]{2,5} \\d+[A-Z]*";
const COURSE_CODE = new RegExp(`^${CODE}\\b`);
// The code ahead of a title. A course that's only a code doesn't match, so it
// never prints empty.
const CODE_AND_SPACE = new RegExp(`^${CODE}\\s+`);

/** A course's code, the way cv.yaml or a resume picks it, or null if it has none. */
function courseCode(course) {
    return COURSE_CODE.exec(String(course))?.[0] ?? null;
}

/**
 * "CSE 252D Advanced Computer Vision" -> "Advanced Computer Vision". The code
 * picks a course for the CV or a resume, but means nothing to a reader outside
 * UCSD, so only the title prints, on the CV and the website alike.
 */
function courseTitle(course) {
    return String(course).replace(CODE_AND_SPACE, "");
}

module.exports = {
    renderTex,
    renderHtml,
    renderPlain,
    renderBulletTex,
    renderBulletHtml,
    texUrl,
    normalizeBulletText,
    formatMonthYear,
    formatYear,
    dateRange,
    texDateRange,
    courseCode,
    courseTitle
};
