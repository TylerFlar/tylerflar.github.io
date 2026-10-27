"use strict";

/**
 * Build the CV.
 *
 *   npm run cv    regenerate _cv.tex, build _resumes/output/cv.pdf to look at,
 *                 and check the bullet budget
 *
 * The PDF is gitignored, and the deploy builds /cv.pdf from the committed
 * _cv.tex. An application's resume is built with npm run apply (_apply.js).
 */

const fs = require("fs");
const path = require("path");
const { loadMaster, resolveCv } = require("./_lib/load.js");
const { renderResumeTex } = require("./_lib/render-tex.js");
const { compileTex } = require("./_lib/pdflatex.js");
const { fillNote } = require("./_lib/fill.js");
const { budgetReport, budgetContext } = require("./_lib/budget.js");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "output");

const rel = (file) => path.relative(process.cwd(), file);

function cv() {
    const master = loadMaster();
    const tex = renderResumeTex(resolveCv(master));
    fs.writeFileSync(path.join(ROOT, "_cv.tex"), tex, "utf8");
    console.log("regenerated _resumes/_cv.tex");
    const { pdf, pages, fill } = compileTex({ tex, outDir: OUT_DIR, base: "cv" });
    console.log(`wrote ${rel(pdf)} (${fillNote(pages, fill, fill?.small)})`);
    // The budget runs last, so the CV is there to look at even when it fails.
    const { problems, notes } = budgetReport(master, budgetContext());
    for (const note of notes) console.log(`  budget note: ${note}`);
    if (problems.length) {
        throw new Error(
            `The bullet budget has ${problems.length} to fix:\n\n${problems.join("\n\n")}`
        );
    }
}

try {
    cv();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
