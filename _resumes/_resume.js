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
 * Specs and PDFs are gitignored. The spec format is in _lib/resume.js.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const yaml = require("js-yaml");
const { loadMaster, resolveCv } = require("./_lib/load.js");
const { resolveResume, scaffoldResume, RESUMES_DIR } = require("./_lib/resume.js");
const { renderResumeTex } = require("./_lib/render-tex.js");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "output");
const NAME = /^[a-z0-9][a-z0-9-]*$/;

const rel = (file) => path.relative(process.cwd(), file);

function die(message) {
    console.error(message);
    process.exit(1);
}

/** Compile output/<name>.tex to output/<name>.pdf and report its page count. */
function compile(name, tex) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const texFile = path.join(OUT_DIR, `${name}.tex`);
    fs.writeFileSync(texFile, tex, "utf8");
    // Run from _resumes/ so \input{_preamble} and \input{_heading} resolve.
    const run = spawnSync(
        "pdflatex",
        [
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-output-directory=output",
            `output/${name}.tex`
        ],
        { cwd: ROOT, encoding: "utf8" }
    );
    if (run.error) die(`pdflatex isn't on your PATH. The .tex is at ${rel(texFile)}.`);
    const logFile = path.join(OUT_DIR, `${name}.log`);
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
    if (run.status !== 0) {
        const errors = log.split("\n").filter((line) => line.startsWith("!"));
        die(
            `pdflatex failed on ${rel(texFile)}:\n  ${errors.join("\n  ") || "see the .log next to it"}`
        );
    }
    for (const ext of [".aux", ".log", ".out"])
        fs.rmSync(path.join(OUT_DIR, name + ext), { force: true });
    const pages = /Output written on .*?\((\d+) pages?/.exec(log.replace(/\r?\n/g, ""))?.[1] ?? "?";
    console.log(
        `wrote ${rel(path.join(OUT_DIR, `${name}.pdf`))} (${pages} page${pages === "1" ? "" : "s"})`
    );
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
    compile(name, renderResumeTex(resolveResume(spec, loadMaster(), name)));
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
    const tex = renderResumeTex(resolveCv(loadMaster()));
    fs.writeFileSync(path.join(ROOT, "_cv.tex"), tex, "utf8");
    console.log("regenerated _resumes/_cv.tex");
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
