"use strict";

/**
 * Make resumes from the CV.
 *
 *   npm run resume new <name>   write _resumes/resumes/<name>.yaml with the whole CV
 *                               in it; delete what the job doesn't need
 *   npm run resume <name>       build _resumes/output/<name>.pdf from that spec
 *   npm run resume              list your specs
 *   npm run cv                  regenerate _cv.tex and build _resumes/output/cv.pdf
 *
 * Specs and PDFs are gitignored. The spec format is in _lib/resume.js. For a
 * resume and cover letter for one application, see _apply.js.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadMaster, resolveCv } = require("./_lib/load.js");
const { resolveResume, scaffoldResume, RESUMES_DIR } = require("./_lib/resume.js");
const { renderResumeTex } = require("./_lib/render-tex.js");
const { compileTex } = require("./_lib/pdflatex.js");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "output");
const NAME = /^[a-z0-9][a-z0-9-]*$/;

const rel = (file) => path.relative(process.cwd(), file);

function die(message) {
    console.error(message);
    process.exit(1);
}

/**
 * Compile output/<name>.tex to output/<name>.pdf and report its page count.
 * Past `maxPages` the PDF is kept to look at, but the run fails.
 */
function compile(name, tex, maxPages) {
    const { pdf, pages } = compileTex({ tex, outDir: OUT_DIR, base: name });
    console.log(`wrote ${rel(pdf)} (${pages ?? "?"} page${pages === 1 ? "" : "s"})`);
    if (maxPages && pages > maxPages) {
        const over = pages - maxPages;
        die(
            `${name} is over by ${over} page${over === 1 ? "" : "s"} (maxPages: ${maxPages}). Cut a bullet or an entry.`
        );
    }
}

function specFile(name) {
    if (!NAME.test(name))
        die(`Use lowercase letters, digits and dashes for the name, like "acme-robotics".`);
    return path.join(RESUMES_DIR, `${name}.yaml`);
}

function newSpec(name) {
    if (!name) die("Usage: npm run resume new <name>");
    const file = specFile(name);
    if (fs.existsSync(file)) die(`${rel(file)} already exists.`);
    fs.mkdirSync(RESUMES_DIR, { recursive: true });
    fs.writeFileSync(file, scaffoldResume(loadMaster(), name), "utf8");
    console.log(`wrote ${rel(file)}. Trim it, then run: npm run resume ${name}`);
}

function build(name) {
    const file = specFile(name);
    if (!fs.existsSync(file))
        die(`No spec at ${rel(file)}. Start one with: npm run resume new ${name}`);
    const spec = yaml.load(fs.readFileSync(file, "utf8"));
    const resume = resolveResume(spec, loadMaster(), name);
    compile(name, renderResumeTex(resume), resume.maxPages);
}

function list() {
    const names = fs.existsSync(RESUMES_DIR)
        ? fs.readdirSync(RESUMES_DIR).filter((file) => file.endsWith(".yaml"))
        : [];
    if (!names.length) {
        console.log("No resume specs yet. Start one with: npm run resume new <name>");
        return;
    }
    for (const file of names.sort()) console.log(path.basename(file, ".yaml"));
}

function cv() {
    const master = loadMaster();
    const tex = renderResumeTex(resolveCv(master));
    fs.writeFileSync(path.join(ROOT, "_cv.tex"), tex, "utf8");
    console.log("regenerated _resumes/_cv.tex");
    // The bullet budget is a suggestion, so an entry over it is a note, not a failure.
    for (const note of master.budgetNotes) console.log(`  budget note: ${note}`);
    compile("cv", tex);
}

function main() {
    const [command, name] = process.argv.slice(2);
    if (!command) return list();
    if (command === "new") return newSpec(name);
    if (command === "cv") return cv();
    return build(command);
}

try {
    main();
} catch (error) {
    die(error.message);
}
