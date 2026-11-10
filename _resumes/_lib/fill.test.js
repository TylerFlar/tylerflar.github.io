"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { readFill, readPages } = require("./pdflatex.js");
const { fillNote, overNote, shortPageNotes } = require("./fill.js");

// The build says how full a page came out: the preamble writes a line to the
// log at the end of the document, pdflatex.js reads it, and fill.js puts it in
// words. These pin the line's format on both sides and the wording, without
// running pdflatex, which CI's test job doesn't have.

const line = (used, shrink, goal) =>
    `RESUMEFILL used=${used}pt shrink=${shrink}pt goal=${goal}pt small=12.0pt normal=13.6pt`;

test("the preamble writes the fill line that readFill reads", () => {
    const preamble = fs.readFileSync(path.join(__dirname, "..", "_preamble.tex"), "utf8");
    const typeout = /\\typeout\{RESUMEFILL([\s\S]*?)\}%/.exec(preamble);
    assert.ok(typeout, "_preamble.tex should \\typeout the RESUMEFILL line");
    const keys = [...typeout[1].matchAll(/(\w+)=/g)].map((match) => match[1]);
    assert.deepEqual(keys, ["used", "shrink", "goal", "small", "normal"]);
    assert.match(preamble, /\\ifdefined\\resumeMeasure/);
});

test("the fill is the text's height with its spacing shrunk, against the page's", () => {
    const fill = readFill(`Some log\n${line("763.34375", "49.7", "722.7")}\nOutput written`);
    assert.equal(fill.goal, 722.7);
    assert.equal(fill.small, 12);
    assert.equal(fill.normal, 13.6);
    assert.ok(Math.abs(fill.need - 713.64375) < 1e-9);
});

test("a fill line TeX wrapped in the log still reads", () => {
    const wrapped = line("100.0", "4.0", "722.7").replace("normal=", "normal=\r\n");
    assert.equal(readFill(wrapped).normal, 13.6);
});

test("an empty last page has no goal, and a log without the line has no fill", () => {
    assert.equal(readFill(line("0.0", "0.0", "16383.99998")).goal, null);
    assert.equal(readFill("Output written on cv.pdf (1 page, 1234 bytes)."), null);
});

test("room left on the last page is counted in whole lines", () => {
    const fill = { need: 686.2, goal: 722.7 };
    assert.equal(fillNote(1, fill, 12), "1 page, about 3 lines free");
    assert.equal(fillNote(1, { need: 713.6, goal: 722.7 }, 12), "1 page, less than a line free");
    assert.equal(fillNote(1, { need: 709, goal: 722.7 }, 12), "1 page, about 1 line free");
    assert.equal(
        fillNote(6, { need: 60, goal: 722.7 }, 12),
        "6 pages, about 55 lines free on the last"
    );
});

test("without a fill the note is just the page count", () => {
    assert.equal(fillNote(2, null, 12), "2 pages");
    assert.equal(fillNote(1, { need: 0, goal: null }, 12), "1 page");
    assert.equal(fillNote(null, null), "? pages");
});

test("the preamble writes a line for every page, which readPages reads", () => {
    const preamble = fs.readFileSync(path.join(__dirname, "..", "_preamble.tex"), "utf8");
    const typeout = /\\typeout\{RESUMEPAGE([\s\S]*?)\}%/.exec(preamble);
    assert.ok(typeout, "_preamble.tex should \\typeout a RESUMEPAGE line as each page ships");
    const keys = [...typeout[1].matchAll(/(\w+)=/g)].map((match) => match[1]);
    assert.deepEqual(keys, ["page", "used", "goal"]);
    const log = [
        "RESUMEPAGE page=1 used=654.1pt goal=722.7pt",
        "[1{psfonts.map}]",
        "RESUMEPAGE page=2 used=700.25pt goal=722.7pt"
    ].join("\n");
    assert.deepEqual(readPages(log), [
        { page: 1, used: 654.1, goal: 722.7 },
        { page: 2, used: 700.25, goal: 722.7 }
    ]);
    assert.deepEqual(readPages("Output written on cv.pdf (1 page)."), []);
});

test("an entry stays in one piece, so no break point is left inside one", () => {
    const preamble = fs.readFileSync(path.join(__dirname, "..", "_preamble.tex"), "utf8");
    // A bullet's last line can't be followed by a break: the \nopagebreak sits
    // ahead of the glue, where a penalty placed after it would come too late.
    assert.match(preamble, /\\item\\small\{#1\}\\nopagebreak\\vspace\{-2pt\}/);
    // The end of a bullet list isn't a break either, so a subproject's heading
    // stays under its role's own bullets.
    assert.match(preamble, /beginpenalty=10000, midpenalty=10000, endpenalty=10000/);
    assert.match(preamble, /\\interlinepenalty=10000/);
});

test("a page before the last that ends short gets a note", () => {
    const fills = [
        { page: 1, used: 654.1, goal: 722.7 },
        { page: 2, used: 300, goal: 722.7 }
    ];
    assert.deepEqual(shortPageNotes(fills, 12), [
        "page 1 ends about 5 lines short: the next entry didn't fit, so it starts page 2"
    ]);
    // The last page is the fill line's business, and a full page gets no note.
    assert.deepEqual(shortPageNotes([{ page: 1, used: 300, goal: 722.7 }], 12), []);
    assert.deepEqual(
        shortPageNotes(
            [
                { page: 1, used: 718, goal: 722.7 },
                { page: 2, used: 300, goal: 722.7 }
            ],
            12
        ),
        []
    );
    assert.deepEqual(shortPageNotes(fills, undefined), []);
});

test("an overrun rounds up, since a cut has to clear all of it", () => {
    assert.equal(overNote(190.5, 12), "about 16 lines too long");
    assert.equal(overNote(2, 12), "about 1 line too long");
});
