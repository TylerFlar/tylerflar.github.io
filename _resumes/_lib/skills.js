"use strict";

/**
 * Every skill on the CV is backed by the work that shows it. An entry names the
 * skills it used in its own `skills:` list, so a skill falls under the entries
 * it came from and leaves the CV when the last of them does. Roles,
 * subprojects, projects and volunteering carry the list, and so can a degree,
 * for the skills only its classes back (budget.js decays those like one class).
 *
 * A claim names a skill by its full name, or by any name in it, the way a
 * posting would: "TypeScript" for JavaScript/TypeScript, "EC2" for AWS (EC2,
 * S3). A full name beats a partial one, and a claim that could be two skills
 * fails. Every skill needs a backer, and so does each name in its parentheses,
 * so a service or a library leaves the list when the last entry that used it
 * does. A claim of the full name, parentheses and all, backs every name in them.
 */

const { termsOf } = require("./posting.js");

function fail(message) {
    throw new Error(message);
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

const listText = (items) =>
    items.length < 2
        ? items.join("")
        : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

/** Every skill item: its group, its text, every name it answers to, and the names in its parentheses. */
function skillItems(master) {
    return Object.entries(master.skills || {}).flatMap(([group, { items }]) => {
        if (!Array.isArray(items)) fail(`master.yaml skills.${group}: needs an "items" list`);
        return items.map((value) => {
            const item = String(value);
            const listed = /\((.*)\)$/.exec(item);
            return {
                group,
                item,
                names: termsOf(item),
                listed: listed ? listed[1].split(",").map((name) => name.trim()) : []
            };
        });
    });
}

/** Every `skills:` list, with the entry its claims fall under: a subproject's go with its role. */
function claimSites(master) {
    const sites = [];
    const add = (label, holder, owner) => {
        if (holder.skills !== undefined) sites.push({ label, claims: holder.skills, owner });
    };
    for (const [kind, entries] of [
        ["role", master.roles],
        ["project", master.projects],
        ["volunteering", master.volunteering],
        ["education", master.education]
    ]) {
        for (const entry of entries || []) {
            add(`${kind} "${entry.id}"`, entry, entry);
            for (const sub of entry.subprojects || []) {
                add(`subproject "${entry.id}/${sub.id}"`, sub, entry);
            }
        }
    }
    return sites;
}

/**
 * The skill a claim names, trying its full name first, then a name in its
 * parentheses, then any name in it. Returns the skill and, for a name in
 * parentheses, that name.
 */
function resolveClaim(claim, items, label) {
    const tiers = [
        items.filter((skill) => same(skill.item, claim)).map((skill) => ({ skill, name: null })),
        items.flatMap((skill) =>
            skill.listed.filter((name) => same(name, claim)).map((name) => ({ skill, name }))
        ),
        items
            .filter((skill) => skill.names.some((name) => same(name, claim)))
            .map((skill) => ({ skill, name: null }))
    ];
    for (const found of tiers) {
        if (found.length === 1) return found[0];
        if (found.length > 1) {
            const choices = found.map(({ skill }) => `"${skill.item}"`);
            fail(`${label}: "${claim}" could be ${listText(choices)}; write the full name`);
        }
    }
    const near = items.filter((skill) => skill.item.toLowerCase().includes(claim.toLowerCase()));
    fail(
        `${label}: "${claim}" isn't a skill on the CV. ` +
            (near.length
                ? `Did you mean ${listText(near.map(({ item }) => `"${item}"`))}?`
                : "Check the spelling, or add it to skills first.")
    );
}

/**
 * Who backs each skill: for every item, the entries that claim it, and for
 * each name in its parentheses, the entries that claim that name.
 */
function skillBackers(master) {
    const items = skillItems(master);
    const backers = new Map(
        items.map((skill) => [
            skill,
            { item: new Set(), names: new Map(skill.listed.map((name) => [name, new Set()])) }
        ])
    );
    for (const { label, claims, owner } of claimSites(master)) {
        const where = `${label} skills`;
        if (
            !Array.isArray(claims) ||
            !claims.length ||
            claims.some((claim) => typeof claim !== "string" || !claim.trim())
        ) {
            fail(`${where}: list the CV skills it shows, by name, or leave "skills" out`);
        }
        const seen = new Set();
        for (const claim of claims) {
            const { skill, name } = resolveClaim(claim, items, where);
            const key = `${skill.item}\n${name ?? ""}`;
            if (seen.has(key)) fail(`${where}: "${claim}" names "${skill.item}" a second time`);
            seen.add(key);
            const backed = backers.get(skill);
            backed.item.add(owner);
            if (name) backed.names.get(name).add(owner);
            else if (same(claim, skill.item)) {
                for (const owners of backed.names.values()) owners.add(owner);
            }
        }
    }
    return { items, backers };
}

/**
 * Fail unless every skill, and every name in a skill's parentheses, is backed
 * by an entry on the CV. Lists every gap at once, since taking an entry off can
 * leave several.
 */
function validateSkillClaims(master) {
    const { items, backers } = skillBackers(master);
    const gaps = [];
    for (const skill of items) {
        const backed = backers.get(skill);
        if (!backed.item.size) {
            gaps.push(
                `master.yaml skills.${skill.group}: no entry backs "${skill.item}". Name it in ` +
                    "the skills of an entry that shows it, or take it off the CV."
            );
            continue;
        }
        for (const [name, owners] of backed.names) {
            if (!owners.size) {
                gaps.push(
                    `master.yaml skills.${skill.group}: no entry backs ${name} in "${skill.item}". ` +
                        `Name ${name} in the skills of an entry that used it, or take it out of the parentheses.`
                );
            }
        }
    }
    if (gaps.length) fail(gaps.join("\n"));
}

/**
 * The skills, and names in parentheses, that only these entries back: what
 * has to come off the CV with them. Each comes with its group and the
 * entries behind it.
 */
function onlyBackedBy(master, entries) {
    const going = new Set(entries);
    const only = (owners) => owners.size > 0 && [...owners].every((owner) => going.has(owner));
    const { items, backers } = skillBackers(master);
    const lost = [];
    for (const skill of items) {
        const backed = backers.get(skill);
        if (only(backed.item)) {
            lost.push({
                group: skill.group,
                item: skill.item,
                name: null,
                owners: [...backed.item]
            });
            continue;
        }
        for (const [name, owners] of backed.names) {
            if (only(owners)) {
                lost.push({ group: skill.group, item: skill.item, name, owners: [...owners] });
            }
        }
    }
    return lost;
}

module.exports = { validateSkillClaims, onlyBackedBy };
