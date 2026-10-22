"use strict";

// One pdflatex run, shared by the resume and application commands. It runs
// from _resumes/ so \input{_preamble} and \input{_heading} resolve wherever
// the PDF goes.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RESUMES_ROOT = path.join(__dirname, "..");

/**
 * Write `tex` to <outDir>/<base>.tex and compile it there. Returns the PDF's
 * path and its page count (null if the log doesn't say). Throws with
 * pdflatex's error lines on failure, leaving the .tex to look at; on success
 * the .tex is kept only if `keepTex`.
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
    return { pdf: path.join(outDir, `${base}.pdf`), pages: pages ? Number(pages) : null };
}

module.exports = { compileTex, RESUMES_ROOT };
