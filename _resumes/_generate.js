"use strict";

/**
 * Resume generator. Renders two things into standalone .tex files at the
 * _resumes/ root (where _build.js and the GitHub workflows expect them):
 *
 *   _cv.tex   the CV, straight from _resumes/data/master.yaml — every entry,
 *             all non-alt bullets, in master order. No spec file: master.yaml
 *             *is* the CV.
 *   <name>.tex  one per tailored spec in _resumes/variants/, each selecting a
 *             subset of the same master content.
 *
 * Usage:
 *   node _resumes/_generate.js               generate the CV and every variant
 *   node _resumes/_generate.js <name>...     generate specific ones ("_cv" for the CV)
 *   --force                                  overwrite a hand-written (legacy) .tex
 *   --check                                  exit 1 if any committed .tex is stale
 */

const fs = require("fs");
const path = require("path");
const {
    loadMaster,
    resolveVariant,
    resolveCv,
    listVariantFiles,
    VARIANTS_DIR
} = require("./_lib/load.js");
const { renderVariantTex } = require("./_lib/render-tex.js");

const CV_NAME = "_cv";

const RESUMES_DIR = __dirname;
const GENERATED_HEADER = "% AUTO-GENERATED";

/** Approximate visible word count of a resolved variant (content, not LaTeX). */
function approxWordCount(variant) {
    const parts = [variant.headline, variant.summary];
    for (const section of variant.sections) {
        parts.push(section.title);
        if (section.kind === "skills") {
            for (const group of section.groups) parts.push(group.label, group.items.join(" "));
            continue;
        }
        if (section.kind === "interests") {
            for (const item of section.items) parts.push(item.label);
            continue;
        }
        for (const entry of section.entries) {
            parts.push(
                entry.org,
                entry.title,
                entry.school,
                entry.degree,
                entry.field,
                entry.location,
                entry.name,
                entry.tagline,
                entry.blurb
            );
            for (const bullet of entry.bullets || []) parts.push(bullet.text ?? bullet.tex);
            for (const sub of entry.subprojects || []) {
                parts.push(sub.name);
                for (const bullet of sub.bullets || []) parts.push(bullet.text ?? bullet.tex);
            }
        }
    }
    const text = parts.filter(Boolean).join(" ").trim();
    return text ? text.split(/\s+/).length : 0;
}

function main() {
    const args = process.argv.slice(2);
    const force = args.includes("--force");
    const check = args.includes("--check");
    const names = args.filter((a) => !a.startsWith("--"));

    const requested = names.map((n) => n.replace(/\.yaml$/, ""));
    const wantCv = !requested.length || requested.includes(CV_NAME);

    let files;
    if (requested.length) {
        files = requested
            .filter((name) => name !== CV_NAME)
            .map((name) => {
                const file = path.join(VARIANTS_DIR, `${name}.yaml`);
                if (!fs.existsSync(file)) {
                    const valid = [
                        CV_NAME,
                        ...listVariantFiles().map((f) => path.basename(f, ".yaml"))
                    ].join(", ");
                    console.error(`Unknown variant "${name}". Available: ${valid}`);
                    process.exit(1);
                }
                return file;
            });
    } else {
        files = listVariantFiles();
    }

    const master = loadMaster();
    let stale = 0;
    let blocked = 0;

    // The CV has no spec file — it is master.yaml itself.
    const targets = files.map((file) => () => resolveVariant(file, master));
    if (wantCv) targets.unshift(() => resolveCv(master, CV_NAME));

    if (!targets.length) {
        console.log("Nothing to generate.");
        return;
    }

    for (const resolve of targets) {
        const variant = resolve();
        const tex = renderVariantTex(variant);
        const target = path.join(RESUMES_DIR, `${variant.name}.tex`);

        if (fs.existsSync(target)) {
            const existing = fs.readFileSync(target, "utf8");
            if (check) {
                if (existing !== tex) {
                    console.error(`STALE: ${variant.name}.tex differs from its spec`);
                    stale++;
                } else {
                    console.log(`ok: ${variant.name}.tex`);
                }
                continue;
            }
            if (!existing.startsWith(GENERATED_HEADER) && !force) {
                console.error(
                    `REFUSING to overwrite hand-written ${variant.name}.tex (no AUTO-GENERATED header). ` +
                        "Re-run with --force to migrate it."
                );
                blocked++;
                continue;
            }
        } else if (check) {
            console.error(`STALE: ${variant.name}.tex does not exist`);
            stale++;
            continue;
        }

        if (!check) {
            fs.writeFileSync(target, tex, "utf8");
            console.log(`generated ${variant.name}.tex (~${approxWordCount(variant)} words)`);
        }
    }

    if (stale || blocked) process.exit(1);
}

main();
