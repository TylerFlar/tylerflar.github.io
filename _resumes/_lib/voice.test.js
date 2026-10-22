"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { findTells, bulletProblems, proseFromMarkdown, findMarkdownTells } = require("./voice.js");
const { loadMaster, loadProfile } = require("./load.js");

// Every surface a reader sees is held to the voice lint: the CV's text, the
// about-me text, and every project page. A failure lists each hit
// with where it is, what it is, and the words around it.

const ROOT = path.join(__dirname, "..", "..");
const PAGE_DIRS = ["projects"].map((dir) => path.join(ROOT, "src", "content", dir));

const report = (hits) =>
    hits.map((hit) => `  ${hit.where}: ${hit.reason} | "${hit.snippet}"`).join("\n");

test("long dashes are tells, except an en dash between numbers", () => {
    assert.equal(findTells("a cue — when vision fails").length, 1);
    assert.equal(findTells("a cue – when vision fails").length, 1);
    assert.equal(findTells("deletes 2–6 bars across MIDI 21–108").length, 0);
});

test("the banned words fire, and their legitimate neighbours don't", () => {
    for (const text of [
        "an honest finding",
        "Honestly, it worked",
        "a dependable platform",
        "genuinely useful",
        "crucially, the gate",
        "the load-bearing part",
        "a nuanced result",
        "a clear-eyed analysis",
        "we delve into",
        "leveraging MCP",
        "utilized the GPU",
        "seamlessly integrated",
        "a cutting-edge model",
        "an innovative design",
        "a game-changer",
        "spearheaded the effort",
        "passionate about robots",
        "thrilled to share",
        "it's worth noting that",
        "not only fast but also small",
        "in today’s world"
    ]) {
        assert.equal(findTells(text).length, 1, `expected one tell in "${text}"`);
    }
    for (const text of [
        "robust human following",
        "joker synergies",
        "a genuine failure",
        "a crucial step",
        "not only that"
    ]) {
        assert.equal(findTells(text).length, 0, `expected no tell in "${text}"`);
    }
});

test("a bullet is one sentence of at most 220 characters, as the CV prints it", () => {
    assert.deepEqual(bulletProblems("Built a thing.", "x"), []);
    // Measured as printed: the closing period the CV adds counts.
    assert.deepEqual(bulletProblems("x".repeat(219), "x"), []);
    assert.match(bulletProblems("x".repeat(220), "x")[0], /221 characters/);
    assert.match(bulletProblems("Built a thing; then another.", "x")[0], /a semicolon/);
    // A link counts only its text, as on the CV.
    const linked = `Built [a thing](https://example.com/${"long/".repeat(60)}).`;
    assert.deepEqual(bulletProblems(linked, "x"), []);
});

test("only prose is linted in markdown, and line numbers survive", () => {
    const page = [
        "---",
        'summary: "front matter — skipped here"',
        "---",
        "Some prose.",
        "```python",
        "x = 1  # a comment — in code",
        "```",
        "Inline `code — here` and $a — b$ math, and [a link](https://x.y/—).",
        "$$",
        "y — z",
        "$$",
        "A real tell — here."
    ].join("\n");
    const prose = proseFromMarkdown(page);
    assert.equal(prose.split("\n").length, page.split("\n").length);
    assert.deepEqual(
        findMarkdownTells(page).map((hit) => hit.line),
        [12]
    );
    assert.match(prose, /\[a link\]/);
});

test("master.yaml reads plainly: bullets, notes, taglines, the research line", () => {
    const master = loadMaster();
    const hits = [];
    const check = (text, where, isBullet) => {
        for (const hit of findTells(text)) hits.push({ where, ...hit });
        if (!isBullet) return;
        for (const reason of bulletProblems(text, where)) {
            hits.push({ where, reason, snippet: text.slice(0, 60) });
        }
    };
    const groups = [
        ["role", master.roles],
        ["project", master.projects],
        ["volunteer", master.volunteering]
    ];
    for (const [kind, entries] of groups) {
        for (const entry of entries) {
            if (entry.tagline) check(entry.tagline, `${kind} ${entry.id} tagline`);
            for (const bullet of entry.bullets || []) {
                check(bullet.text, `${kind} ${entry.id}/${bullet.id}`, true);
            }
            for (const sub of entry.subprojects || []) {
                for (const bullet of sub.bullets || []) {
                    check(bullet.text, `${kind} ${entry.id}/${sub.id}/${bullet.id}`, true);
                }
            }
        }
    }
    for (const pub of master.publications) {
        if (pub.note) check(pub.note, `publication ${pub.id} note`, true);
    }
    if (master.researchInterests) check(master.researchInterests, "researchInterests");
    assert.equal(hits.length, 0, `master.yaml has ${hits.length} tells:\n${report(hits)}`);
});

test("profile.yaml reads plainly", () => {
    const hits = [];
    for (const [key, text] of Object.entries(loadProfile())) {
        for (const hit of findTells(text)) hits.push({ where: key, ...hit });
    }
    assert.equal(hits.length, 0, `profile.yaml has ${hits.length} tells:\n${report(hits)}`);
});

for (const dir of PAGE_DIRS) {
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".md"))) {
        const name = `${path.basename(dir)}/${file}`;
        test(`${name} reads plainly`, () => {
            const text = fs.readFileSync(path.join(dir, file), "utf8");
            const hits = findMarkdownTells(text).map((hit) => ({
                where: `line ${hit.line}`,
                ...hit
            }));
            const front = yaml.load(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)[1]);
            for (const key of ["summary", "role"]) {
                if (typeof front[key] !== "string") continue;
                for (const hit of findTells(front[key])) hits.push({ where: key, ...hit });
            }
            assert.equal(hits.length, 0, `${name} has ${hits.length} tells:\n${report(hits)}`);
        });
    }
}
