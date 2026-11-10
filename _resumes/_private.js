"use strict";

/**
 * The private history: a second git repository over this same folder, for the
 * files the public repo ignores because they show where I'm applying or are
 * mine alone. It tracks only the paths listed below and lives in .private.git,
 * which the public repo ignores, so nothing here can reach GitHub by accident.
 *
 *   npm run private:save [message]   snapshot those paths, if anything changed
 *   npm run private -- <git args>    any git command against that history, like
 *                                    npm run private -- log --oneline
 *                                    npm run private -- diff HEAD~1 -- .claude
 *
 * There's no remote. For a copy off this disk, add a private one yourself:
 *   npm run private -- remote add origin <url>
 *   npm run private -- push -u origin main
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GIT_DIR = path.join(ROOT, ".private.git");

// What the private history holds. The public .gitignore ignores every one.
const PATHS = [
    ".claude/skills",
    "_resumes/VOICE.md",
    "_resumes/applications",
    "_resumes/output/profiles"
];

function git(args, { check = true } = {}) {
    const run = spawnSync("git", [`--git-dir=${GIT_DIR}`, `--work-tree=${ROOT}`, ...args], {
        cwd: ROOT,
        encoding: "utf8"
    });
    if (run.error) throw new Error("git isn't on your PATH.");
    if (check && run.status !== 0) {
        throw new Error(run.stderr.trim() || `git ${args.join(" ")} failed`);
    }
    return run;
}

/** Create the history the first time: a bare repository beside the public one. */
function init() {
    const run = spawnSync("git", ["init", "--bare", "--initial-branch=main", GIT_DIR], {
        cwd: ROOT,
        encoding: "utf8"
    });
    if (run.error) throw new Error("git isn't on your PATH.");
    if (run.status !== 0) throw new Error(run.stderr.trim() || "git init failed");
    // Files go in as they are on disk, and status lists only what's tracked,
    // not the whole public tree.
    git(["config", "core.autocrlf", "false"]);
    git(["config", "status.showUntrackedFiles", "no"]);
    console.log("started the private history in .private.git");
}

function save(message) {
    if (!fs.existsSync(GIT_DIR)) init();
    for (const entry of PATHS) {
        if (fs.existsSync(path.join(ROOT, entry))) {
            // -f, since the public .gitignore ignores these. -A takes deletions too.
            git(["add", "-f", "-A", "--", entry]);
        } else {
            git(["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", entry]);
        }
    }
    if (git(["diff", "--cached", "--quiet"], { check: false }).status === 0) {
        console.log("Nothing has changed since the last save.");
        return;
    }
    const changed = git(["diff", "--cached", "--shortstat"]).stdout.trim();
    const stamp = new Date().toLocaleString("sv-SE").slice(0, 16);
    git(["commit", "-q", "-m", message || `Save ${stamp}`]);
    console.log(`saved to the private history: ${changed}`);
}

try {
    save(process.argv.slice(2).join(" ").trim());
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
