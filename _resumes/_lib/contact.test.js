"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadContact, validateContact, contactTexLines } = require("./contact.js");
const { renderLetterTex } = require("./letter.js");
const { renderResumeTex } = require("./render-tex.js");

// The phone number is on every resume that goes out, but this repo is public,
// so it comes from the gitignored applications/contact.yaml and no tracked
// file holds it. The numbers below are reserved for fiction (555-01xx).

const RESUMES = path.join(__dirname, "..");
const variant = (compactHeading) => ({
    name: "test",
    source: "test.yaml",
    regenerate: "npm run apply test",
    fontSize: "11pt",
    compactHeading,
    sections: []
});

test("no tracked .tex file carries a phone number", () => {
    for (const file of ["_heading.tex", "_preamble.tex", "_cv.tex"]) {
        const tex = fs.readFileSync(path.join(RESUMES, file), "utf8");
        assert.doesNotMatch(tex, /\(\d{3}\)\s?\d{3}-\d{4}/, `${file} prints a phone number`);
        assert.doesNotMatch(tex, /tel:\+?\d/, `${file} links a phone number`);
    }
});

test("the phone prints as written and dials as a US number", () => {
    assert.deepEqual(contactTexLines({ phone: "(555) 010-0199" }), [
        "\\def\\resumePhone{(555) 010-0199}",
        "\\def\\resumePhoneTel{+15550100199}"
    ]);
    assert.deepEqual(contactTexLines({ phone: "+44 20 7946 0958" }), [
        "\\def\\resumePhone{+44 20 7946 0958}",
        "\\def\\resumePhoneTel{+442079460958}"
    ]);
    assert.deepEqual(contactTexLines(null), []);
});

test("a resume's one-line heading gets the phone, and the CV's heading never does", () => {
    const contact = { phone: "(555) 010-0199" };
    const compact = renderResumeTex(variant(true), { contact });
    assert.ok(compact.includes("\\def\\resumeCompact{}\n\\def\\resumePhone{(555) 010-0199}"));
    assert.ok(!renderResumeTex(variant(true)).includes("\\resumePhone"), "no contact.yaml");
    assert.ok(!renderResumeTex(variant(false), { contact }).includes("\\resumePhone"));
});

test("a cover letter's heading gets the phone too", () => {
    const letter = {
        company: "Acme",
        recipient: "Hiring Team",
        salutation: "Dear Hiring Manager,",
        closing: "Sincerely,",
        date: "November 9, 2026",
        paragraphs: ["Hello."]
    };
    const options = { source: "cover-letter.md", regenerate: "npm run apply acme" };
    const contact = { phone: "(555) 010-0199" };
    assert.ok(renderLetterTex(letter, { ...options, contact }).includes("\\def\\resumePhoneTel"));
    assert.ok(!renderLetterTex(letter, options).includes("\\resumePhone"));
});

test("contact.yaml is optional, and a bad one says what to write", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "contact-"));
    try {
        assert.equal(loadContact(path.join(dir, "missing.yaml")), null);
        const file = path.join(dir, "contact.yaml");
        fs.writeFileSync(file, 'phone: "(555) 010-0199"\n');
        assert.deepEqual(loadContact(file), { phone: "(555) 010-0199" });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    assert.throws(() => validateContact({ phone: "555" }), /at least ten digits/);
    assert.throws(() => validateContact({ phone: 5550100199 }), /must be text/);
    assert.throws(() => validateContact({ email: "a@b.c" }), /unknown key "email"/);
    assert.throws(() => validateContact([]), /expected "phone: \.\.\."/);
});
