"use strict";

/**
 * Resume generator: renders _resumes/variants/*.yaml specs against
 * _resumes/data/master.yaml into standalone .tex files at the _resumes/ root
 * (where _build.js and the GitHub workflows expect them).
 *
 * Usage:
 *   node _resumes/_generate.js               generate every variant
 *   node _resumes/_generate.js <name>...     generate specific variants
 *   --force                                  overwrite a hand-written (legacy) .tex
 *   --check                                  exit 1 if any committed .tex is stale
 */

const fs = require("fs");
const path = require("path");
const { loadMaster, resolveVariant, listVariantFiles, VARIANTS_DIR } = require("./_lib/load.js");
const { renderVariantTex } = require("./_lib/render-tex.js");

const RESUMES_DIR = __dirname;
const GENERATED_HEADER = "% AUTO-GENERATED";

function main() {
    const args = process.argv.slice(2);
    const force = args.includes("--force");
    const check = args.includes("--check");
    const names = args.filter((a) => !a.startsWith("--"));

    let files;
    if (names.length) {
        files = names.map((name) => {
            const file = path.join(VARIANTS_DIR, `${name.replace(/\.yaml$/, "")}.yaml`);
            if (!fs.existsSync(file)) {
                const valid = listVariantFiles()
                    .map((f) => path.basename(f, ".yaml"))
                    .join(", ");
                console.error(`Unknown variant "${name}". Available: ${valid}`);
                process.exit(1);
            }
            return file;
        });
    } else {
        files = listVariantFiles();
    }

    if (!files.length) {
        console.log("No variant specs found in _resumes/variants/.");
        return;
    }

    const master = loadMaster();
    let stale = 0;
    let blocked = 0;

    for (const file of files) {
        const variant = resolveVariant(file, master);
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
            console.log(`generated ${variant.name}.tex`);
        }
    }

    if (stale || blocked) process.exit(1);
}

main();
