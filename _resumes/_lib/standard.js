"use strict";

/**
 * The standard every document is held to, the CV and each application's
 * resume alike, set from what career centers and recruiters recommend for a CS
 * master's student:
 *
 *   - no headline or summary (CMU: "not needed"; UMD, Gayle McDowell, Google)
 *   - 11pt, the CV's size: cut, don't shrink the font (MIT)
 *   - at most 6 courses (CMU: 3 to 6)
 *   - at most 15 skills in a group and 30 a page, since a reader skims and
 *     anything listed is fair game in an interview
 *   - every section newest first, the CV's own order (reverse-chronological is
 *     what every career center shows)
 *   - a website summary picked as a bullet passes the CV's bullet rules
 *   - nothing cv.yaml holds below the standard
 *   - full pages: a document runs to its page limit with at most 8 lines free
 *     on the last ("If it is 2 pages, it needs to be 2 full pages", USM)
 *
 * The CV also keeps 2 lines free, since the deploy's TeX Live sets XCharter a
 * hair differently from MiKTeX. The resolvers print what a spec picks;
 * standardProblems and fillProblem say what keeps it from going out, and
 * npm run cv and npm run apply fail on either.
 */

const { bulletProblems } = require("./voice.js");
const { assertNewestFirst } = require("./order.js");

// Sections whose entries carry start and end dates.
const DATED_KINDS = new Set(["education", "role", "project", "volunteer"]);

const STANDARD = {
    fontSize: "11pt",
    maxCourses: 6,
    maxSkillsPerGroup: 15,
    maxSkillsPerPage: 30,
    maxFreeLines: 8,
    cvMinFreeLines: 2
};

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "a.b.c" and the keys above it, nearest first: "a.b.c", "a.b", "a". */
function ancestors(key) {
    const parts = key.split(".");
    return parts.map((_, i) => parts.slice(0, parts.length - i).join("."));
}

/**
 * The key of everything a resolved document prints: "id" for an entry,
 * "id.sub" for a subproject, "id.bullet" and "id.sub.bullet" for bullets.
 * cv.yaml's off list uses the same keys.
 */
function printedKeys(variant) {
    const keys = [];
    for (const section of variant.sections) {
        for (const entry of section.entries || []) {
            keys.push(entry.id);
            for (const bullet of entry.bullets || []) keys.push(`${entry.id}.${bullet.id}`);
            for (const sub of entry.subprojects || []) {
                keys.push(`${entry.id}.${sub.id}`);
                for (const bullet of sub.bullets || []) {
                    keys.push(`${entry.id}.${sub.id}.${bullet.id}`);
                }
            }
        }
    }
    return keys;
}

/**
 * What keeps a resolved document (resolvePublicCv or resolveResume) from
 * meeting the standard, as messages that say what to do. `below` maps the
 * keys cv.yaml holds below the standard to why.
 */
function standardProblems(variant, { below = new Map() } = {}) {
    const problems = [];
    if (variant.headline || variant.summary) {
        problems.push(
            "has a headline or summary. Leave both out: the CV has neither, and career centers say a student's resume shouldn't either"
        );
    }
    if ((variant.fontSize ?? STANDARD.fontSize) !== STANDARD.fontSize) {
        problems.push(
            `is set in ${variant.fontSize}. Keep the CV's ${STANDARD.fontSize} and cut something instead`
        );
    }
    const pages = variant.maxPages ?? 1;
    const summaryProblems = (bullets, where) => {
        for (const bullet of bullets || []) {
            if (!bullet.alt) continue;
            for (const reason of bulletProblems(bullet.text, where)) {
                problems.push(
                    `prints the website summary ${where}.${bullet.id}, which breaks a CV bullet rule: ${reason}. Pick a CV bullet or reword it`
                );
            }
        }
    };
    for (const section of variant.sections) {
        if (section.kind === "skills") {
            let total = 0;
            for (const group of section.groups) {
                total += group.items.length;
                if (group.items.length > STANDARD.maxSkillsPerGroup) {
                    problems.push(
                        `lists ${group.items.length} ${group.label} skills. Pick at most ${STANDARD.maxSkillsPerGroup}, the ones the job and the page back`
                    );
                }
            }
            const most = STANDARD.maxSkillsPerPage * pages;
            if (total > most) {
                problems.push(
                    `lists ${total} skills over ${plural(pages, "page")}. Keep it to ${most}, ${STANDARD.maxSkillsPerPage} a page`
                );
            }
        }
        if (DATED_KINDS.has(section.kind)) {
            try {
                assertNewestFirst(section.entries, `lists ${section.title} out of order`);
            } catch (error) {
                problems.push(`${error.message}, since every section runs newest first`);
            }
        }
        for (const entry of section.entries || []) {
            if ((entry.coursework || []).length > STANDARD.maxCourses) {
                problems.push(
                    `lists ${entry.coursework.length} courses. Pick at most ${STANDARD.maxCourses} with coursework: [...]`
                );
            }
            summaryProblems(entry.bullets, entry.id);
            for (const sub of entry.subprojects || []) {
                summaryProblems(sub.bullets, `${entry.id}.${sub.id}`);
            }
        }
    }
    for (const key of printedKeys(variant)) {
        const held = ancestors(key).find((candidate) => below.has(candidate));
        if (held) {
            problems.push(
                `prints ${key}, which cv.yaml holds below the standard (${below.get(held)}). Leave it out until cv.yaml moves it`
            );
        }
    }
    return problems;
}

/**
 * Whether a compiled document fills its pages: a message if not, null if it
 * does or there's nothing to judge. `what` names it ("The CV"). Running past
 * the limit is reported where it's measured, not here.
 */
function fillProblem({ pages, fill, maxPages, what, minFree = 0 }) {
    if (pages == null || pages > maxPages || !fill || fill.goal == null || !fill.small) {
        return null;
    }
    const free = Math.floor(Math.max(0, fill.goal - fill.need) / fill.small);
    if (pages < maxPages) {
        return `${what} runs to ${plural(pages, "page")} of ${maxPages}. It fills its pages: put an entry or a bullet back.`;
    }
    if (free > STANDARD.maxFreeLines) {
        return `${what} has about ${plural(free, "line")} free on its last page, and a full page leaves at most ${STANDARD.maxFreeLines}. Put an entry or a bullet back.`;
    }
    if (free < minFree) {
        return `${what} has about ${plural(free, "line")} free on its last page. Leave ${minFree}, since the deploy's TeX Live sets XCharter a hair differently: take a line out.`;
    }
    return null;
}

module.exports = { STANDARD, ancestors, printedKeys, standardProblems, fillProblem };
