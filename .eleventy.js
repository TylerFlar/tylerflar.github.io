const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const markdownIt = require("markdown-it");
const markdownItMathjax3 = require("markdown-it-mathjax3");
const markdownItPrism = require("markdown-it-prism");
const Prism = require("prismjs");
const { default: Image, eleventyImageTransformPlugin } = require("@11ty/eleventy-img");
const { loadMaster, findCvEntry } = require("./_resumes/_lib/load.js");
const { dateRange } = require("./_resumes/_lib/markup.js");
const { compareNewestFirst } = require("./_resumes/_lib/order.js");
const { assertCategory } = require("./_resumes/_lib/pages.js");

// Load additional Prism languages
require("prismjs/components/prism-asm6502");
require("prismjs/components/prism-nasm");
require("prismjs/components/prism-verilog");

// Map shorthand language labels to existing Prism grammars
Prism.languages.asm = Prism.languages.asm || Prism.languages.nasm || Prism.languages.asm6502;
Prism.languages.systemverilog = Prism.languages.systemverilog || Prism.languages.verilog;

const SRC = path.join(__dirname, "src");
const OUT = path.join(__dirname, "docs");
// The page's light background (--bg in main.css), behind a picture that has
// transparent parts or doesn't fill its frame.
const PAGE_BACKGROUND = "#f7f4ef";

/**
 * Configure Markdown library with syntax highlighting and math support
 * @returns {Object} Configured markdown-it instance
 */
function createMarkdownLibrary() {
    const md = markdownIt({
        html: true,
        linkify: true,
        breaks: true
    })
        .use(markdownItMathjax3, {
            tex: {
                inlineMath: [
                    ["$", "$"],
                    ["\\(", "\\)"]
                ],
                displayMath: [
                    ["$$", "$$"],
                    ["\\[", "\\]"]
                ]
            }
        })
        .use(markdownItPrism);

    // Wrap every table in a scroll container. A bare <table> defaults to
    // width: auto, so it hugs the left edge instead of sitting in the centered
    // prose column; and a wide one would force the whole page to scroll
    // sideways. .table-wrap owns the width, the border, and the overflow.
    md.renderer.rules.table_open = () => '<div class="table-wrap">\n<table>\n';
    md.renderer.rules.table_close = () => "</table>\n</div>\n";

    return md;
}

/**
 * Register collection filtering utilities
 * @param {Object} eleventyConfig - Eleventy config object
 */
function registerCollectionFilters(eleventyConfig) {
    // Project pages whose CV entry is on the CV (the Projects section's `refs`,
    // from cv.yaml), so the homepage's cards are the CV's projects.
    eleventyConfig.addFilter("onCv", (collection = [], refs = []) => {
        if (!Array.isArray(collection)) return [];
        return collection.filter((item) => refs.includes(item.data.cv));
    });

    // Project pages in one group (research, software or class). Every page must
    // name a known category, so a page can't silently drop out of every group.
    eleventyConfig.addFilter("inCategory", (collection = [], category) => {
        assertCategory(category, "inCategory");
        for (const item of collection) assertCategory(item.data.category, item.inputPath);
        return collection.filter((item) => item.data.category === category);
    });
}

/**
 * Date project pages from the CV. Each page names its master.yaml entry in
 * `cv:` frontmatter; `cvDateRange` prints that entry's dates, and `newestFirst`
 * sorts on them by the rule the CV's own lists are held to
 * (_resumes/_lib/order.js), so a card can never show dates the CV doesn't, or
 * sit out of order when a project ends.
 * @param {Object} eleventyConfig - Eleventy config object
 */
