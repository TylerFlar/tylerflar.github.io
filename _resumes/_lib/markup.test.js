"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    renderTex,
    renderHtml,
    renderBulletTex,
    formatMonthYear,
    formatYear,
    texDateRange
} = require("./markup.js");

// Golden fixtures lifted from real resume bullets — each exercises a chunk of
// the charmap exactly as it must appear in the generated .tex.

test("dollar amounts, percent, em dash (Leidos)", () => {
    const text =
        "Led a DOJ monitoring revamp: evaluated monitoring tools, authored a finance-backed " +
        "white paper, and rolled out probes + ServiceNow alerts—saving $120K/year and raising " +
        "critical portal uptime to 99.9%.";
    assert.equal(
        renderTex(text),
        "Led a DOJ monitoring revamp: evaluated monitoring tools, authored a finance-backed " +
            "white paper, and rolled out probes + ServiceNow alerts---saving \\$120K/year and raising " +
            "critical portal uptime to 99.9\\%."
    );
});

test("C# escaping (Leidos)", () => {
    assert.equal(renderTex("a C# parser"), "a C\\# parser");
    assert.equal(renderHtml("a C# parser"), "a C# parser");
});

test("tilde and en-dash frequency range (Radio Telemetry)", () => {
    assert.equal(renderTex("(~138–235 MHz)"), "($\\sim$138--235 MHz)");
});

test("times sign (Robotics)", () => {
    assert.equal(renderTex("a 10×10 ft arena"), "a 10$\\times$10 ft arena");
});

test("lambda (Programming Languages)", () => {
    assert.equal(renderTex("λ-calculus reductions"), "$\\lambda$-calculus reductions");
});

test("curly quotes (Tasque)", () => {
    assert.equal(renderTex("a “coach” planning agent"), "a ``coach'' planning agent");
});

test("bold span (endonav-sim)", () => {
    assert.equal(
        renderTex("Built **endonav-sim**, a seeded simulator"),
        "Built \\textbf{endonav-sim}, a seeded simulator"
    );
    assert.equal(
        renderHtml("Built **endonav-sim**, a seeded simulator"),
        "Built <strong>endonav-sim</strong>, a seeded simulator"
    );
});

test("italic span (Tasque hints)", () => {
    assert.equal(
        renderTex("cron *hints* rather than bindings"),
        "cron \\emph{hints} rather than bindings"
    );
    assert.equal(
        renderHtml("cron *hints* rather than bindings"),
        "cron <em>hints</em> rather than bindings"
    );
});

test("links (website project bullets)", () => {
    assert.equal(
        renderHtml("Projects: [Endoscopic Navigation](/projects/endoscopic-navigation/)"),
        'Projects: <a href="/projects/endoscopic-navigation/">Endoscopic Navigation</a>'
    );
    assert.equal(
        renderTex("see [tylerflar.com](https://tylerflar.com)"),
        "see \\href{https://tylerflar.com}{tylerflar.com}"
    );
});

test("ampersand in section titles and skills", () => {
    assert.equal(renderTex("Leadership & Volunteering"), "Leadership \\& Volunteering");
    assert.equal(renderTex("Web & App"), "Web \\& App");
    assert.equal(renderHtml("Web & App"), "Web &amp; App");
});

test("Weisfeiler–Lehman en dash (Algorithms)", () => {
    assert.equal(
        renderTex("Weisfeiler–Lehman color refinement"),
        "Weisfeiler--Lehman color refinement"
    );
});

test("raw backslash is rejected", () => {
    assert.throws(() => renderTex("bad \\textbf{input}"), /Raw backslash/);
});

test("unmapped non-ASCII is rejected", () => {
    assert.throws(() => renderTex("café"), /Unmapped non-ASCII/);
});

test("tex override bypasses canonical rendering", () => {
    const bullet = { text: "TLB misses vs. page faults", tex: "TLB misses vs.\\ page faults" };
    assert.equal(renderBulletTex(bullet), "TLB misses vs.\\ page faults");
});

test("date formatting", () => {
    assert.equal(formatMonthYear("2025-05"), "May 2025");
    assert.equal(formatMonthYear("present"), "Present");
    assert.equal(texDateRange("2025-05", "2025-09"), "May 2025 -- Sep 2025");
    assert.equal(texDateRange("2026-01", "present"), "Jan 2026 -- Present");
    assert.equal(formatYear("2021-09"), "2021");
    assert.throws(() => formatMonthYear("2025"), /Invalid date/);
    assert.throws(() => formatMonthYear("2025-13"), /Invalid month/);
});
