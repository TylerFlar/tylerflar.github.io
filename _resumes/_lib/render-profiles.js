"use strict";

/**
 * Plain text for LinkedIn and GitHub, from the CV and profile.yaml. LinkedIn
 * carries what the CV does, entry for entry: the roles, projects, paper,
 * awards, skills and education cv.yaml picks, with the same bullets, so the
 * two never disagree. It's deterministic, so a profile carries the CV's own
 * words: paste it, don't retype it. Every field is checked against the limit
 * the site enforces, and a field over its limit is a problem, not a truncation.
 *
 *   linkedin.md       headline, About, one description per role and project,
 *                     publications, awards, skills, education, volunteering
 *   github-readme.md  the profile README (TylerFlar/tylerflar)
 *   github-bio.txt    the profile bio
 */

const fs = require("fs");
const path = require("path");
const { loadMaster, loadProfile } = require("./load.js");
const { resolvePublicCv } = require("./cv.js");
const { renderPlain, normalizeBulletText, formatMonthYear } = require("./markup.js");
const { readFrontMatter } = require("./pages.js");

const SITE = "https://tylerflar.com";
const PROJECTS_DIR = path.join(__dirname, "..", "..", "src", "content", "projects");

// What each site allows, in characters.
const LIMITS = {
    linkedinHeadline: 220,
    linkedinAbout: 2600,
    linkedinDescription: 2000,
    githubBio: 160
};

const count = (text) => [...text].length;

/** The project page for each CV entry, by its `cv:` reference. */
function projectPages() {
    const pages = new Map();
    for (const file of fs.readdirSync(PROJECTS_DIR).filter((name) => name.endsWith(".md"))) {
        const front = readFrontMatter(fs.readFileSync(path.join(PROJECTS_DIR, file), "utf8"), file);
        pages.set(front.cv, `${SITE}/projects/${path.basename(file, ".md")}/`);
    }
    return pages;
}

// ASCII dates in descriptions; the site's own date pickers hold the real ones.
// One month prints once.
const dates = (start, end, label) =>
    start === end
        ? formatMonthYear(start, label)
        : `${formatMonthYear(start, label)} - ${formatMonthYear(end, label)}`;

const bulletLines = (bullets, label) =>
    (bullets || [])
        .filter((bullet) => !bullet.alt)
        .map((bullet) => `• ${renderPlain(normalizeBulletText(bullet.text), label)}`);

function roleDescription(role, pages) {
    const lines = bulletLines(role.bullets, `role ${role.id}`);
    for (const sub of role.subprojects || []) {
        const page = pages.get(`role/${role.id}/${sub.id}`);
        lines.push(
            "",
            `${sub.name} (${dates(sub.start, sub.end, sub.id)})${page ? `: ${page}` : ""}`,
            ...bulletLines(sub.bullets, `role ${role.id}/${sub.id}`)
        );
    }
    return lines.join("\n");
}

// The tagline leads, as it does on the CV, since that's where a team project
// says it was one.
function projectDescription(project, pages) {
    const lines = [
        ...(project.tagline ? [renderPlain(project.tagline, `project ${project.id} tagline`)] : []),
        ...bulletLines(project.bullets, `project ${project.id}`)
    ];
    const page = pages.get(`project/${project.id}`);
    if (page) lines.push("", `More: ${page}`);
    return lines.join("\n");
}

/**
 * Render every profile text. Returns the files to write, every limited field
 * with its length, and the problems (fields over their limit).
 */
