"use strict";

/**
 * The order the CV ranks its skills and courses in. It comes from the work in
 * master.yaml, not from a job the CV is aimed at, so the CV leads with what
 * was done most, and the rank changes only when master.yaml does.
 *
 *   - A skill scores a point for each piece of work that lists it in its
 *     `skills:` (an entry, or a role's subproject), and a second point when
 *     that work's own words, its tagline and bullets, name it. So a skill the
 *     work was about outranks one it only touched.
 *   - A name in a skill's parentheses (an AWS service) scores the same way, by
 *     the work that lists it.
 *   - A skill group scores the same way, by the work that lists any of its
 *     skills.
 *   - A course scores a point for each piece of work whose words name its code
 *     ("CSE 252D").
 *
 * Ties go to the one whose newest work is newer (order.js's newest first),
 * then to master.yaml's order. Every piece of work counts, whatever its
 * budget. A skill that only out-of-budget work backs can't print (budget.js),
 * so the CV's picks skip it.
 *
 * The CV prints the top of each list, as much as fits: the top skill groups in
 * rank order, the top of each group, the top of each skill's parentheses, and
 * the top courses. cv.yaml lists its picks that way, and rankProblems fails it
 * otherwise. An application's resume picks by its posting instead, so this
 * holds only the CV.
 */

const { resolvedClaims } = require("./skills.js");
const { findTerm } = require("./posting.js");
const { compareNewestFirst } = require("./order.js");
const { budgetRows, lostSkills } = require("./budget.js");

// A skill's name without its parentheses, and the names in them.
const skillName = (text) => text.replace(/\s*\(.*\)$/, "");
const skillListed = (text) =>
    /\((.*)\)$/
        .exec(text)?.[1]
        .split(",")
        .map((name) => name.trim()) ?? [];
// A course's code, "CSE 252D" in "CSE 252D Advanced Computer Vision".
const courseCode = (course) => /^[A-Z]{2,5} \d+[A-Z]*\b/.exec(course)?.[0] ?? null;

const sameList = (a, b) =>
    a.length === b.length && a.every((text, i) => text.toLowerCase() === b[i].toLowerCase());

/** A piece of work's own words: its tagline and its bullets. */
const wordsOf = (work) =>
    [work.tagline, ...(work.bullets || []).map((bullet) => bullet.text)]
        .filter((text) => typeof text === "string")
        .join("\n");

const names = (work, terms) => terms.some((term) => findTerm(wordsOf(work), term) >= 0);

/** The newest piece of work in a list, newest first as order.js has it. */
const newestOf = (works) =>
    works.reduce(
        (newest, work) => (!newest || compareNewestFirst(work, newest) < 0 ? work : newest),
        null
    );

/**
 * A score from the work that lists something: a point for each piece, and one
 * more for each whose words name it by one of `terms`.
 */
function listedBy(works, terms) {
    const list = [...works];
    const score = list.reduce((sum, work) => sum + 1 + (names(work, terms) ? 1 : 0), 0);
    return { score, newest: newestOf(list) };
}

/** Higher score first, then newer work, then master.yaml's order (`index`). */
function byRank(a, b) {
    if (a.score !== b.score) return b.score - a.score;
    if (a.newest && b.newest) {
        const newer = compareNewestFirst(a.newest, b.newest);
        if (newer) return newer;
    } else if (a.newest || b.newest) {
        return a.newest ? -1 : 1;
    }
    return a.index - b.index;
}

/**
 * master.yaml's skill groups, ranked, with each group's skills ranked and each
 * skill's parentheses ranked: [{ key, label, score, skills: [{ item, name,
 * score, listed: [{ name, score }] }] }].
 */
function skillRank(master) {
    const { items, claims } = resolvedClaims(master);
    const behind = new Map(
        items.map((skill) => [
            skill,
            { works: new Set(), names: new Map(skill.listed.map((name) => [name, new Set()])) }
        ])
    );
    for (const { site, skill, name, whole } of claims) {
        const backed = behind.get(skill);
        backed.works.add(site);
        if (name) backed.names.get(name).add(site);
        else if (whole) for (const works of backed.names.values()) works.add(site);
    }
    return Object.entries(master.skills)
        .map(([key, group], index) => {
            const members = items.filter((skill) => skill.group === key);
            const skills = members
                .map((skill, place) => {
                    const backed = behind.get(skill);
                    const listed = skill.listed
                        .map((name, at) => ({
                            name,
                            index: at,
                            ...listedBy(backed.names.get(name), [name])
                        }))
                        .sort(byRank);
                    return {
                        item: skill.item,
                        name: skillName(skill.item),
                        index: place,
                        listed,
                        ...listedBy(backed.works, skill.names)
                    };
                })
                .sort(byRank);
            const works = new Set(members.flatMap((skill) => [...behind.get(skill).works]));
            const terms = members.flatMap((skill) => skill.names);
            return { key, label: group.label, index, skills, ...listedBy(works, terms) };
        })
        .sort(byRank);
}

