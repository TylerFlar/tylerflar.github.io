"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { readFill } = require("./pdflatex.js");
const { fillNote, overNote } = require("./fill.js");

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

test("an overrun rounds up, since a cut has to clear all of it", () => {
    assert.equal(overNote(190.5, 12), "about 16 lines too long");
    assert.equal(overNote(2, 12), "about 1 line too long");
});
