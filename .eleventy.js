module.exports = function (_eleventyConfig) {
    return {
        dir: {
            input: "src",
            includes: "_includes",
            data: "_data",
            output: "docs"
        }
    };
};