"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLetter, renderLetterTex, letterTells, formatLetterDate } = require("./letter.js");

// Cover letters are written by hand in Markdown. These pin how the file is
// read (front matter, paragraphs, comments) and what the .tex prints.

const letter = (front, body) => `---\n${front}\n---\n\n${body}`;

test("front matter and paragraphs are read, and comments aren't printed", () => {
    const parsed = parseLetter(
        letter(
            "company: Acme Robotics\nrole: Robotics Software Intern\ndate: 2026-10-21",
            "<!-- a note to myself -->\nFirst line\nof the first paragraph.\n\nSecond paragraph.\n"
        ),
        "test"
    );
    assert.equal(parsed.company, "Acme Robotics");
    assert.equal(parsed.role, "Robotics Software Intern");
    assert.equal(parsed.date, "October 21, 2026");
    assert.deepEqual(parsed.paragraphs, [
        "First line of the first paragraph.",
        "Second paragraph."
    ]);
    assert.equal(parsed.recipient, "Hiring Team");
    assert.equal(parsed.salutation, "Dear Hiring Manager,");
    assert.equal(parsed.closing, "Sincerely,");
});

test("a draft with no paragraphs yet is skipped, not an error", () => {
    const draft = parseLetter(letter('company: ""', "<!-- write here -->\n"), "test");
    assert.deepEqual(draft.paragraphs, []);
});

test("dates read the same quoted or not, and a bad one fails", () => {
    assert.equal(formatLetterDate("2026-03-01", "t"), "March 1, 2026");
    assert.equal(formatLetterDate(new Date("2026-03-01T00:00:00Z"), "t"), "March 1, 2026");
    assert.throws(() => formatLetterDate("March 1", "t"), /date is YYYY-MM-DD/);
});

test("mistakes fail with what to fix", () => {
    const fails = (source, pattern) => assert.throws(() => parseLetter(source, "test"), pattern);
    fails(letter('company: ""', "Hi."), /fill in company/);
    fails(letter("company: Acme\ncompnay: Acme", "Hi."), /unknown key "compnay"/);
    fails(letter('company: Acme\nrole: ""', "Hi."), /"role" must be text/);
    fails("No front matter here.", /start with front matter/);
});

test("the .tex uses the compact heading and escapes the text", () => {
    const parsed = parseLetter(
        letter("company: R&D Labs\nrole: Intern", "I cut costs by 40% at work."),
        "test"
    );
    const tex = renderLetterTex(parsed, {
        source: "x/cover-letter.md",
        regenerate: "npm run apply x"
    });
    assert.ok(tex.includes("\\def\\resumeCompact{}"));
    assert.ok(tex.includes("\\input{_heading}"));
    assert.ok(tex.includes("R\\&D Labs"));
    assert.ok(tex.includes("Re: Intern"));
    assert.ok(tex.includes("40\\% at work."));
    assert.ok(tex.trimEnd().endsWith("Tyler Flar\n\\end{document}"));
});

test("pasted typography is handled, and the voice lint's tells come back as notes", () => {
    const parsed = parseLetter(
        letter("company: Acme", "I\u00a0waited… and then — honestly — it worked."),
        "test"
    );
    assert.equal(parsed.paragraphs[0].startsWith("I waited..."), true);
    assert.ok(letterTells(parsed).length >= 1);
});
