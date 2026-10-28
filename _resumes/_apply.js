"use strict";

/**
 * Applications: one folder per job. Most only need a resume, so that's what a
 * new one starts with. A cover letter and answers to the form's questions are
 * added when an application asks for them.
 *
 *   npm run apply new <name> [from]   start _resumes/applications/<name>/ with
 *                                     resume.yaml (every entry in master.yaml,
 *                                     or a copy of application [from]'s) and
 *                                     posting.md
 *   npm run apply letter <name>       add cover-letter.md and notes.md to it
 *   npm run apply questions <name>    add answers.md, for the form's questions,
 *                                     read from Greenhouse when posting.md links
 *                                     a Greenhouse job
 *   npm run apply <name>              build tyler-flar-resume.pdf, and
 *                                     tyler-flar-cover-letter.pdf once the letter
 *                                     has paragraphs
 *   npm run apply sent <name> [date]  mark it sent, so a later build can't
 *                                     replace the PDFs that went out
 *   npm run apply                     list your applications
 *
 * resume.yaml uses the resume spec format (_lib/resume.js). Each bullet,
 * tagline or note it rewords prints as a word diff against the CV's wording
 * every build, for you to check, and so does how full the page came out
 * (_lib/fill.js) and which of the CV's skills the posting names that the
 * resume leaves off (_lib/posting.js). The cover letter format is in
 * _lib/letter.js. A cover letter isn't the resume again: it's written from
 * notes.md (your answers for this job) and about-me.md (the ones that carry
 * over between jobs, shared by every application). answers.md builds into
 * nothing, since its answers get pasted into the form, but the build prints
 * the voice lint's tells in it as notes, like the letter's, and each answer's
 * length against its question's character limit, failing one that's over
 * (_lib/answers.js).
 *
 * A build uses the CV as it is today, so once an application is sent, its
 * posting.md gets a "Sent:" line and the build leaves its PDFs alone.
 *
 * The folder is gitignored: it shows where you're applying, and this repo is
 * public.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadMaster } = require("./_lib/load.js");
const { resolveResume, scaffoldResume } = require("./_lib/resume.js");
const { loadCvSpec, belowStandard, resolvePublicCv } = require("./_lib/cv.js");
const { standardProblems, fillProblem, rolesOf } = require("./_lib/standard.js");
const { renderResumeTex } = require("./_lib/render-tex.js");
const { parseLetter, renderLetterTex, letterTells } = require("./_lib/letter.js");
const { findMarkdownTells } = require("./_lib/voice.js");
const { answerLengths, questionLabel } = require("./_lib/answers.js");
const { compileTex, measureOverrun } = require("./_lib/pdflatex.js");
const { fillNote, overNote } = require("./_lib/fill.js");
const { postingCoverage } = require("./_lib/posting.js");
const { parseGreenhouseLink, fetchGreenhouseJob, answersFromJob } = require("./_lib/greenhouse.js");
const { wordDiff } = require("./_lib/word-diff.js");

const APPS_DIR = path.join(__dirname, "applications");
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const COMMANDS = ["new", "letter", "questions", "sent"];
// posting.md's "Sent: 2026-10-24" line, which `npm run apply sent` adds.
const SENT = /^Sent:[ \t]*(\S.*)$/m;
const RESUME_PDF = "tyler-flar-resume";
const LETTER_PDF = "tyler-flar-cover-letter";

const rel = (file) => path.relative(process.cwd(), file);
// Today as YYYY-MM-DD, in local time.
const today = () => new Date().toLocaleDateString("en-CA");

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
List each question word for word, with its options or limit if it has them,
and the answer after its colon, in your own words. A question that wants a
paragraph or more gets its own heading, with the answer under it. When it has
a character limit, put the limit in the heading, like "(2000 characters)", and
the answer to paste in a blockquote under it: the build counts the blockquote
against the limit and fails one that's over. The facts every form asks for are
in ../about-me.md under Form answers. Draw on the CV and the project pages for
the rest, and put an answer that would fit other applications in about-me.md
too.
-->

## Answers

- The question, word for word ✱ (✱ if it's required):
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

/**
 * resume.yaml for a new application: every entry in master.yaml but what
 * cv.yaml holds below the standard, or a copy of application [from]'s.
 */
