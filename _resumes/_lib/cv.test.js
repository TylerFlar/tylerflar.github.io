"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadMaster, resolveCv } = require("./load.js");
const { renderVariantTex } = require("./render-tex.js");

// The deploy compiles the committed _resumes/_cv.tex, not master.yaml, so an
// edit to master.yaml that skips the regenerate step would leave /cv.pdf stale
// while the website moved on. This catches it before a push.

const CV_TEX = path.join(__dirname, "..", "_cv.tex");

test("the committed _cv.tex matches master.yaml", () => {
    const committed = fs.readFileSync(CV_TEX, "utf8").replace(/\r\n/g, "\n");
    const fresh = renderVariantTex(resolveCv(loadMaster()));
    if (committed === fresh) return;
    const was = committed.split("\n");
    const now = fresh.split("\n");
    const line = now.findIndex((text, i) => text !== was[i]);
    assert.fail(
        `_resumes/_cv.tex is stale (first difference at line ${line + 1}). ` +
            "Run: node _resumes/_generate.js _cv, then commit _cv.tex."
    );
});

test("the CV header names its real source and the safe regenerate command", () => {
    const tex = renderVariantTex(resolveCv(loadMaster()));
    const [first, second] = tex.split("\n");
    assert.equal(first, "% AUTO-GENERATED from _resumes/data/master.yaml -- do not edit.");
    assert.equal(
        second,
        "% Edit _resumes/data/master.yaml, then run: node _resumes/_generate.js _cv"
    );
});
