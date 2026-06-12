const markdownIt = require("markdown-it");
const markdownItMathjax3 = require("markdown-it-mathjax3");
const markdownItPrism = require("markdown-it-prism");
const Prism = require("prismjs");

// Load additional Prism languages
require("prismjs/components/prism-asm6502");
require("prismjs/components/prism-nasm");
require("prismjs/components/prism-verilog");

// Map shorthand language labels to existing Prism grammars
Prism.languages.asm = Prism.languages.asm || Prism.languages.nasm || Prism.languages.asm6502;
Prism.languages.systemverilog = Prism.languages.systemverilog || Prism.languages.verilog;

/**
 * Get a nested property value from an object using dot notation
 * @param {Object} obj - The object to traverse
 * @param {string} path - Dot-separated path to the property
 * @returns {*} The value at the path, or undefined
 */
function getByPath(obj, path) {
    return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

/**
 * Configure Markdown library with syntax highlighting and math support
 * @returns {Object} Configured markdown-it instance
 */
function createMarkdownLibrary() {
    return markdownIt({
        html: true,
        linkify: true,
        breaks: true
    })
        .use(markdownItMathjax3, {
            tex: {
                inlineMath: [["$", "$"], ["\\(", "\\)"]],
                displayMath: [["$$", "$$"], ["\\[", "\\]"]]
            }
        })
        .use(markdownItPrism);
}

/**
 * Register date formatting filters
 * @param {Object} eleventyConfig - Eleventy config object
 */
function registerDateFilters(eleventyConfig) {
    const dateFormatters = {
        default: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }),
        monthYear: new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" })
    };

    eleventyConfig.addFilter("readableDate", function (value, variant = "default") {
        if (!value) return "";
        const formatter = dateFormatters[variant] || dateFormatters.default;
        const date = value instanceof Date ? value : new Date(value);
        return formatter.format(date);
    });
}

/**
 * Register collection filtering utilities
 * @param {Object} eleventyConfig - Eleventy config object
 */
function registerCollectionFilters(eleventyConfig) {
    eleventyConfig.addFilter("filterByField", (collection = [], fieldPath, expected) => {
        if (!Array.isArray(collection)) return [];
        return collection.filter((item) => getByPath(item, fieldPath) === expected);
    });

    eleventyConfig.addFilter("rejectByField", (collection = [], fieldPath, expected) => {
        if (!Array.isArray(collection)) return [];
        return collection.filter((item) => getByPath(item, fieldPath) !== expected);
    });
}

/**
 * Skip any template with `draft: true` in frontmatter during full builds.
 * Drafts still render locally with `npm run serve` (and --watch).
 * @param {Object} eleventyConfig - Eleventy config object
 */
function registerDraftPreprocessor(eleventyConfig) {
    eleventyConfig.addPreprocessor("drafts", "*", (data) => {
        if (data.draft && process.env.ELEVENTY_RUN_MODE === "build") {
            return false;
        }
    });
}

/**
 * Configure computed data (back links, etc.)
 * @param {Object} eleventyConfig - Eleventy config object
 */
function registerComputedData(eleventyConfig) {
    const backLinkMap = {
        classes: { href: "/classes/", label: "Back to Classes" },
        projects: { href: "/projects/", label: "Back to Projects" }
    };

    eleventyConfig.addGlobalData("eleventyComputed", {
        backLink: (data) => {
            const tagList = Array.isArray(data.tags)
                ? data.tags
                : data.tags
                    ? [data.tags]
                    : [];

            for (const [tag, link] of Object.entries(backLinkMap)) {
                if (tagList.includes(tag)) return link;
            }
            return null;
        }
    });
}

module.exports = function (eleventyConfig) {
    // Register filters
    registerDateFilters(eleventyConfig);
    registerCollectionFilters(eleventyConfig);

    // Register computed data
    registerComputedData(eleventyConfig);

    // Skip drafts in full builds
    registerDraftPreprocessor(eleventyConfig);

    // Configure Markdown
    eleventyConfig.setLibrary("md", createMarkdownLibrary());

    // Passthrough copy for static assets
    eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
    eleventyConfig.addPassthroughCopy({ "src/.well-known": ".well-known" });

    return {
        dir: {
            input: "src",
            includes: "_includes",
            data: "_data",
            output: "docs"
        }
    };
};