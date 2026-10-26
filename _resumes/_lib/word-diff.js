"use strict";

/**
 * A word diff in git's plain --word-diff style: words only in `before` print
 * as [-removed-] and words only in `after` as {+added+}. The resume build
 * prints one for each reworded bullet, tagline or note, so a changed number or
 * a dropped "about" stands out against the CV's wording.
 */
function wordDiff(before, after) {
    const a = before.split(/\s+/).filter(Boolean);
    const b = after.split(/\s+/).filter(Boolean);
    // common[i][j]: the longest run of words a[i..] and b[j..] share, in order.
    const common = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            common[i][j] =
                a[i] === b[j]
                    ? common[i + 1][j + 1] + 1
                    : Math.max(common[i + 1][j], common[i][j + 1]);
        }
    }
    const runs = [];
    const push = (type, word) => {
        const last = runs[runs.length - 1];
        if (last && last.type === type) last.words.push(word);
        else runs.push({ type, words: [word] });
    };
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            push("same", a[i++]);
            j++;
        } else if (common[i + 1][j] >= common[i][j + 1]) {
            push("removed", a[i++]);
        } else {
            push("added", b[j++]);
        }
    }
    while (i < a.length) push("removed", a[i++]);
    while (j < b.length) push("added", b[j++]);
    return runs
        .map(({ type, words }) => {
            const text = words.join(" ");
            if (type === "removed") return `[-${text}-]`;
            return type === "added" ? `{+${text}+}` : text;
        })
        .join(" ");
}

module.exports = { wordDiff };
