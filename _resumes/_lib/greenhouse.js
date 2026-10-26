"use strict";

/**
 * A Greenhouse job's application form, for answers.md. Greenhouse's public job
 * board API lists every question on a job's form, with its options and whether
 * it's required, so `npm run apply questions` writes them out from the job's
 * link in posting.md, word for word, and nobody has to copy them off the page.
 */

const API = "https://boards-api.greenhouse.io/v1/boards";

/**
 * The board and job id in a Greenhouse job link, or null for any other link:
 *   https://job-boards.greenhouse.io/torcrobotics/jobs/8789483002
 *   https://boards.greenhouse.io/torcrobotics/jobs/8789483002
 *   https://boards.greenhouse.io/embed/job_app?for=torcrobotics&token=8789483002
 */
function parseGreenhouseLink(link) {
    let url;
    try {
        url = new URL(String(link).trim());
    } catch {
        return null;
    }
    if (!/(^|\.)greenhouse\.io$/.test(url.hostname)) return null;
    const board = url.searchParams.get("for");
    const token = url.searchParams.get("token");
    if (board && token) return { board, id: token };
    const match = /^\/([\w-]+)\/jobs\/(\d+)/.exec(url.pathname);
    return match ? { board: match[1], id: match[2] } : null;
}

const questionsUrl = ({ board, id }) => `${API}/${board}/jobs/${id}?questions=true`;

/** The job and its form from Greenhouse's API. Uses Node's fetch, so Node 18 or later. */
async function fetchGreenhouseJob(ref) {
    const url = questionsUrl(ref);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Greenhouse answered ${response.status} for ${url}`);
    return response.json();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** A label as one line of plain text: entities decoded, spaces collapsed. */
function plain(text) {
    return String(text ?? "")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&(\w+);/g, (entity, name) => ENTITIES[name] ?? entity)
        .replace(/\s+/g, " ")
        .trim();
}

/** What a field takes when it isn't typed in: a file, or a pick from its options. */
function fieldHint(field) {
    const options = (field.values || []).map((value) => plain(value.label)).join(" / ");
    if (field.type === "input_file") return "a file";
    if (field.type === "multi_value_single_select" && options) return `one of: ${options}`;
    if (field.type === "multi_value_multi_select" && options) return `any of: ${options}`;
    return null;
}

/**
 * One question as a line of the Answers list: its label word for word, ✱ if
 * it's required, and what it takes. Null for a question the applicant never
 * sees, like the hidden latitude and longitude behind the location box.
 */
function questionLine(question) {
    const fields = (question.fields || []).filter((field) => field.type !== "input_hidden");
    if (!fields.length) return null;
    const hint = fields.map(fieldHint).find(Boolean);
    return `- ${plain(question.label)}${question.required ? " ✱" : ""}${hint ? ` (${hint})` : ""}:`;
}

// The EEO survey's labels run words together ("VeteranStatus").
const spaced = (label) => plain(label).replace(/([a-z])([A-Z])/g, "$1 $2");

/**
 * answers.md for a Greenhouse job, from the API's JSON: every question on its
 * form in order, the location box after the phone number as the form shows it,
 * and the voluntary self-identification questions named at the end.
 */
function answersFromJob(job, { link, date }) {
    const questions = (job.questions || []).map(questionLine).filter(Boolean);
    const location = (job.location_questions || []).map(questionLine).filter(Boolean);
    const phone = questions.findIndex((line) => /^- Phone\b/.test(line));
    questions.splice(phone + 1, 0, ...location);
    const voluntary = [
        ...(job.compliance || []).flatMap((block) => block.questions || []),
        ...(job.demographic_questions?.questions || [])
    ].map((question) => spaced(question.label));
    const role = `${plain(job.title)}${job.requisition_id ? ` (${plain(job.requisition_id)})` : ""}`;
    return [
        "# Application questions",
        "",
        `${plain(job.company_name) || "The company"}'s Greenhouse form for ${role}:`,
        link,
        "",
        `✱ marks a required question. The questions are from Greenhouse's job board`,
        `API, read ${date}, in the form's order.`,
        "",
        "<!--",
        "Answer each one after its colon, ready to paste. The facts every form asks",
        "for are in ../about-me.md under Form answers, and earlier applications'",
        "answers.md files show how the rest were answered. A question that wants a",
        "paragraph or more can get its own heading, with the answer under it. Put an",
        "answer that would fit other applications in about-me.md too.",
        "-->",
        "",
        "## Answers",
        "",
        ...questions,
        ...(voluntary.length
            ? [`- Voluntary self-identification (${voluntary.join(", ")}): your call.`]
            : []),
        ""
    ].join("\n");
}

module.exports = {
    parseGreenhouseLink,
    questionsUrl,
    fetchGreenhouseJob,
    questionLine,
    answersFromJob
};
