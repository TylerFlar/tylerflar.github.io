"use strict";

/**
 * Applications: one folder per job. Most only need a resume, so that's what a
 * new one starts with. A cover letter and answers to the form's questions are
 * added when an application asks for them.
 *
 *   npm run apply new <name> [from]   start _resumes/applications/<name>/ with
 *                                     resume.yaml (the whole CV, or a copy of
 *                                     application [from]'s) and posting.md
 *   npm run apply letter <name>       add cover-letter.md and notes.md to it
 *   npm run apply questions <name>    add answers.md, for the form's questions
 *   npm run apply <name>              build tyler-flar-resume.pdf, and
 *                                     tyler-flar-cover-letter.pdf once the letter
 *                                     has paragraphs
 *   npm run apply                     list your applications
 *
 * resume.yaml uses the resume spec format (_lib/resume.js). The cover letter
 * format is in _lib/letter.js. A cover letter isn't the resume again: it's
 * written from notes.md (your answers for this job) and about-me.md (the ones
 * that carry over between jobs, shared by every application). answers.md builds
 * into nothing, since its answers get pasted into the form, but the build prints
 * the voice lint's tells in it as notes, like the letter's.
 *
 * The folder is gitignored: it shows where you're applying, and this repo is
 * public.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadMaster } = require("./_lib/load.js");
const { resolveResume, scaffoldResume } = require("./_lib/resume.js");
const { renderResumeTex } = require("./_lib/render-tex.js");
const { parseLetter, renderLetterTex, letterTells } = require("./_lib/letter.js");
const { findMarkdownTells } = require("./_lib/voice.js");
const { compileTex } = require("./_lib/pdflatex.js");

const APPS_DIR = path.join(__dirname, "applications");
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const COMMANDS = ["new", "letter", "questions"];
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

/** The application folders, sorted. about-me.md sits beside them. */
function applications() {
    return fs.existsSync(APPS_DIR)
        ? fs
              .readdirSync(APPS_DIR)
              .filter((entry) => fs.statSync(path.join(APPS_DIR, entry)).isDirectory())
              .sort()
        : [];
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

const answersTemplate = (name) => `# Application questions

The questions on ${name}'s form, as they come up, each with an answer ready to
paste. Nothing builds from this file, but npm run apply ${name} prints the
voice lint's tells in it as notes.

<!--
Put each question in a heading, word for word, with its limit if it has one,
and the answer under it in your own words. Draw on ../about-me.md, the CV and
the project pages, and put an answer that would fit other applications in
about-me.md too.
-->

## The question, word for word (and its limit, like 250 words)
`;

const POSTING_TEMPLATE = `# Posting

Link:

Paste the job posting here. Nothing builds from this file; it's here to tailor
the resume against, and the letter and answers if there are any.
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

/** resume.yaml for a new application: the whole CV, or a copy of application [from]'s. */
function resumeSpecFor(name, from) {
    if (!from) return scaffoldResume(loadMaster(), name);
    const file = path.join(appDir(from), "resume.yaml");
    if (!fs.existsSync(file)) {
        const withResume = applications().filter((app) =>
            fs.existsSync(path.join(APPS_DIR, app, "resume.yaml"))
        );
        die(
            `No resume.yaml in application "${from}". Applications with one: ${withResume.join(", ") || "none"}`
        );
    }
    // Drop its header comment, which is about that job.
    const body = fs.readFileSync(file, "utf8").replace(/^(?:#.*\r?\n|\s*\r?\n)*/, "");
    const header = [
        `# Resume for ${name}. Build it with: npm run apply ${name}`,
        `# Started from ${from}'s resume.yaml.`
    ];
    return `${header.join("\n")}\n\n${body}`;
}

function newApplication(name, from) {
    if (!name) die("Usage: npm run apply new <name> [from]");
    if (COMMANDS.includes(name)) {
        die(
            `"${name}" is a command. Name the application after the job, like "acme-robotics-intern".`
        );
    }
    const dir = appDir(name);
    if (fs.existsSync(dir)) die(`${rel(dir)} already exists.`);
    const resume = resumeSpecFor(name, from);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "resume.yaml"), resume, "utf8");
    fs.writeFileSync(path.join(dir, "posting.md"), POSTING_TEMPLATE, "utf8");
    console.log(
        `wrote ${rel(dir)}/ with resume.yaml and posting.md.\n` +
            `Paste the posting and tailor the resume, then run: npm run apply ${name}\n` +
            `If it asks for a cover letter: npm run apply letter ${name}\n` +
            `If its form asks questions: npm run apply questions ${name}`
    );
}

/** Add files to an existing application, leaving any that are already there. */
function addFiles(name, files) {
    const dir = appDir(name);
    if (!fs.existsSync(dir))
        die(`No application "${name}". Start one with: npm run apply new ${name}`);
    const added = [];
    for (const [file, text] of files) {
        const target = path.join(dir, file);
        if (fs.existsSync(target)) {
            console.log(`${rel(target)} is already there, so it's left as it is.`);
            continue;
        }
        fs.writeFileSync(target, text, "utf8");
        added.push(file);
    }
    return added;
}

function addLetter(name) {
    const added = addFiles(name, [
        ["cover-letter.md", letterTemplate(name)],
        ["notes.md", notesTemplate(name)]
    ]);
    // One about-me.md for every application, started the first time.
    const aboutMe = path.join(APPS_DIR, "about-me.md");
    if (!fs.existsSync(aboutMe)) fs.writeFileSync(aboutMe, ABOUT_ME_TEMPLATE, "utf8");
    if (added.length) {
        console.log(
            `added ${added.join(" and ")}. Answer notes.md and write the letter, then run: npm run apply ${name}`
        );
    }
}

function addQuestions(name) {
    if (addFiles(name, [["answers.md", answersTemplate(name)]]).length) {
        console.log(
            `added answers.md. Put each question in a heading and answer under it, then check it with: npm run apply ${name}`
        );
    }
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

    // A letter only when the application has one, and only once it has paragraphs.
    const letterFile = path.join(dir, "cover-letter.md");
    if (fs.existsSync(letterFile)) {
        const letter = parseLetter(fs.readFileSync(letterFile, "utf8"), `${name}/cover-letter.md`);
        if (!letter.paragraphs.length) {
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
            if (pages > 1)
                problems.push(`The cover letter runs to ${pages} pages; keep it to one.`);
            for (const hit of letterTells(letter)) {
                console.log(`  note, paragraph ${hit.paragraph}: ${hit.reason}: "${hit.snippet}"`);
            }
        }
    }

    const answersFile = path.join(dir, "answers.md");
    if (fs.existsSync(answersFile)) {
        for (const hit of findMarkdownTells(fs.readFileSync(answersFile, "utf8"))) {
            console.log(`  note, answers.md line ${hit.line}: ${hit.reason}: "${hit.snippet}"`);
        }
    }

    if (problems.length) die(problems.join("\n"));
}

function list() {
    const names = applications();
    if (!names.length) {
        console.log("No applications yet. Start one with: npm run apply new <name>");
        return;
    }
    for (const name of names) {
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
    if (command === "letter" || command === "questions") {
        if (!name) die(`Usage: npm run apply ${command} <name>`);
        return command === "letter" ? addLetter(name) : addQuestions(name);
    }
    return build(command);
}

try {
    main();
} catch (error) {
    die(error.message);
}
