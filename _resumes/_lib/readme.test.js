"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { STANDARD } = require("./standard.js");
const {
    HOURS_BY_KIND,
    CAREER_SHARE,
    QUARTERS,
    HEADS_UP_MONTHS,
    PAPER_FTE
} = require("./budget.js");
const { BULLET_MAX } = require("./voice.js");
const { PROFILE_LIMITS, MAX_INTERESTS } = require("./load.js");

// The README says the rules in words, and the code holds them. These hold the
// README's numbers to the code's, so a rule that changes can't leave the
// README behind. The skills point at the README for these lists, so it's the
// one place they're written out.

const readme = fs.readFileSync(path.join(__dirname, "..", "..", "README.md"), "utf8");
const says = (text, what) =>
    assert.ok(readme.includes(text), `README.md should say ${what}: "${text}"`);
const thousands = (count) => count.toLocaleString("en-US");

test("the README's standard is the code's", () => {
    says(`- ${STANDARD.fontSize};`, "the font size");
    says(`- at most ${STANDARD.maxCourses} courses;`, "the course limit");
    says(
        `- at most ${STANDARD.maxSkillsPerGroup} skills in a group and ${STANDARD.maxSkillsPerPage} a page;`,
        "the skill limits"
    );
    says(
        `- full pages, with at most ${STANDARD.maxFreeLines} lines free on the last one.`,
        "how full the last page has to be"
    );
    says(
        `The CV also keeps at least ${STANDARD.cvMinFreeLines} lines free`,
        "the CV's margin for the deploy's TeX"
    );
});

test("the README's bullet budget is the code's", () => {
    says(
        `The week is ${HOURS_BY_KIND.industry} hours for industry roles, ${HOURS_BY_KIND.research} for research, ` +
            `${HOURS_BY_KIND.teaching} for teaching and volunteering, and ${HOURS_BY_KIND.project} for a project`,
        "each kind of work's typical week"
    );
    assert.equal(
        HOURS_BY_KIND.volunteer,
        HOURS_BY_KIND.teaching,
        "the README gives them one number"
    );
    says(
        `Under 1/${CAREER_SHARE} of the career earns 1 bullet, 1/${CAREER_SHARE} earns 2`,
        "the share"
    );
    // The README spells these two out as words.
    assert.equal(QUARTERS, 4, 'the README says "each whole quarter of the career"');
    says("each whole quarter of the career", "the decay");
    assert.equal(HEADS_UP_MONTHS, 3, 'the README says "within three months"');
    says("A drop due within three months", "the heads-up");
    says(`a paper counts as ${PAPER_FTE} full-time months of work`, "a paper's weight");
});

test("the README's writing and profile limits are the code's", () => {
    says(`at most ${BULLET_MAX} characters`, "a bullet's length");
    says(
        `headline ${PROFILE_LIMITS.linkedinHeadline}, About ${thousands(PROFILE_LIMITS.linkedinAbout)}, ` +
            `descriptions ${thousands(PROFILE_LIMITS.linkedinDescription)}, GitHub bio ${PROFILE_LIMITS.githubBio}`,
        "each profile field's limit"
    );
    assert.ok(MAX_INTERESTS >= 8, "the interests row takes the 6 to 8 the homepage aims for");
});
