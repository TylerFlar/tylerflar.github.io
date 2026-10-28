"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMaster } = require("./load.js");
const { resolveResume } = require("./resume.js");
const {
    postingBody,
    termsOf,
    skillTerms,
    findTerm,
    resumeText,
    postingCoverage
} = require("./posting.js");

// The build lists the CV's skills a posting names and flags the ones a resume
// leaves off. The CV's skill items are the vocabulary, so these pin how an
// item becomes terms, how a term is found in prose without false hits, and
// the coverage against a resume built from the real master.yaml.

const master = loadMaster();

test("the posting is what's below the notes at the top of posting.md", () => {
    const withRule = "# Posting\n\nLink: https://x\n\nNotes about Docker.\n\n---\n\nWe use Python.";
    assert.equal(postingBody(withRule).trim(), "We use Python.");
    const noRule = "# Posting\n\nLink: https://x\nWe use Python.<!-- and Docker -->";
    assert.equal(postingBody(noRule).trim(), "We use Python.");
});

test("a skill item answers to each name in it", () => {
    assert.deepEqual(termsOf("AWS (EC2, Lambda, S3)"), ["AWS", "EC2", "Lambda", "S3"]);
    assert.deepEqual(termsOf("JavaScript/TypeScript"), ["JavaScript", "TypeScript"]);
    // "C" alone would match every stray capital C.
    assert.deepEqual(termsOf("C/C++"), ["C++"]);
    // A first word that names a tool on its own counts by itself too.
    assert.deepEqual(termsOf("GitHub Actions"), ["GitHub Actions", "GitHub"]);
    assert.deepEqual(termsOf("MCP servers"), ["MCP servers", "MCP"]);
    assert.deepEqual(termsOf("Hugging Face Transformers"), ["Hugging Face Transformers"]);
});

test("a term two skill items share belongs to the first", () => {
    const skills = {
        languages: { items: ["SQL"] },
        data: { items: ["SQL Server"] }
    };
    const terms = skillTerms(skills);
    assert.deepEqual(
        terms.map((entry) => [entry.term, entry.group]),
        [
            ["SQL", "languages"],
            ["SQL Server", "data"]
        ]
    );
});

test("a term is found as a whole name, so Git isn't GitHub and Java isn't JavaScript", () => {
    assert.equal(findTerm("Experience with GitHub and JIRA", "Git"), -1);
    assert.equal(findTerm("JavaScript and TypeScript", "Java"), -1);
    assert.equal(findTerm("PostgreSQL or NoSQL stores", "SQL"), -1);
    assert.ok(findTerm("one of C/C++ or Python", "C++") > 0);
    assert.ok(findTerm("AWS services (S3, Lambda)", "S3") > 0);
    assert.ok(findTerm("Aurora\n  DSQL", "Aurora DSQL") >= 0);
});

test("a term with a capital needs one in the posting, so English words don't count", () => {
    assert.equal(findTerm("ready to react to feedback", "React"), -1);
    assert.equal(findTerm("a confluence of teams", "Confluence"), -1);
    assert.ok(findTerm("Built in React", "React") > 0);
    assert.ok(findTerm("GitHub and JIRA", "Jira") > 0);
    // A term written in lowercase on the CV matches any case.
    assert.ok(findTerm("Pandas and NumPy", "pandas") >= 0);
});

test("the resume's text is what it prints: picked bullets and skills, not the rest of the CV", () => {
    const resume = resolveResume(
        { sections: [{ Projects: { jackdaw: ["arena"] } }, { Skills: ["languages"] }] },
        master,
        "test"
    );
    const text = resumeText(resume);
    assert.ok(findTerm(text, "Terraform") >= 0, "the Arena bullet names Terraform");
    assert.ok(findTerm(text, "Python") >= 0, "Languages lists Python");
    assert.equal(findTerm(text, "Docker"), -1, "Cloud & DevOps isn't on it");
    assert.ok(!text.includes("https://"), "links print as their text");
});

test("coverage lists the CV's skills the posting names, in its order, and flags the ones left off", () => {
    const resume = resolveResume({ sections: [{ Skills: ["languages"] }] }, master, "test");
    const posting =
        "# Posting\n\nLink:\n\n---\n\nWe ship Docker images, written in Python, and track them in JIRA.";
    const named = postingCoverage(posting, resume, master.skills);
    assert.deepEqual(
        named.map((entry) => [entry.term, entry.group, entry.onResume]),
        [
            ["Docker", "cloud", false],
            ["Python", "languages", true],
            ["Jira", "systems", false]
        ]
    );
});