function resumeSpecFor(name, from) {
    if (!from) return scaffoldResume(loadMaster(), name, { below: belowStandard(loadCvSpec()) });
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
            `If its form asks questions: npm run apply questions ${name}\n` +
            `Once it's sent: npm run apply sent ${name}`
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

/** The job's link from posting.md's "Link:" line, if it has one. */
function postingLink(dir) {
    const file = path.join(dir, "posting.md");
    if (!fs.existsSync(file)) return null;
    return /^Link:[ \t]*(https?:\/\/\S+)/m.exec(fs.readFileSync(file, "utf8"))?.[1] ?? null;
}

/**
 * answers.md, with the form's questions already in it when posting.md links a
 * Greenhouse job, and the blank template otherwise or if Greenhouse can't be
 * reached.
 */
async function addQuestions(name) {
    const dir = appDir(name);
    let text = answersTemplate(name);
    let from = "";
    const link = postingLink(dir);
    const job = link && parseGreenhouseLink(link);
    if (job && !fs.existsSync(path.join(dir, "answers.md"))) {
        try {
            text = answersFromJob(await fetchGreenhouseJob(job), { link, date: today() });
            from = " with the form's questions from Greenhouse";
        } catch (error) {
            console.log(`Couldn't read the form from Greenhouse (${error.message}).`);
        }
    }
    if (addFiles(name, [["answers.md", text]]).length) {
        console.log(
            `added answers.md${from}. Answer each question after its colon, then check it with: npm run apply ${name}`
        );
    }
}

/** When an application went out, from its posting.md, or null. */
function sentDate(dir) {
    const file = path.join(dir, "posting.md");
    if (!fs.existsSync(file)) return null;
    return SENT.exec(fs.readFileSync(file, "utf8"))?.[1].trim() ?? null;
}

/**
 * Mark an application sent: a "Sent:" line under posting.md's Link: line (or
 * its title), so a later build won't replace its PDFs with the CV as it is then.
 */
function markSent(name, date = today()) {
    const dir = appDir(name);
    if (!fs.existsSync(dir))
        die(`No application "${name}". Start one with: npm run apply new ${name}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`Give the date as YYYY-MM-DD, like ${today()}.`);
    const already = sentDate(dir);
    if (already) {
        console.log(`${name} is already marked sent, on ${already}.`);
        return;
    }
    const file = path.join(dir, "posting.md");
    const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : POSTING_TEMPLATE;
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const link = lines.findIndex((line) => line.startsWith("Link:"));
    const at = link >= 0 ? link : lines.findIndex((line) => line.startsWith("# "));
    lines.splice(at + 1, 0, `Sent: ${date}`);
    fs.writeFileSync(file, lines.join(eol), "utf8");
    console.log(
        `marked ${name} sent on ${date}. A build leaves its PDFs alone now. To rebuild them anyway, take the Sent: line out of its posting.md.`
    );
}

const pageLabel = (pages) => `${pages ?? "?"} page${pages === 1 ? "" : "s"}`;

/**
 * Compile a document held to `maxPages` and say how full it came out: the room
 * left on its last page, or, past the limit, how many lines of `size` text
 * ("small" for a resume's bullets, "normal" for a letter) have to come out, from
 * a second run on one tall page. Returns the page count and that overrun.
 */
function compileFitted({ tex, dir, base, maxPages, size }) {
    const { pdf, pages, fill } = compileTex({ tex, outDir: dir, base, keepTex: false });
    const line = fill?.[size];
    const over = maxPages && pages > maxPages;
    console.log(`wrote ${rel(pdf)} (${over ? pageLabel(pages) : fillNote(pages, fill, line)})`);
    if (!over || !fill?.goal) return { pages, fill, overrun: null };
    const points = measureOverrun({ tex, outDir: dir, base, maxPages, goal: fill.goal });
    return { pages, fill, overrun: points > 0 ? overNote(points, line) : null };
}

/** Which of the CV's skills posting.md names, and the ones the resume leaves off, by skill group. */
function printCoverage(dir, resume, master) {
    const postingFile = path.join(dir, "posting.md");
    if (!fs.existsSync(postingFile)) return;
    const named = postingCoverage(fs.readFileSync(postingFile, "utf8"), resume, master.skills);
    if (!named.length) return;
    const terms = (entries) => entries.map((entry) => entry.term).join(", ");
    const on = named.filter((entry) => entry.onResume);
    const off = named.filter((entry) => !entry.onResume);
    const count = `posting names ${named.length} of the CV's skills`;
    if (!off.length) {
        console.log(`  ${count}, all on this resume: ${terms(on)}`);
        return;
    }
    console.log(`  ${count}, ${on.length} on this resume${on.length ? `: ${terms(on)}` : ""}`);
    const where = off.map((entry) => `${entry.term} (skills: ${entry.group})`);
    console.log(`  not on this resume: ${where.join(", ")}`);
}

function build(name) {
    const dir = appDir(name);
    if (!fs.existsSync(dir))
        die(`No application "${name}". Start one with: npm run apply new ${name}`);
    const sent = sentDate(dir);
    if (sent) {
        die(
            `${name} was sent on ${sent}, so its PDFs are the ones that went out, and a build ` +
                "would replace them with today's CV. To rebuild them anyway, take the Sent: line " +
                "out of its posting.md."
        );
    }
    const problems = [];

    const specFile = path.join(dir, "resume.yaml");
    if (fs.existsSync(specFile)) {
        const master = loadMaster();
        const resume = resolveResume(yaml.load(fs.readFileSync(specFile, "utf8")), master, name);
        // A resume is held to the CV's standard (_lib/standard.js), one page by default.
        const maxPages = resume.maxPages ?? 1;
        const { pages, fill, overrun } = compileFitted({
            tex: renderResumeTex(resume),
            dir,
            base: RESUME_PDF,
            maxPages,
            size: "small"
        });
        for (const change of resume.rewordings) {
            console.log(`  reworded ${change.where}: ${wordDiff(change.cv, change.text)}`);
        }
        printCoverage(dir, resume, master);
        if (pages > maxPages) {
            const over = pages - maxPages;
            problems.push(
                `The resume is over by ${over} page${over === 1 ? "" : "s"} (maxPages: ${maxPages})` +
                    `${overrun ? `, ${overrun}` : ""}. Cut a bullet or an entry.`
            );
        }
        const cvSpec = loadCvSpec();
        const below = belowStandard(cvSpec);
        const roles = rolesOf(resolvePublicCv(master, cvSpec));
        for (const problem of standardProblems({ ...resume, maxPages }, { below, roles })) {
            problems.push(`The resume ${problem}.`);
        }
        const unfilled = fillProblem({ pages, fill, maxPages, what: "The resume" });
        if (unfilled) problems.push(unfilled);
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
            const { pages, overrun } = compileFitted({
                tex: renderLetterTex(letter, {
                    source: `_resumes/applications/${name}/cover-letter.md`,
                    regenerate: `npm run apply ${name}`
                }),
                dir,
                base: LETTER_PDF,
                maxPages: 1,
                size: "normal"
            });
            if (pages > 1) {
                problems.push(
                    `The cover letter runs to ${pages} pages${overrun ? `, ${overrun}` : ""}; keep it to one.`
                );
            }
            for (const hit of letterTells(letter)) {
                console.log(`  note, paragraph ${hit.paragraph}: ${hit.reason}: "${hit.snippet}"`);
            }
        }
    }

    const answersFile = path.join(dir, "answers.md");
    if (fs.existsSync(answersFile)) {
        const answers = fs.readFileSync(answersFile, "utf8");
        for (const hit of findMarkdownTells(answers)) {
            console.log(`  note, answers.md line ${hit.line}: ${hit.reason}: "${hit.snippet}"`);
        }
        const count = (n) => n.toLocaleString("en-US");
        for (const answer of answerLengths(answers)) {
            const where = `answers.md line ${answer.line}`;
            const question = questionLabel(answer.question);
            if (answer.length === null) {
                console.log(`  ${where}: no blockquote under "${question}", so it's blank`);
            } else if (answer.length > answer.limit) {
                problems.push(
                    `${where}: the answer to "${question}" is ${count(answer.length)} characters, ` +
                        `${count(answer.length - answer.limit)} over its limit of ${count(answer.limit)}.`
                );
            } else {
                console.log(
                    `  ${where}: ${count(answer.length)} of ${count(answer.limit)} characters, "${question}"`
                );
            }
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
        const sent = sentDate(path.join(APPS_DIR, name));
        const notes = [sent && `sent ${sent}`, built.length && `built: ${built.join(", ")}`];
        const shown = notes.filter(Boolean);
        console.log(`${name}${shown.length ? `  (${shown.join("; ")})` : ""}`);
    }
}

async function main() {
    const [command, name, extra] = process.argv.slice(2);
    if (!command) return list();
    if (command === "new") return newApplication(name, extra);
    if (["letter", "questions", "sent"].includes(command)) {
        if (!name)
            die(`Usage: npm run apply ${command} <name>${command === "sent" ? " [date]" : ""}`);
        if (command === "letter") return addLetter(name);
        if (command === "questions") return addQuestions(name);
        return markSent(name, extra);
    }
    return build(command);
}

main().catch((error) => die(error.message));
