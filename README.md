# tylerflar.github.io

Personal portfolio site built with [Eleventy](https://www.11ty.dev/).

## Quick Start

```powershell
npm install
npm run serve   # Dev server at http://localhost:8080
npm run build   # Output to docs/ for GitHub Pages
```

## Features

- **Math** — MathJax 3 via `$inline$` and `$$block$$` delimiters
- **Syntax highlighting** — Prism.js for fenced code blocks
- **Images** — Place in `src/assets/images/`, reference with `/assets/images/...`
- **Drafts** — Add `draft: true` to frontmatter; the page renders in `npm run serve` but is excluded from `npm run build` and from all listings

## Dependency notes

- `markdown-it-mathjax3` is pinned to 4.x. v5.2.0 was evaluated on 2026-06-12 and rolled back: its `deasync`-based renderer exhausts the JS heap (build OOMs at 2 GB; the 4.x build finishes in under a second). `npm audit` is clean on 4.x, so there is no security pressure to retry until upstream fixes it.