/** The coursework, ranked: [{ course, code, score }]. */
function courseRank(master) {
    const carrier = (master.education || []).find((entry) => entry.coursework);
    if (!carrier) return [];
    const works = [
        ...(master.roles || []),
        ...(master.projects || []),
        ...(master.volunteering || [])
    ].flatMap((entry) => [entry, ...(entry.subprojects || [])]);
    return carrier.coursework
        .map((course, index) => {
            const code = courseCode(course);
            const naming = code ? works.filter((work) => names(work, [code])) : [];
            return {
                course,
                code: code ?? course,
                index,
                score: naming.length,
                newest: newestOf(naming)
            };
        })
        .sort(byRank);
}

const scores = (list, label) => list.map((entry) => `${label(entry)} ${entry.score}`).join(", ");

/**
 * What keeps a resolved CV (resolvePublicCv) from printing the top of each
 * ranked list in rank order, as messages that say what cv.yaml should list.
 * `today` (a monthKey, this month by default) decides which skills can't print
 * for want of budget, and the picks skip those.
 */
function rankProblems(master, doc, { today } = {}) {
    const problems = [];
    const lost = lostSkills(master, budgetRows(master, { today }));
    const gone = (group, item, name) =>
        lost.some((skill) => skill.group === group && skill.item === item && skill.name === name);
    const ranked = skillRank(master)
        .map((group) => ({
            ...group,
            skills: group.skills
                .filter((skill) => !gone(group.key, skill.item, null))
                .map((skill) => ({
                    ...skill,
                    listed: skill.listed.filter((name) => !gone(group.key, skill.item, name.name))
                }))
        }))
        .filter((group) => group.skills.length);
    const byLabel = new Map(ranked.map((group) => [group.label, group]));
    const shown = (doc.sections || [])
        .filter((section) => section.kind === "skills")
        .flatMap((section) => section.groups)
        .filter((group) => byLabel.has(group.label));

    if (shown.length) {
        const want = ranked.slice(0, shown.length).map((group) => group.key);
        const have = shown.map((group) => byLabel.get(group.label).key);
        if (!sameList(have, want)) {
            problems.push(
                `cv.yaml Skills: the CV prints the top skill groups in rank order (rank.js), so list ` +
                    `[${want.join(", ")}]. It has [${have.join(", ")}]. ` +
                    `The rank: ${scores(ranked, (group) => group.key)}.`
            );
        }
    }
    for (const group of shown) {
        const rank = byLabel.get(group.label);
        const have = group.items.map(skillName);
        const top = rank.skills.slice(0, have.length);
        const want = top.map((skill) => skill.name);
        if (!sameList(have, want)) {
            problems.push(
                `cv.yaml Skills ${rank.key}: the CV prints the top of the group in rank order, so list ` +
                    `[${want.join(", ")}]. It has [${have.join(", ")}]. ` +
                    `The rank: ${scores(rank.skills, (skill) => skill.name)}.`
            );
            continue;
        }
        for (const [i, text] of group.items.entries()) {
            const skill = top[i];
            const listed = skillListed(text);
            if (!listed.length) continue;
            const wantNames = skill.listed.slice(0, listed.length).map((name) => name.name);
            if (!sameList(listed, wantNames)) {
                problems.push(
                    `cv.yaml Skills ${rank.key}: print the top of ${skill.name}'s parentheses in rank ` +
                        `order, "${skill.name} (${wantNames.join(", ")})". It has "${text}". ` +
                        `The rank: ${scores(skill.listed, (name) => name.name)}.`
                );
            }
        }
    }

    const school = (doc.sections || [])
        .flatMap((section) => section.entries || [])
        .find((entry) => entry.kind === "education" && entry.coursework);
    if (school) {
        const courses = courseRank(master);
        const have = school.coursework.map((course) => courseCode(course) ?? course);
        const want = courses.slice(0, have.length).map((course) => course.code);
        if (!sameList(have, want)) {
            problems.push(
                `cv.yaml coursework: the CV prints the top courses in rank order (rank.js), so list ` +
                    `[${want.join(", ")}]. It has [${have.join(", ")}]. ` +
                    `The rank: ${scores(courses, (course) => course.code)}.`
            );
        }
    }
    return problems;
}

module.exports = { skillRank, courseRank, rankProblems };
