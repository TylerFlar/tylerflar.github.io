"use strict";

/**
 * The CV's bullet budget: how many bullets each entry may print.
 *
 * An entry's `tier` sets it: flagship 3, standard 2, minor 1. Teaching roles
 * and volunteering default to minor, everything else to standard. A role with
 * subprojects shares a fixed 4 across its own bullets and every subproject's,
 * so splitting the work into subprojects never buys more lines. `alt: true`
 * bullets are website-only and don't count.
 */

const TIER_LIMITS = { flagship: 3, standard: 2, minor: 1 };
const SHARED_LIMIT = 4;
const SUBPROJECT_LIMIT = 3;

function fail(message) {
    throw new Error(message);
}

const onCv = (bullets) => (bullets || []).filter((bullet) => !bullet.alt).length;

function defaultTier(kind, entry) {
    if (kind === "volunteer") return "minor";
    if (kind === "role" && entry.track === "teaching") return "minor";
    return "standard";
}

function checkShared(entry, label) {
    if (entry.tier !== undefined) {
        fail(`${label}: has subprojects, so it shares a fixed ${SHARED_LIMIT}; remove "tier"`);
    }
    let total = onCv(entry.bullets);
    for (const sub of entry.subprojects) {
        if (sub.tier !== undefined) {
            fail(`${label}/${sub.id}: a subproject shares its role's budget; remove "tier"`);
        }
        const count = onCv(sub.bullets);
        if (count > SUBPROJECT_LIMIT) {
            fail(
                `${label}/${sub.id}: ${count} CV bullets; a subproject prints at most ` +
                    `${SUBPROJECT_LIMIT}. Delete the weakest or merge two.`
            );
        }
        total += count;
    }
    if (total > SHARED_LIMIT) {
        fail(
            `${label}: ${total} CV bullets counting its subprojects; the shared budget is ` +
                `${SHARED_LIMIT}. Delete the weakest or merge two.`
        );
    }
}

function checkTiered(kind, entry, label) {
    const tier = entry.tier ?? defaultTier(kind, entry);
    if (!Object.hasOwn(TIER_LIMITS, tier)) {
        fail(
            `${label}: unknown tier "${tier}". Valid tiers: ${Object.keys(TIER_LIMITS).join(", ")}`
        );
    }
    const limit = TIER_LIMITS[tier];
    const count = onCv(entry.bullets);
    if (count > limit) {
        fail(
            `${label}: ${count} CV bullets; a ${tier} entry prints at most ${limit}. ` +
                "Delete the weakest, merge two, or raise its tier."
        );
    }
}

/** Throw if any role, project or volunteering entry prints more bullets than its budget. */
function assertBudget(master) {
    const groups = [
        ["role", master.roles],
        ["project", master.projects],
        ["volunteer", master.volunteering]
    ];
    for (const [kind, entries] of groups) {
        for (const entry of entries || []) {
            const label = `${kind} "${entry.id}"`;
            if (entry.subprojects?.length) checkShared(entry, label);
            else checkTiered(kind, entry, label);
        }
    }
}

module.exports = { assertBudget, TIER_LIMITS, SHARED_LIMIT, SUBPROJECT_LIMIT };
