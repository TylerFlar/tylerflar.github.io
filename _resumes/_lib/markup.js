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
                    return `\\href{${tok.url}}{${escapeTexLiteral(tok.value, context)}}`;
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
                    return `<a href="${tok.url}">${escapeHtmlLiteral(tok.value)}</a>`;
                default:
                    return escapeHtmlLiteral(tok.value);
            }
        })
        .join("");
}

/** Render a bullet object ({ text, tex?, html? }) to LaTeX. */
function renderBulletTex(bullet, context = "bullet") {
    if (bullet.tex !== undefined) return bullet.tex;
    return renderTex(bullet.text, context);
}

/** Render a bullet object ({ text, tex?, html? }) to HTML. */
function renderBulletHtml(bullet, context = "bullet") {
    if (bullet.html !== undefined) return bullet.html;
    return renderHtml(bullet.text, context);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-05" -> "May 2025"; "present" -> "Present". */
function formatMonthYear(value, context = "date") {
    if (typeof value === "string" && value.toLowerCase() === "present") return "Present";
    const match = /^(\d{4})-(\d{2})$/.exec(String(value));
    if (!match) {
        throw new Error(`Invalid date "${value}" (${context}); expected "YYYY-MM" or present`);
    }
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
        throw new Error(`Invalid month in date "${value}" (${context})`);
    }
    return `${MONTHS[month - 1]} ${match[1]}`;
}

/** "2025-05".."2025-09" -> "May 2025 -- Sep 2025" (LaTeX en dash). */
function texDateRange(start, end, context = "date range") {
    return `${formatMonthYear(start, context)} -- ${formatMonthYear(end, context)}`;
}

/** "2025-05" -> "2025"; "present" -> "Present". */
function formatYear(value, context = "date") {
    if (typeof value === "string" && value.toLowerCase() === "present") return "Present";
    const match = /^(\d{4})-(\d{2})$/.exec(String(value));
    if (!match) {
        throw new Error(`Invalid date "${value}" (${context}); expected "YYYY-MM" or present`);
    }
    return match[1];
}

module.exports = {
    renderTex,
    renderHtml,
    renderBulletTex,
    renderBulletHtml,
    formatMonthYear,
    formatYear,
    texDateRange
};
