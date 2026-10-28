"use strict";

/**
 * Regenerate _resumes/_cv.tex from master.yaml, as cv.yaml picks it. The
 * deploy compiles the committed file, so commit it with any change to either.
 *
 *   node _resumes/_generate.js            write _cv.tex
 *   node _resumes/_generate.js --check    exit 1 if the committed _cv.tex is stale (CI)
 *
 * The `_cv` argument older commands pass is accepted and ignored. To also
 * build a PDF to look at, use `npm run cv`; for an application's resume, `npm run apply`.
 */

const fs = require("fs");
const path = require("path");
const { loadMaster } = require("./_lib/load.js");
const { resolvePublicCv } = require("./_lib/cv.js");
const { renderResumeTex } = require("./_lib/render-tex.js");

const CV_TEX = path.join(__dirname, "_cv.tex");

function main() {
    const tex = renderResumeTex(resolvePublicCv(loadMaster()));
    if (process.argv.includes("--check")) {
        // A Windows checkout with core.autocrlf may hand back CRLF; line
        // endings are not staleness.
        const committed = fs.existsSync(CV_TEX)
            ? fs.readFileSync(CV_TEX, "utf8").replace(/\r\n/g, "\n")
            : null;
        if (committed !== tex) {
            console.error(
                "STALE: _cv.tex doesn't match master.yaml and cv.yaml. Run: node _resumes/_generate.js"
            );
            process.exit(1);
        }
        console.log("ok: _cv.tex");
        return;
    }
    fs.writeFileSync(CV_TEX, tex, "utf8");
    console.log("generated _cv.tex");
}

main();
