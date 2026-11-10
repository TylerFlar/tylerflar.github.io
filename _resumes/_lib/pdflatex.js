"use strict";

// One pdflatex run, shared by the resume and application commands. It runs
// from _resumes/ so \input{_preamble} and \input{_heading} resolve wherever
// the PDF goes.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RESUMES_ROOT = path.join(__dirname, "..");

// \pagegoal is \maxdimen (16383.99998pt) while a page has nothing on it.
const EMPTY_PAGE_GOAL = 16000;

/**
 * The last page's fill, from the line the preamble writes to the log at the
 * end of the document, in points: `need`, the height its text takes with its
 * spacing shrunk as far as TeX will (which is how TeX decides a page fits),
 * `goal`, the height a page holds, and one line of \small text and of body
 * text. An empty last page has no goal yet, so goal comes back null. Null if
 * the log has no such line. TeX wraps long log lines, so it reads the log with
 * its line breaks taken out, as the page count is.
 */
function readFill(log) {
    const match =
        /RESUMEFILL used=(-?[\d.]+)pt shrink=([\d.]+)pt goal=([\d.]+)pt small=([\d.]+)pt normal=([\d.]+)pt/.exec(
            log.replace(/\r?\n/g, "")
        );
    if (!match) return null;
    const [used, shrink, goal, small, normal] = match.slice(1).map(Number);
    return { need: used - shrink, goal: goal >= EMPTY_PAGE_GOAL ? null : goal, small, normal };
}

/**
 * Every page's own fill, from the line the preamble writes as each one ships:
 * [{ page, used, goal }] in points, `used` being the page's text at its natural
 * height and `goal` what a page holds. The fill line above sees only the last
 * page, and an entry that doesn't fit moves to the next page whole, so this is
 * how the build knows an earlier page ended short. Empty if the log has none.
 */
function readPages(log) {
    const lines = log
        .replace(/\r?\n/g, "")
        .matchAll(/RESUMEPAGE page=(\d+) used=(-?[\d.]+)pt goal=([\d.]+)pt/g);
    return [...lines].map(([, page, used, goal]) => ({
        page: Number(page),
        used: Number(used),
        goal: Number(goal)
    }));
}

/**
 * Write `tex` to <outDir>/<base>.tex and compile it there. Returns the PDF's
 * path, its page count (null if the log doesn't say), how full its last page
 * is (readFill) and each page's own fill (readPages). Throws with pdflatex's
 * error lines on failure, leaving the .tex to look at; on success the .tex is
 * kept only if `keepTex`.
 */
function compileTex({ tex, outDir, base, keepTex = true }) {
    fs.mkdirSync(outDir, { recursive: true });
    const texFile = path.join(outDir, `${base}.tex`);
    fs.writeFileSync(texFile, tex, "utf8");
    // TeX reads its command line as input, so the path needs forward slashes.
    const rel = path.relative(RESUMES_ROOT, outDir).split(path.sep).join("/") || ".";
    const run = spawnSync(
        "pdflatex",
        [
            "-interaction=nonstopmode",
            "-halt-on-error",
            `-output-directory=${rel}`,
            `${rel}/${base}.tex`
        ],
        { cwd: RESUMES_ROOT, encoding: "utf8" }
    );
    if (run.error) throw new Error(`pdflatex isn't on your PATH. The .tex is at ${texFile}.`);
    const logFile = path.join(outDir, `${base}.log`);
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
    if (run.status !== 0) {
        const errors = log.split("\n").filter((line) => line.startsWith("!"));
        throw new Error(
            `pdflatex failed on ${texFile}:\n  ${errors.join("\n  ") || "see the .log next to it"}`
        );
    }
    for (const ext of [".aux", ".log", ".out"]) {
        fs.rmSync(path.join(outDir, base + ext), { force: true });
    }
    if (!keepTex) fs.rmSync(texFile, { force: true });
    const pages = /Output written on .*?\((\d+) pages?/.exec(log.replace(/\r?\n/g, ""))?.[1];
    return {
        pdf: path.join(outDir, `${base}.pdf`),
        pages: pages ? Number(pages) : null,
        fill: readFill(log),
        pageFills: readPages(log)
    };
}

/**
 * How far a document runs past `maxPages` pages that each hold `goal` points:
 * the same .tex compiled once more on one tall page (\resumeMeasure in the
 * preamble), where the fill line measures all of it. Points over, or null if
 * it can't tell, as when a section starts on a new page of its own.
 */
function measureOverrun({ tex, outDir, base, maxPages, goal }) {
    const measureBase = `${base}-measure`;
    const { pages, fill } = compileTex({
        tex: `\\def\\resumeMeasure{}\n${tex}`,
        outDir,
        base: measureBase,
        keepTex: false
    });
    fs.rmSync(path.join(outDir, `${measureBase}.pdf`), { force: true });
    if (pages !== 1 || !fill) return null;
    return fill.need - goal * maxPages;
}

module.exports = { compileTex, measureOverrun, readFill, readPages, RESUMES_ROOT };
