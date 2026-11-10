"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// A few things about the site's own files that nothing else would catch: the
// dark theme is written twice in main.css and has to match, and the templates
// ask no other host for a font, a stylesheet or a script. (A write-up can still
// embed a video, as the Tasque page does.)

const SRC = path.join(__dirname, "..", "..", "src");
const read = (...parts) => fs.readFileSync(path.join(SRC, ...parts), "utf8");

/** The declarations of the first rule that opens with `selector {`, as "name: value" lines. */
function declarations(css, selector) {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `main.css has a "${selector}" rule`);
    const open = css.indexOf("{", start);
    return css
        .slice(open + 1, css.indexOf("}", open))
        .split(";")
        .map((line) => line.trim().replace(/\s+/g, " "))
        .filter(Boolean);
}

test("the dark theme's two copies in main.css are the same", () => {
    const css = read("assets", "css", "main.css");
    // One for the toggle, one for a visitor without JavaScript whose system is dark.
    const chosen = declarations(css, '[data-theme="dark"]');
    const system = declarations(css, ':root:not([data-theme="light"])');
    assert.ok(chosen.length > 5, "the dark theme sets its tokens");
    assert.deepEqual(system, chosen);
});

test("every dark token overrides a light one", () => {
    const css = read("assets", "css", "main.css");
    const names = (rules) => rules.map((rule) => rule.split(":")[0]);
    const light = new Set(names(declarations(css, ":root")));
    for (const name of names(declarations(css, '[data-theme="dark"]'))) {
        assert.ok(light.has(name), `${name} is set for the light theme too`);
    }
});

test("the templates and the stylesheet load nothing from another host", () => {
    const files = [
        ["_includes", "partials", "head.njk"],
        ["_includes", "layouts", "base.njk"],
        ["_includes", "layouts", "project.njk"],
        ["pages", "cv.njk"],
        ["assets", "css", "main.css"]
    ];
    for (const parts of files) {
        const text = read(...parts);
        // A stylesheet, script, font or import with an absolute address.
        const outside = [
            /<link[^>]+rel="(?:stylesheet|preload|preconnect)"[^>]+href="https?:/i,
            /<script[^>]+src="https?:/i,
            /@import\s+(?:url\()?["']?https?:/i,
            /url\(["']?https?:/i
        ];
        for (const pattern of outside) {
            assert.doesNotMatch(text, pattern, `${parts.join("/")} loads from another host`);
        }
    }
});
