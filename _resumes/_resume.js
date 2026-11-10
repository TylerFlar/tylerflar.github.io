"use strict";

/**
 * Build the CV.
 *
 *   npm run cv    regenerate _cv.tex from master.yaml and cv.yaml, build
 *                 _resumes/output/cv.pdf to look at, and check it: everything
 *                 in master.yaml placed (on the CV or in cv.yaml's off list),
 *                 its skills and courses in rank order (rank.js), the standard
 *                 every document meets (standard.js), two full pages, and the
 *                 bullet budget on what the CV prints. Its budget notes say
 *                 what's due to drop and which pages are due off the site,
 *                 and a project in budget with no page fails
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
const { fillNote, overNote, shortPageNotes } = require("./_lib/fill.js");
const { budgetProblems, pageNotes, pageProblems } = require("./_lib/budget.js");
const { rankProblems } = require("./_lib/rank.js");
const { loadProjectPages } = require("./_lib/pages.js");

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
    const { pdf, pages, fill, pageFills } = compileTex({ tex, outDir: OUT_DIR, base: "cv" });
    const { maxPages } = resolved;
    const over = pages > maxPages;
    console.log(
        `wrote ${rel(pdf)} (${over ? `${pages} pages` : fillNote(pages, fill, fill?.small)})`
    );
    // An entry moves to the next page whole, so an earlier page can end short.
    for (const note of shortPageNotes(pageFills, fill?.small)) console.log(`  ${note}`);

    // Everything runs before anything fails, so one build lists all of it, and
    // the CV is there to look at either way.
    const problems = [...triageProblems(master, spec, resolved)];
    if (pages == null) {
        problems.push(
            "pdflatex's log didn't say how many pages the CV came to, so its page limit and its " +
                "fill weren't checked. Build it again, and look at the PDF if it says so twice."
        );
    }
    problems.push(...rankProblems(master, resolved));
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
    const budget = budgetProblems(master, resolved, { cv: true });
    // A page comes off the site when its entry runs out of budget, so the notes
    // name those too. They don't fail the build: deleting a page is a person's
    // step, and a month turning over shouldn't stop the site.
    const sitePages = loadProjectPages();
    const notes = [...budget.notes, ...pageNotes(master, sitePages)];
    for (const note of notes) console.log(`  budget note: ${note}`);
    // The other way round does fail: a project in budget with no page.
    problems.push(...pageProblems(master, sitePages));
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
