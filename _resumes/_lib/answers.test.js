"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { answerLengths, questionLabel } = require("./answers.js");

// answers.md builds into nothing, but a form can cap how long an answer is.
// These pin how a limit is read from a question's heading and how the answer
// to paste is counted.

test("the first blockquote under a heading with a limit is the answer, counted as pasted", () => {
    const markdown = [
        "# Application questions",
        "",
        "## Why this job? (3000 characters)",
        "",
        "> First paragraph,",
        "> wrapped.",
        ">",
        "> Second.",
        "",
        "A note that isn't counted.",
        "",
        "> Another blockquote, also not counted."
    ].join("\n");
    assert.deepEqual(answerLengths(markdown), [
        {
            question: "Why this job? (3000 characters)",
            limit: 3000,
            line: 3,
            length: "First paragraph, wrapped.\n\nSecond.".length
        }
    ]);
});

test("a limit reads with commas or in other words, and a heading without one is skipped", () => {
    const markdown = [
        "## A (2,000 characters)",
        "> a",
        "## B (500 character limit)",
        "> bb",
        "## C",
        "> ccc",
        "## D, 80 chars at most",
        "> dddd"
    ].join("\n");
    const found = answerLengths(markdown).map(({ limit, length }) => [limit, length]);
    assert.deepEqual(found, [
        [2000, 1],
        [500, 2],
        [80, 4]
    ]);
});

test("a heading with a limit and no blockquote has no answer to count", () => {
    const [answer] = answerLengths("## Notes for an instructor (2000 characters)\n\nBlank.\n");
    assert.equal(answer.length, null);
});

test("each line of a list in the answer is one line break", () => {
    const [answer] = answerLengths(
        "## Experience (100 characters)\n\n> Two:\n>\n> - one\n> - two\n"
    );
    assert.equal(answer.length, "Two:\n\n- one\n- two".length);
});

test("a comment isn't counted, and line numbers stay the file's", () => {
    const markdown = "<!--\na note\n-->\n\n## Q (50 characters)\n> <!-- not this -->Yes\n";
    assert.deepEqual(answerLengths(markdown), [
        { question: "Q (50 characters)", limit: 50, line: 5, length: 3 }
    ]);
});

test("Windows line endings count the same", () => {
    const [answer] = answerLengths("## Q (50 characters)\r\n> One\r\n>\r\n> Two\r\n");
    assert.equal(answer.length, "One\n\nTwo".length);
});

test("questionLabel drops the limit and shortens a long question at a word", () => {
    assert.equal(questionLabel("Why CSE? (3000 characters)"), "Why CSE?");
    assert.equal(
        questionLabel(
            "Please describe any prior teaching or tutoring experience at all. (2000 characters)"
        ),
        "Please describe any prior teaching or tutoring experience..."
    );
});
