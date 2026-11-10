"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { proseFromMarkdown } = require("./voice.js");

const PROJECTS_DIR = path.join(__dirname, "..", "..", "src", "content", "projects");

// Project pages group under these on the projects page: research first, then
// software and experiments, then class projects.
const PROJECT_CATEGORIES = ["research", "software", "class"];

// How a card frames the page's cover: cropped to fill it (the default, right
// for a photo), or `coverFit: contain`, whole and uncropped, for a drawing or
// a chart whose edges matter.
const COVER_FITS = ["cover", "contain"];

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

/**
 * Every project page with the CV entry it names (`cv`), whether it's a draft,
 * its raw markdown, and the text a reader sees (`prose`): its title, summary
 * and role, then the body with code, math and URLs blanked, as the voice lint
 * reads it.
 */
function loadProjectPages(dir = PROJECTS_DIR) {
    return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith(".md"))
        .map((file) => {
            const raw = fs.readFileSync(path.join(dir, file), "utf8");
            const front = readFrontMatter(raw, file);
            if (front.coverFit !== undefined && !COVER_FITS.includes(front.coverFit)) {
                throw new Error(
                    `${file}: coverFit must be one of ${COVER_FITS.join(", ")}, got "${front.coverFit}"`
                );
            }
            if (front.imageAlt !== undefined && typeof front.imageAlt !== "string") {
                throw new Error(`${file}: imageAlt must be text that describes the cover`);
            }
            const header = ["title", "summary", "role"]
                .map((key) => front[key])
                .filter((value) => typeof value === "string");
            return {
                file,
                cv: front.cv,
                // A draft is left out of a full build, so it isn't on the site yet.
                draft: front.draft === true,
                raw,
                prose: [...header, proseFromMarkdown(raw)].join("\n")
            };
        });
}

module.exports = { PROJECT_CATEGORIES, readFrontMatter, assertCategory, loadProjectPages };