function renderProfiles() {
    const master = loadMaster();
    const profile = loadProfile();
    const pages = projectPages();
    // The CV's entries of one kind, in the CV's order, with the CV's bullets.
    const cv = resolvePublicCv(master);
    const onCv = (kind) =>
        cv.sections
            .filter((section) => section.kind === kind)
            .flatMap((section) => section.entries);
    const fields = [];
    const field = (name, text, limit) => {
        fields.push({ name, length: count(text), limit });
        return text;
    };

    const headline = field(
        "LinkedIn headline",
        profile.linkedinHeadline.trim(),
        LIMITS.linkedinHeadline
    );
    const about = field(
        "LinkedIn About",
        `${renderPlain(profile.bio, "profile.yaml bio")}\n\nMore at tylerflar.com.`,
        LIMITS.linkedinAbout
    );

    const sections = [`# LinkedIn`, "", "## Headline", "", headline, "", "## About", "", about];

    sections.push("", "## Experience");
    for (const role of onCv("role")) {
        const where = role.location ? ` (${role.location})` : "";
        sections.push(
            "",
            `### ${role.title}, ${role.org}${where}, ${dates(role.start, role.end, role.id)}`,
            "",
            field(
                `Experience: ${role.org}`,
                roleDescription(role, pages),
                LIMITS.linkedinDescription
            )
        );
    }

    sections.push("", "## Projects");
    for (const project of onCv("project")) {
        sections.push(
            "",
            `### ${project.name}, ${dates(project.start, project.end, project.id)}`,
            "",
            field(
                `Project: ${project.name}`,
                projectDescription(project, pages),
                LIMITS.linkedinDescription
            )
        );
    }

    sections.push("", "## Publications");
    for (const pub of onCv("publication")) {
        const venue = [pub.venue, pub.location, formatMonthYear(pub.date, pub.id)]
            .filter(Boolean)
            .join(", ");
        const body = [
            renderPlain(pub.authors, `publication ${pub.id} authors`),
            venue,
            ...(pub.note ? [renderPlain(pub.note, `publication ${pub.id} note`)] : []),
            ...(pub.url ? [pub.url] : [])
        ].join("\n");
        sections.push(
            "",
            `### ${pub.title}`,
            "",
            field(`Publication: ${pub.id}`, body, LIMITS.linkedinDescription)
        );
    }

    const awards = onCv("award");
    if (awards.length) {
        sections.push("", "## Honors & Awards");
        for (const award of awards) {
            sections.push("", `### ${award.name}, ${award.issuer}, ${award.term}`);
            if (award.note) {
                sections.push(
                    "",
                    field(
                        `Award: ${award.id}`,
                        renderPlain(award.note, `award ${award.id} note`),
                        LIMITS.linkedinDescription
                    )
                );
            }
        }
    }

    sections.push("", "## Skills", "");
    sections.push(
        cv.sections
            .filter((section) => section.kind === "skills")
            .flatMap((section) => section.groups)
            .flatMap((group) => group.items)
            .join(", ")
    );

    sections.push("", "## Education");
    for (const school of onCv("education")) {
        sections.push(
            "",
            `### ${school.school}: ${school.degree} in ${school.field}, ${dates(school.start, school.end, school.id)}`
        );
        if (school.gpa) sections.push("", `GPA: ${school.gpa}`);
    }

    sections.push("", "## Volunteering");
    for (const entry of onCv("volunteer")) {
        sections.push(
            "",
            `### ${entry.title}, ${entry.org}, ${dates(entry.start, entry.end, entry.id)}`,
            "",
            field(
                `Volunteering: ${entry.org}`,
                bulletLines(entry.bullets, `volunteering ${entry.id}`).join("\n"),
                LIMITS.linkedinDescription
            )
        );
    }

    // The README is markdown, so the canonical markup goes through as written.
    const readme = [
        "# Tyler Flar",
        "",
        profile.bio.trim(),
        "",
        ...(master.researchInterests
            ? [`**Research:** ${master.researchInterests.trim()}`, ""]
            : []),
        `My projects and CV are at [tylerflar.com](${SITE}). I'm also on [LinkedIn](https://www.linkedin.com/in/tyler-flar/).`,
        ""
    ].join("\n");

    const githubBio = field("GitHub bio", profile.githubBio.trim(), LIMITS.githubBio);

    const problems = fields
        .filter((item) => item.length > item.limit)
        .map((item) => `${item.name}: ${item.length} characters, over the limit of ${item.limit}`);

    return {
        files: {
            "linkedin.md": `${sections.join("\n")}\n`,
            "github-readme.md": readme,
            "github-bio.txt": `${githubBio}\n`
        },
        fields,
        problems
    };
}

module.exports = { renderProfiles, LIMITS };
