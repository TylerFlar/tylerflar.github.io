"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    parseGreenhouseLink,
    questionsUrl,
    questionLine,
    answersFromJob
} = require("./greenhouse.js");

// `npm run apply questions` writes a Greenhouse job's form into answers.md.
// These pin how a link is read and how the API's JSON becomes the Answers
// list, on a trimmed copy of a real job's JSON, so nothing goes over the
// network.

const job = {
    title: "Software Engineer, II - Map Enablement",
    company_name: "Torc Robotics",
    requisition_id: "R-102971",
    questions: [
        { label: "First Name", required: true, fields: [{ type: "input_text", values: [] }] },
        { label: "Phone", required: true, fields: [{ type: "input_text", values: [] }] },
        {
            label: "Resume/CV",
            required: true,
            fields: [
                { type: "input_file", values: [] },
                { type: "textarea", values: [] }
            ]
        },
        {
            label: "Are you local to Ann Arbor, MI?",
            required: true,
            fields: [
                {
                    type: "multi_value_single_select",
                    values: [
                        { label: "Yes" },
                        { label: "No" },
                        { label: "No, but I&#39;m willing" }
                    ]
                }
            ]
        },
        {
            label: "Check each that apply:",
            required: true,
            fields: [
                {
                    type: "multi_value_multi_select",
                    values: [{ label: "Cuba" }, { label: "None/Not applicable" }]
                }
            ]
        },
        {
            label: "Do you have an agreement   that may restrict you?  ",
            required: true,
            fields: [
                { type: "multi_value_single_select", values: [{ label: "Yes" }, { label: "No" }] }
            ]
        },
        { label: "LinkedIn Profile", required: false, fields: [{ type: "input_text", values: [] }] }
    ],
    location_questions: [
        { label: "Latitude", required: true, fields: [{ type: "input_hidden", values: [] }] },
        { label: "Location", required: true, fields: [{ type: "input_text", values: [] }] }
    ],
    compliance: [
        { type: "eeoc", questions: [{ label: "VeteranStatus" }] },
        { type: "eeoc", questions: [{ label: "Race" }, { label: "Gender" }] }
    ],
    demographic_questions: null
};

test("a Greenhouse job link gives its board and job id, and any other link doesn't", () => {
    const ref = { board: "torcrobotics", id: "8789483002" };
    assert.deepEqual(
        parseGreenhouseLink("https://job-boards.greenhouse.io/torcrobotics/jobs/8789483002"),
        ref
    );
    assert.deepEqual(
        parseGreenhouseLink("https://boards.greenhouse.io/torcrobotics/jobs/8789483002?gh_src=x"),
        ref
    );
    assert.deepEqual(
        parseGreenhouseLink(
            "https://boards.greenhouse.io/embed/job_app?for=torcrobotics&token=8789483002"
        ),
        ref
    );
    assert.equal(parseGreenhouseLink("https://jobs.lever.co/shieldai/59e0cf9b"), null);
    assert.equal(parseGreenhouseLink("https://greenhouse.io.example.com/x/jobs/1"), null);
    assert.equal(parseGreenhouseLink("(not given)"), null);
    assert.equal(
        questionsUrl(ref),
        "https://boards-api.greenhouse.io/v1/boards/torcrobotics/jobs/8789483002?questions=true"
    );
});

test("a question is its label word for word, ✱ if required, and what it takes", () => {
    const [first, , resume, local, check, agreement, linkedin] = job.questions.map(questionLine);
    assert.equal(first, "- First Name ✱:");
    assert.equal(resume, "- Resume/CV ✱ (a file):");
    assert.equal(
        local,
        "- Are you local to Ann Arbor, MI? ✱ (one of: Yes / No / No, but I'm willing):"
    );
    assert.equal(check, "- Check each that apply: ✱ (any of: Cuba / None/Not applicable):");
    assert.equal(
        agreement,
        "- Do you have an agreement that may restrict you? ✱ (one of: Yes / No):"
    );
    assert.equal(linkedin, "- LinkedIn Profile:");
    // The hidden latitude behind the location box isn't a question anyone answers.
    assert.equal(questionLine(job.location_questions[0]), null);
});

test("answers.md lists the form in order, with the location after the phone", () => {
    const text = answersFromJob(job, {
        link: "https://job-boards.greenhouse.io/torcrobotics/jobs/8789483002",
        date: "2026-10-26"
    });
    assert.match(
        text,
        /Torc Robotics's Greenhouse form for Software Engineer, II - Map Enablement \(R-102971\):/
    );
    assert.match(text, /read 2026-10-26/);
    const answers = text.split("## Answers\n\n")[1].trim().split("\n");
    assert.deepEqual(answers.slice(0, 4), [
        "- First Name ✱:",
        "- Phone ✱:",
        "- Location ✱:",
        "- Resume/CV ✱ (a file):"
    ]);
    assert.equal(
        answers[answers.length - 1],
        "- Voluntary self-identification (Veteran Status, Race, Gender): your call."
    );
});
