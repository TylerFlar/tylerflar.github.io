"use strict";

/**
 * The contact details that stay out of the public repo: the phone number a
 * resume and a cover letter print in their one-line heading. It lives in
 * _resumes/applications/contact.yaml, which is gitignored with the rest of that
 * folder (the private history keeps it), so no tracked file carries it and the
 * public CV never prints it.
 *
 *   phone: "(555) 010-0199"
 *
 * A build without the file prints no phone, and says so.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { renderTex } = require("./markup.js");
const { fail } = require("./fail.js");

const CONTACT_FILE = path.join(__dirname, "..", "applications", "contact.yaml");
const CONTACT_KEYS = ["phone"];

/** contact.yaml as { phone }, or null when there's no such file. */
function loadContact(file = CONTACT_FILE) {
    if (!fs.existsSync(file)) return null;
    return validateContact(yaml.load(fs.readFileSync(file, "utf8")));
}

function validateContact(contact) {
    const label = "contact.yaml";
    if (!contact || typeof contact !== "object" || Array.isArray(contact)) {
        fail(`${label}: expected "phone: ..."`);
    }
    for (const key of Object.keys(contact)) {
        if (!CONTACT_KEYS.includes(key)) {
            fail(`${label}: unknown key "${key}". It takes ${CONTACT_KEYS.join(", ")}`);
        }
    }
    const { phone } = contact;
    if (typeof phone !== "string" || !phone.trim()) {
        fail(`${label}: "phone" must be text, like "(555) 010-0199"`);
    }
    if (phone.replace(/\D/g, "").length < 10) {
        fail(`${label}: "phone" needs at least ten digits, and has "${phone}"`);
    }
    return { phone: phone.trim() };
}

/**
 * The lines the one-line heading reads (_heading.tex): the phone as printed,
 * and as the number its tel: link dials. Ten digits are a US number.
 */
function contactTexLines(contact) {
    if (!contact?.phone) return [];
    const digits = contact.phone.replace(/\D/g, "");
    const dial = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    return [
        `\\def\\resumePhone{${renderTex(contact.phone, "contact.yaml phone")}}`,
        `\\def\\resumePhoneTel{${dial}}`
    ];
}

module.exports = { loadContact, validateContact, contactTexLines, CONTACT_FILE };