function registerCvDateFilters(eleventyConfig) {
    // master.yaml is read and checked once a build, not once a card: these
    // filters run for every project page and every card that shows one.
    let loaded = null;
    const master = () => (loaded ??= loadMaster());
    eleventyConfig.on("eleventy.before", () => {
        loaded = null;
    });

    const cvRange = (ref, label) => {
        const { start, end } = findCvEntry(master(), ref, label);
        // A project that ran one month shows that month once.
        return dateRange(start, end, label);
    };

    eleventyConfig.addFilter("cvDateRange", (item) => cvRange(item.data.cv, item.inputPath));

    // A layout sees the page's own data, not its collection item, so the
    // project header passes the `cv` reference itself.
    eleventyConfig.addFilter("cvRange", cvRange);

    // Same start and end: the page's own date breaks the tie, newest first.
    eleventyConfig.addFilter("newestFirst", (collection = []) =>
        collection
            .map((item) => ({ item, dates: findCvEntry(master(), item.data.cv, item.inputPath) }))
            .sort((a, b) => compareNewestFirst(a.dates, b.dates) || b.item.date - a.item.date)
            .map(({ item }) => item)
    );
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
 * The picture a shared link previews with (og:image, twitter:image and the
 * homepage's JSON-LD): the page's cover, or my portrait on a page without one,
 * as a JPEG. A cover goes whole onto a 1200x630 card in the page's background
 * color, since no cover is that shape and a crop would cut a chart's axes. The
 * portrait is cropped square, for the small card a page without a cover gets.
 * Previews were the one use the original images had on the live site, so the
 * originals stay in src/ and no longer deploy.
 * @returns {Promise<{url: string, width: number, height: number}>}
 */
const socialImages = new Map();
function socialImage(src, { square }) {
    const key = `${square ? "square" : "card"}:${src}`;
    if (!socialImages.has(key)) {
        const size = square
            ? { width: 1200, height: 1200, fit: "cover" }
            : { width: 1200, height: 630, fit: "contain", background: PAGE_BACKGROUND };
        const made = Image(path.join(SRC, src), {
            widths: [1200],
            formats: ["jpeg"],
            urlPath: "/img/",
            outputDir: path.join(OUT, "img"),
            // A file's name is a hash of its source and options, and `transform`
            // isn't one of them: without a key of its own this would take the
            // name of the same picture's 1200px variant on its page.
            manualCacheKey: `social-${key}`,
            transform: (sharp) => sharp.flatten({ background: PAGE_BACKGROUND }).resize(size)
        }).then((stats) => {
            const { url, width, height } = stats.jpeg[0];
            return { url, width, height };
        });
        socialImages.set(key, made);
    }
    return socialImages.get(key);
}

/**
 * Configure computed data (back links, social images)
 * @param {Object} eleventyConfig - Eleventy config object
 */
function registerComputedData(eleventyConfig) {
    const backLinkMap = {
        projects: { href: "/projects/", label: "Back to Projects" }
    };

    eleventyConfig.addGlobalData("eleventyComputed", {
        backLink: (data) => {
            const tagList = Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [];

            for (const [tag, link] of Object.entries(backLinkMap)) {
                if (tagList.includes(tag)) return link;
            }
            return null;
        },
        // `image` is a page's cover (its front matter); site.image is the portrait.
        social: (data) => {
            const cover = typeof data.image === "string" ? data.image : null;
            const src = cover ?? data.site?.image;
            // Eleventy first calls this with stand-in data, to learn what it reads.
            if (typeof src !== "string" || !fs.existsSync(path.join(SRC, src))) return null;
            return socialImage(src, { square: !cover });
        }
    });
}

module.exports = function (eleventyConfig) {
    // Register filters
    registerCollectionFilters(eleventyConfig);
    registerCvDateFilters(eleventyConfig);

    // Register computed data
    registerComputedData(eleventyConfig);

    // Skip drafts in full builds
    registerDraftPreprocessor(eleventyConfig);

    // Configure Markdown
    eleventyConfig.setLibrary("md", createMarkdownLibrary());

    // Responsive image optimization: rewrites <img> in emitted HTML with
    // webp variants + srcset. Per-element attributes win over these defaults.
    // It reads each picture from src/, so the originals needn't be in docs/.
    eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
        formats: ["webp", "auto"],
        widths: [320, 640, 1280],
        htmlOptions: {
            imgAttributes: {
                loading: "lazy",
                decoding: "async",
                sizes: "(max-width: 700px) 100vw, 640px"
            }
        }
    });

    // An asset's URL with a hash of its contents, like "/assets/css/main.css?v=1a2b3c4d5e".
    // GitHub Pages caches each file for ten minutes, so without it a deploy can
    // pair new pages with the old stylesheet, which drops the new markup's styles.
    eleventyConfig.addFilter("versioned", (url) => {
        const contents = fs.readFileSync(path.join(SRC, url));
        const hash = crypto.createHash("sha256").update(contents).digest("hex").slice(0, 10);
        return `${url}?v=${hash}`;
    });

    // Passthrough copy for static assets. Not src/assets/images: every picture
    // on a page is one the image plugin made from it, in docs/img/, and the
    // originals are 33 MB that nothing on the site links to.
    for (const folder of ["css", "js", "icons", "fonts"]) {
        eleventyConfig.addPassthroughCopy({ [`src/assets/${folder}`]: `assets/${folder}` });
    }
    eleventyConfig.addPassthroughCopy({ "src/.well-known": ".well-known" });
    eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });

    // The site reads the CV and profile text from _resumes/data, outside src,
    // so `npm run serve` rebuilds when they change. The pictures aren't copied
    // any more, so they need watching too.
    eleventyConfig.addWatchTarget("./_resumes/data/");
    eleventyConfig.addWatchTarget("./src/assets/images/");

    return {
        dir: {
            input: "src",
            includes: "_includes",
            data: "_data",
            output: "docs"
        }
    };
};
