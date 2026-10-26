"use strict";

const yaml = require("js-yaml");

// Project pages group under these on the projects page: research first, then
// software and experiments, then class projects.
const PROJECT_CATEGORIES = ["research", "software", "class"];

/** The parsed front matter of a markdown page. */
function readFrontMatter(text, label) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!match) throw new Error(`${label}: no front matter`);
    return yaml.load(match[1]) ?? {};
}

/** Throw unless a project page names one of the categories. */
function assertCategory(category, label) {
    if (!PROJECT_CATEGORIES.includes(category)) {
        throw new Error(
            `${label}: category must be one of ${PROJECT_CATEGORIES.join(", ")}, got "${category}"`
        );
    }
}

module.exports = { PROJECT_CATEGORIES, readFrontMatter, assertCategory };
