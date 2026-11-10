(function () {
    var LIGHT_BG = "#f7f4ef";
    var DARK_BG = "#1d1b17";
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

    function storedTheme() {
        try {
            var value = localStorage.getItem("theme");
            return value === "light" || value === "dark" ? value : null;
        } catch (e) {
            return null;
        }
    }

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        var bg = theme === "dark" ? DARK_BG : LIGHT_BG;
        document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
            meta.setAttribute("content", bg);
        });
        // The label says what a press does, so it changes with the theme.
        var button = document.getElementById("theme-toggle");
        if (button) {
            button.setAttribute(
                "aria-label",
                theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
            );
        }
    }

    function init() {
        applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

        var button = document.getElementById("theme-toggle");
        if (button) {
            button.addEventListener("click", function () {
                var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
                try {
                    localStorage.setItem("theme", next);
                } catch (e) {
                    /* storage unavailable; theme still applies for this page */
                }
                applyTheme(next);
            });
        }

        prefersDark.addEventListener("change", function (event) {
            if (!storedTheme()) {
                applyTheme(event.matches ? "dark" : "light");
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
