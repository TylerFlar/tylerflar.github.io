"use strict";

/**
 * Applications: one folder per job, holding the resume and cover letter for it.
 *
 *   npm run apply new <name> [spec]   start _resumes/applications/<name>/ with
 *                                     resume.yaml (a copy of resume spec [spec], like
 *                                     tyler-flar-software, or the whole CV),
 *                                     cover-letter.md, notes.md and posting.md
 *   npm run apply <name>              build tyler-flar-resume.pdf and
 *                                     tyler-flar-cover-letter.pdf in that folder
 *   npm run apply                     list your applications
 *
 * resume.yaml uses the resume spec format (_lib/resume.js). The cover letter
 * format is in _lib/letter.js. A cover letter isn't the resume again: it's
 * written from notes.md (your answers for this job) and about-me.md (the ones
 * that carry over between jobs, shared by every application).
 *
 * The folder is gitignored: it shows where you're applying, and this repo is
 * public.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadMaster } = require("./_lib/load.js");
const { resolveResume, scaffoldResume, RESUMES_DIR } = require("./_lib/resume.js");
const { renderResumeTex } = require("./_lib/render-tex.js");
const { parseLetter, renderLetterTex, letterTells } = require("./_lib/letter.js");
const { compileTex } = require("./_lib/pdflatex.js");

const APPS_DIR = path.join(__dirname, "applications");
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const RESUME_PDF = "tyler-flar-resume";
const LETTER_PDF = "tyler-flar-cover-letter";

const rel = (file) => path.relative(process.cwd(), file);

function die(message) {
    console.error(message);
    process.exit(1);
}

function appDir(name) {
    if (!NAME.test(name || "")) {
        die('Use lowercase letters, digits and dashes for the name, like "acme-robotics-intern".');
    }
    return path.join(APPS_DIR, name);
}

const letterTemplate = (name) => `---
company: ""
# role: The job title, printed as a "Re:" line
# recipient: Hiring Team
# salutation: Dear Hiring Manager,
# closing: Sincerely,
# date: 2026-10-21   (today if left out)
---

<!--
The resume already lists what you've done. The letter is where they meet you:
why this company, what in your own life connects to it, and what you'd want to
do there. Write it from your answers in notes.md and ../about-me.md, not from
the resume, and keep any example from your work to one or two, told as a story.

Separate paragraphs with a blank line. **bold**, *italic* and [links](https://...)
work, and this comment isn't printed. It has to fit on one page.
Build it with: npm run apply ${name}
-->
`;

const notesTemplate = (name) => `# Notes for ${name}

Your answers, in your own words. The cover letter is written from these and
../about-me.md, not from the resume. Answers that would fit other jobs too go
in about-me.md.

## Have you used their product? How, and what do you think of it?

## Why this company or team, beyond the job title?

## What connects you to what they do that isn't on your resume?

## What would you want to work on or learn there?

## Anything else: a referral, someone you've talked to, how you found the job
`;

const POSTING_TEMPLATE = `# Posting

Link:

Paste the job posting here. Nothing builds from this file; it's here to tailor
the resume and the letter against.
`;

const ABOUT_ME_TEMPLATE = `# About me

The answers that carry over between applications, in your own words: what you
do outside of work, stories worth telling, what you want to work on next. Every
cover letter draws on this file, so add to it whenever an answer for one job
would fit another.

## Outside of work

## Stories worth telling

## What I want to work on next
`;

/** resume.yaml for a new application: a copy of a resume spec, or the whole CV. */
function resumeSpecFor(name, from) {
    const header = [
        `# Resume for ${name}. Build it with: npm run apply ${name}`,
        ...(from ? [`# Started from _resumes/resumes/${from}.yaml.`] : []),
        ""
    ];
    if (!from) {
        const scaffold = scaffoldResume(loadMaster(), name)
            .replace(`# Resume: ${name}\n`, "")
            .replace(`npm run resume ${name}`, `npm run apply ${name}`)
            .replace("# maxPages: 1", "maxPages: 1")
            .replace("# compactHeading: true", "compactHeading: true");
        return `${header.join("\n")}\n${scaffold}`;
    }
    const file = path.join(RESUMES_DIR, `${from}.yaml`);
    if (!fs.existsSync(file)) {
        const specs = fs.existsSync(RESUMES_DIR)
            ? fs.readdirSync(RESUMES_DIR).filter((f) => f.endsWith(".yaml"))
            : [];
        die(
            `No resume spec "${from}". You have: ${specs.map((f) => path.basename(f, ".yaml")).join(", ") || "none"}`
        );
    }
    // Drop the spec's own header comment, which names its own build command.
    const body = fs.readFileSync(file, "utf8").replace(/^(?:#.*\r?\n|\s*\r?\n)*/, "");
    return `${header.join("\n")}\n${body}`;
}

function newApplication(name, from) {
    const dir = appDir(name);
    if (fs.existsSync(dir)) die(`${rel(dir)} already exists.`);
    const resume = resumeSpecFor(name, from);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "resume.yaml"), resume, "utf8");
    fs.writeFileSync(path.join(dir, "cover-letter.md"), letterTemplate(name), "utf8");
    fs.writeFileSync(path.join(dir, "notes.md"), notesTemplate(name), "utf8");
    fs.writeFileSync(path.join(dir, "posting.md"), POSTING_TEMPLATE, "utf8");
    // One about-me.md for every application, started the first time.
    const aboutMe = path.join(APPS_DIR, "about-me.md");
    if (!fs.existsSync(aboutMe)) fs.writeFileSync(aboutMe, ABOUT_ME_TEMPLATE, "utf8");
    console.log(
        `wrote ${rel(dir)}/ with resume.yaml, cover-letter.md, notes.md and posting.md.\n` +
            "Paste the posting, answer notes.md, tailor the resume and write the letter, " +
            `then run: npm run apply ${name}`
    );
}

