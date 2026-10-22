"use strict";

/**
 * Write the LinkedIn and GitHub profile text to _resumes/output/profiles/
 * (gitignored): linkedin.md, github-readme.md and github-bio.txt. The words
 * come straight from master.yaml and profile.yaml, so run this after editing
 * either one and paste what it writes.
 *
 * Usage: node _resumes/_profiles.js   (or: npm run profiles)
 * Exits 1, writing nothing, if any field is over its site's limit.
 */

const fs = require("fs");
const path = require("path");
const { renderProfiles } = require("./_lib/render-profiles.js");

const OUT_DIR = path.join(__dirname, "output", "profiles");

function main() {
    const { files, fields, problems } = renderProfiles();
    if (problems.length) {
        console.error(`Over the limit, nothing written:\n  ${problems.join("\n  ")}`);
        process.exit(1);
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
        fs.writeFileSync(path.join(OUT_DIR, name), text, "utf8");
    }
    for (const item of fields) {
        console.log(`${String(item.length).padStart(5)} / ${item.limit}  ${item.name}`);
    }
    console.log(
        `wrote ${Object.keys(files).join(", ")} to ${path.relative(process.cwd(), OUT_DIR)}`
    );
}

main();
