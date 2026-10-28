"use strict";

/**
 * Build the CV.
 *
 *   npm run cv    regenerate _cv.tex from master.yaml and cv.yaml, build
 *                 _resumes/output/cv.pdf to look at, and check it: everything
 *                 in master.yaml placed (on the CV or in cv.yaml's off list),
 *                 the standard every document meets (standard.js), two full
 *                 pages, and the bullet budget
 *
 * The PDF is gitignored, and the deploy builds /cv.pdf from the committed
 * _cv.tex. An application's resume is built with npm run apply (_apply.js).
 */

const fs = require("fs");
const path = require("path");
const { loadMaster } = require("./_lib/load.js");
const { resolvePublicCv, loadCvSpec, belowStandard, triageProblems } = require("./_lib/cv.js");
const { standardProblems, fillProblem, STANDARD } = require("./_lib/standard.js");
const { renderResumeTex } = require("./_lib/render-tex.js");
const { compileTex, measureOverrun } = require("./_lib/pdflatex.js");
const { fillNote, overNote } = require("./_lib/fill.js");
const { budgetReport, budgetContext } = require("./_lib/budget.js");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "output");

const rel = (file) => path.relative(process.cwd(), file);

function cv() {
    const master = loadMaster();
    const spec = loadCvSpec();
    const resolved = resolvePublicCv(master, spec);
    const tex = renderResumeTex(resolved);
    fs.writeFileSync(path.join(ROOT, "_cv.tex"), tex, "utf8");
    console.log("regenerated _resumes/_cv.tex");
    const { pdf, pages, fill } = compileTex({ tex, outDir: OUT_DIR, base: "cv" });
    const { maxPages } = resolved;
    const over = pages > maxPages;
    console.log(
        `wrote ${rel(pdf)} (${over ? `${pages} pages` : fillNote(pages, fill, fill?.small)})`
    );

    // Everything runs before anything fails, so one build lists all of it, and
    // the CV is there to look at either way.
    const problems = [...triageProblems(master, spec, resolved)];
    problems.push(
        ...standardProblems(resolved, { below: belowStandard(spec) }).map(
            (problem) => `The CV ${problem}.`
        )
    );
    if (over) {
        // How much has to come out, from the same .tex on one tall page.
        const points = fill?.goal
            ? measureOverrun({ tex, outDir: OUT_DIR, base: "cv", maxPages, goal: fill.goal })
            : null;
        problems.push(
            `The CV runs to ${pages} pages, past cv.yaml's maxPages of ${maxPages}` +
                `${points > 0 ? `, ${overNote(points, fill.small)}` : ""}. ` +
                "Move a bullet or an entry to off.room in cv.yaml."
        );
    }
    const unfilled = fillProblem({
        pages,
        fill,
        maxPages,
        what: "The CV",
        minFree: STANDARD.cvMinFreeLines
    });
    if (unfilled) problems.push(unfilled);
    const budget = budgetReport(master, budgetContext());
    for (const note of budget.notes) console.log(`  budget note: ${note}`);
    if (budget.problems.length) {
        problems.push(
            `The bullet budget has ${budget.problems.length} to fix:\n\n${budget.problems.join("\n\n")}`
        );
    }
    if (problems.length) throw new Error(problems.join("\n\n"));
}

try {
    cv();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