const pageLabel = (pages) => `${pages ?? "?"} page${pages === 1 ? "" : "s"}`;

function build(name) {
    const dir = appDir(name);
    if (!fs.existsSync(dir))
        die(`No application "${name}". Start one with: npm run apply new ${name}`);
    const problems = [];

    const specFile = path.join(dir, "resume.yaml");
    if (fs.existsSync(specFile)) {
        const resume = resolveResume(
            yaml.load(fs.readFileSync(specFile, "utf8")),
            loadMaster(),
            name
        );
        resume.source = `_resumes/applications/${name}/resume.yaml`;
        resume.regenerate = `npm run apply ${name}`;
        const { pdf, pages } = compileTex({
            tex: renderResumeTex(resume),
            outDir: dir,
            base: RESUME_PDF,
            keepTex: false
        });
        console.log(`wrote ${rel(pdf)} (${pageLabel(pages)})`);
        if (resume.maxPages && pages > resume.maxPages) {
            const over = pages - resume.maxPages;
            problems.push(
                `The resume is over by ${over} page${over === 1 ? "" : "s"} (maxPages: ${resume.maxPages}). Cut a bullet or an entry.`
            );
        }
    } else {
        console.log("No resume.yaml, so no resume.");
    }

    const letterFile = path.join(dir, "cover-letter.md");
    const letter = fs.existsSync(letterFile)
        ? parseLetter(fs.readFileSync(letterFile, "utf8"), `${name}/cover-letter.md`)
        : null;
    if (!letter || !letter.paragraphs.length) {
        console.log("cover-letter.md has no paragraphs yet, so no letter.");
    } else {
        const { pdf, pages } = compileTex({
            tex: renderLetterTex(letter, {
                source: `_resumes/applications/${name}/cover-letter.md`,
                regenerate: `npm run apply ${name}`
            }),
            outDir: dir,
            base: LETTER_PDF,
            keepTex: false
        });
        console.log(`wrote ${rel(pdf)} (${pageLabel(pages)})`);
        if (pages > 1) problems.push(`The cover letter runs to ${pages} pages; keep it to one.`);
        for (const hit of letterTells(letter)) {
            console.log(`  note, paragraph ${hit.paragraph}: ${hit.reason}: "${hit.snippet}"`);
        }
    }

    if (problems.length) die(problems.join("\n"));
}

function list() {
    // Folders only: about-me.md sits beside them.
    const names = fs.existsSync(APPS_DIR)
        ? fs
              .readdirSync(APPS_DIR)
              .filter((entry) => fs.statSync(path.join(APPS_DIR, entry)).isDirectory())
        : [];
    if (!names.length) {
        console.log("No applications yet. Start one with: npm run apply new <name> [resume spec]");
        return;
    }
    for (const name of names.sort()) {
        const has = (base) => fs.existsSync(path.join(APPS_DIR, name, `${base}.pdf`));
        const built = [has(RESUME_PDF) && "resume", has(LETTER_PDF) && "cover letter"].filter(
            Boolean
        );
        console.log(`${name}${built.length ? `  (built: ${built.join(", ")})` : ""}`);
    }
}

function main() {
    const [command, name, from] = process.argv.slice(2);
    if (!command) return list();
    if (command === "new") return newApplication(name, from);
    return build(command);
}

try {
    main();
} catch (error) {
    die(error.message);
}
