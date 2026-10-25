"use strict";

/**
 * Build the CV.
 *
 *   npm run cv    regenerate _cv.tex and build _resumes/output/cv.pdf to look at
 *
 * The PDF is gitignored, and the deploy builds /cv.pdf from the committed
 * _cv.tex. An application's resume is built with npm run apply (_apply.js).
 */

const fs = require("fs");
const path = require("path");
const { loadMaster, resolveCv } = require("./_lib/load.js");
const { renderResumeTex } = require("./_lib/render-tex.js");
const { compileTex } = require("./_lib/pdflatex.js");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "output");

const rel = (file) => path.relative(process.cwd(), file);

function cv() {
    const master = loadMaster();
    const tex = renderResumeTex(resolveCv(master));
    fs.writeFileSync(path.join(ROOT, "_cv.tex"), tex, "utf8");
    console.log("regenerated _resumes/_cv.tex");
    // The bullet budget is a suggestion, so an entry over it is a note, not a failure.
    for (const note of master.budgetNotes) console.log(`  budget note: ${note}`);
    const { pdf, pages } = compileTex({ tex, outDir: OUT_DIR, base: "cv" });
    console.log(`wrote ${rel(pdf)} (${pages ?? "?"} page${pages === 1 ? "" : "s"})`);
}

try {
    cv();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
