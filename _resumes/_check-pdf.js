"use strict";

/**
 * Build the CV's PDF from the committed _cv.tex and check its page count
 * against cv.yaml's maxPages.
 *
 *   node _resumes/_check-pdf.js
 *
 * CI and the deploy run this under TeX Live. npm run cv checks the pages and
 * the fill under the TeX on this machine, which sets XCharter a hair
 * differently, so without this nothing would look at the PDF that goes out: a
 * line that moves could turn two pages into three and still deploy. The PDF it
 * leaves at _resumes/_cv.pdf is the one the deploy publishes.
 */

const fs = require("fs");
const path = require("path");
const { loadCvSpec } = require("./_lib/cv.js");
const { compileTex, RESUMES_ROOT } = require("./_lib/pdflatex.js");
const { fillNote } = require("./_lib/fill.js");

try {
    const { maxPages } = loadCvSpec();
    const tex = fs.readFileSync(path.join(RESUMES_ROOT, "_cv.tex"), "utf8");
    const { pdf, pages, fill } = compileTex({ tex, outDir: RESUMES_ROOT, base: "_cv" });
    console.log(
        `wrote ${path.relative(process.cwd(), pdf)} (${fillNote(pages, fill, fill?.small)})`
    );
    if (pages !== maxPages) {
        throw new Error(
            `The CV came out at ${pages ?? "an unknown number of"} pages here, and cv.yaml's maxPages is ${maxPages}. ` +
                "This TeX sets it differently from the one npm run cv used: move a bullet or an entry " +
                "to off.room in cv.yaml, so the last page keeps a line or two more free."
        );
    }
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
