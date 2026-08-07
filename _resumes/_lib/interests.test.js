"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadInterests, resolveInterestIds, MAX_INTERESTS } = require("./load.js");
const { renderTex } = require("./markup.js");

// The interests row is the one part of the resume library rewritten unattended
// by a Tasque sync run, so these tests are the contract that run has to clear:
// picks come from the bank, labels survive LaTeX, emoji stay off the CV.

test("interests.yaml loads and every pick resolves against the bank", () => {
    const { selected, index } = loadInterests();
    assert.ok(selected.length > 0, "expected at least one selected interest");
    assert.ok(selected.length <= MAX_INTERESTS);
    for (const item of selected) {
        assert.equal(index.get(item.id), item);
    }
});

test("bank ids are unique, kebab-case, and complete", () => {
    const { groups, index } = loadInterests();
    const flat = groups.flatMap((group) => group.items);
    assert.equal(flat.length, index.size, "duplicate ids collapse the index");
    for (const item of flat) {
        assert.match(item.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id "${item.id}"`);
        assert.ok(item.label.trim(), `${item.id} needs a label`);
        assert.ok(item.emoji.trim(), `${item.id} needs an emoji`);
    }
});

test("every bank label is CV-renderable ASCII prose", () => {
    for (const group of loadInterests().groups) {
        for (const item of group.items) {
            // No throw, and nothing escaped away: these go on the CV verbatim.
            assert.equal(renderTex(item.label, item.id), item.label);
        }
    }
});

test("emoji are real emoji, not stand-in text", () => {
    for (const group of loadInterests().groups) {
        for (const item of group.items) {
            assert.ok(
                [...item.emoji].some((ch) => ch.codePointAt(0) > 0x2000),
                `${item.id}: "${item.emoji}" does not look like an emoji`
            );
        }
    }
});

test("a pick outside the bank is rejected, and the error hands back the bank", () => {
    const interests = loadInterests();
    assert.ok(!interests.index.has("competitive-sous-vide"), "fixture id must not be in the bank");
    assert.throws(
        () => resolveInterestIds(["competitive-sous-vide"], interests, "test"),
        (err) => err.message.includes("not in the bank") && err.message.includes("cooking")
    );
});

test("duplicates and over-long selections are rejected", () => {
    const interests = loadInterests();
    assert.throws(
        () => resolveInterestIds(["cooking", "cooking"], interests, "test"),
        /duplicate interest "cooking"/
    );
    const tooMany = [...interests.index.keys()].slice(0, MAX_INTERESTS + 1);
    assert.throws(() => resolveInterestIds(tooMany, interests, "test"), /keep it to/);
});
