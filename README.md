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

## Resume system

Resume content lives once in `_resumes/data/master.yaml` (every role/project/course with id'd bullets) and is rendered into:

- **Job-specific PDFs** — one spec per application in `_resumes/variants/<name>.yaml` selects entries and bullets (by id, with inline one-off rewordings). `npm run gen:resumes` renders the specs to `.tex` files at the `_resumes/` root; `npm run build:resumes` compiles them (or `npm run resumes` for both). `variants/_cv.yaml` generates `_cv.tex`, which CI ships as `/cv.pdf`.

**Privacy:** job-specific variants (both the `variants/*.yaml` specs and their generated `.tex`) are gitignored — they reveal where you're applying, and this repo is public. Only the underscore-prefixed shared files are tracked (`_cv.tex`, `_preamble.tex`, `_heading.tex`, `variants/_cv.yaml`, `data/*.yaml`). Keep your own backup of the variant specs; git does not have them.
- **The homepage timeline** — `src/_data/resume.js` computes the timeline at site build time from `master.yaml` + `_resumes/data/website.yaml`, so the website can never drift from the resumes.

Bullet text is canonical prose with a tiny markup, escaped per target (LaTeX/HTML):

| Canonical                  | LaTeX                  | HTML                  |
| -------------------------- | ---------------------- | --------------------- |
| `**bold**` / `*italic*`    | `\textbf` / `\emph`    | `<strong>` / `<em>`   |
| `[text](url)`              | `\href{url}{text}`     | `<a href="url">`      |
| `% & # $ _` (literal)      | escaped                | escaped               |
| `–` `—` `~` `×` `λ` `“ ”`  | `--` `---` `$\sim$` …  | literal               |

Rules: bullets always use `>-` block scalars (never wrap a line mid-word — YAML folding inserts a space); dates are quoted `"YYYY-MM"` or `present`; raw backslashes are a validation error (use a per-bullet `tex:`/`html:` override for anything the markup can't express). Markup goldens: `npm run test:resumes`.

The generator refuses to overwrite a hand-written `.tex` (no `AUTO-GENERATED` header) unless run with `--force`; pre-migration variants stay frozen at the `_resumes/` root and still compile. `--check` exits non-zero if any committed `.tex` is stale relative to its spec.

## Dependency notes

- `markdown-it-mathjax3` is pinned to 4.x. v5.2.0 was evaluated on 2026-06-12 and rolled back: its `deasync`-based renderer exhausts the JS heap (build OOMs at 2 GB; the 4.x build finishes in under a second). `npm audit` is clean on 4.x, so there is no security pressure to retry until upstream fixes it.
