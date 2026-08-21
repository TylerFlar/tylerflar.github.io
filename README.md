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

`_resumes/data/master.yaml` **is the CV** — there is no separate CV spec. Every entry in the file appears on the generated CV, in file order, with all non-alt bullets. Nothing is curated in or out downstream, so **an entry that doesn't belong on the CV doesn't belong in the file**; take something off the CV by deleting it, not by deselecting it. The file also carries the CV's own `sections` (section order and headings). The CV deliberately has no `headline`, no `summary`, and no interests row, and the loader **fails the build** if `master.yaml` grows either key or that section — so an unattended regeneration can't switch one back on. Tailored variants set their own; putting one back on the CV means removing the guard in [`_resumes/_lib/load.js`](_resumes/_lib/load.js).

That one source renders into:

- **The CV** — `npm run gen:resumes` writes `_cv.tex` straight from `master.yaml`; CI compiles it and ships it as `/cv.pdf`. Generate it alone with `node _resumes/_generate.js _cv`.
- **Job-specific PDFs** — one spec per application in `_resumes/variants/<name>.yaml` selects a *subset* of the same content: entries and bullets by id, with inline one-off rewordings. `npm run gen:resumes` renders every spec to a `.tex` at the `_resumes/` root; `npm run build:resumes` compiles them (or `npm run resumes` for both). Variant specs are the only place selection happens.

  Writing one: select and reword ids that exist, never invent. Keep a `HONESTY NOTES` block recording the JD keywords you deliberately did **not** claim, so the next run doesn't quietly claim them — a claim that can't survive one follow-up question costs more than a missing keyword. Lead with the strongest quantified bullet, and keep numbers at their original grain ("121 failed attempts, 22 dead-letters", not "high reliability"): surveys of hiring managers put the rejection trigger on *genericness*, not on AI use, and a number that specific is the one thing a competitor can't fabricate. Before sending, check what a parser sees — `pdftotext -raw foo.pdf -` for reading order and `pdffonts foo.pdf` for glyphs that won't extract. Workday prefills work history from the upload and mis-maps often, so verify its dates by hand.

**Privacy:** job-specific variants (both the `variants/*.yaml` specs and their generated `.tex`) are gitignored — they reveal where you're applying, and this repo is public. Only the underscore-prefixed shared files are tracked (`_cv.tex`, `_preamble.tex`, `_heading.tex`, `data/*.yaml`). Keep your own backup of the variant specs; git does not have them.
- **The homepage timeline** — `src/_data/resume.js` computes the timeline at site build time from `master.yaml` + `_resumes/data/website.yaml`, so the website can never drift from the resumes.

Bullet text is canonical prose with a tiny markup, escaped per target (LaTeX/HTML):

| Canonical                  | LaTeX                  | HTML                  |
| -------------------------- | ---------------------- | --------------------- |
| `**bold**` / `*italic*`    | `\textbf` / `\emph`    | `<strong>` / `<em>`   |
| `[text](url)`              | `\href{url}{text}`     | `<a href="url">`      |
| `% & # $ _` (literal)      | escaped                | escaped               |
| `–` `—` `~` `×` `λ` `“ ”`  | `--` `---` `$\sim$` …  | literal               |

Rules: bullets always use `>-` block scalars (never wrap a line mid-word — YAML folding inserts a space); dates are quoted `"YYYY-MM"` or `present`; raw backslashes are a validation error (use a per-bullet `tex:`/`html:` override for anything the markup can't express). Bullets are normalized at render time to the house style — terminal punctuation always present, and a plain all-lowercase opening word is capitalized (mixed-case openers like `iOS`/`gRPC` are left alone; `tex:`/`html:` overrides bypass normalization). Markup goldens: `npm run test:resumes`.

Variant specs also take optional top-level keys and entry fields:

- `headline:` — one professional line rendered under the name in the heading (small caps).
- `summary:` — a short Summary section rendered first, before Skills.
- `blurb:` (on a role entry, as a per-variant override or in `master.yaml`) — one italic line of company/role context between the role heading and its bullets.
- `pageBreak: true` (on a section, in a variant or in `master.yaml`) — start that section on a fresh page. Rejected on the first section, which would leave page 1 empty.

The `sections:` block in `master.yaml` is the house format reference: section order is Skills → Professional Experience → Projects → Leadership & Volunteering → Education, and tailored variants repeat that order with trimmed entry lists. A variant may add an `interests` section, which the CV does not carry; it belongs at the top, ahead of Skills. Every collection in `master.yaml` must be rendered by some section — the loader rejects a collection no section covers, so dead content can't accumulate.

### Interests

`_resumes/data/interests.yaml` holds the short "what I'm into" row. It has two rendered shapes, one per surface — the website always shows it; a résumé shows it only where its spec declares an `interests` section, which the CV's does not:

- **Website** — emoji bubbles in the hero card, under a hairline rule and an `Interests` label that sets them apart from the bio and the link pills.
- **Résumé** — one flush-left line near the top (`\resumeInterests`): a small-caps label, then the picks separated by middots, with a hanging indent so a wrapped second line aligns under the picks rather than the label. Deliberately not a `\section` — it's a personal aside near the top, and a ruled heading would give it the same weight as Professional Experience. Text only; emoji don't survive pdflatex, so the LaTeX renderer drops them.

The file has two halves, and the split is the whole design:

- `bank:` — the vocabulary you may pick from, modelled on dating-app interest badges (Bumble ships ~200 across a dozen categories; Tinder "Passions" shows 3–5). Broad labels a stranger reads at a glance: **Cooking**, not "sous-vide short ribs". Categories exist to keep the bank browsable and are never displayed.
- `selected:` — the ids that actually show, in display order. Aim for 6–8; the loader refuses more than 10, rejects duplicates, and rejects any id the bank doesn't define (with the full bank in the error). Empty the list to drop the row from both surfaces.

An `interests` section is available to variant specs too, optionally narrowed with its own `items: [cooking, gym]`.

`selected:` is maintained by a Tasque **interests sync** run (`data/work-templates/interests-sync/`), which reads what he's actually been doing from his Tasque memories, rewrites the list, regenerates `_cv.tex`, and commits. The CV carries no `interests` section, so that regeneration is a no-op for the PDF — the sync's visible effect is the website hero row. `npm run test:resumes` is that run's contract — bank ids well-formed, every pick resolvable, every label LaTeX-safe, every emoji actually an emoji.

**Length is not fixed.** There is no page limit in the builder and none in the specs: a résumé runs as long as its content earns, and no longer. One page is a convention rather than a rule — the best test of it (ResumeGo, 482 recruiters over 7,712 resumes) found two-page resumes preferred 2.3× overall and 1.4× even for entry-level roles, so deleting real evidence to hit one page trades away the thing being measured. What the tools give you is measurement, not a ceiling — the generator prints an approximate word count per variant (`generated foo.tex (~480 words)`) and the build prints the real page count from the pdflatex log (`-> output/foo.pdf (2 pages)`). The one outcome to avoid is the 1.2-page document whose second page holds nothing but Education; go tight on one page or genuinely fill two. Two levers make a deliberate multi-page résumé read well instead of merely spilling:

- Pages after the first carry a `Tyler Flar — Page N` continuation header, so a page that gets separated still identifies itself. Page 1 suppresses it (the full name block is already there).
- `pageBreak: true` puts the break where you chose it, so a later page opens on a clean section boundary instead of a half-finished entry or a stray bullet carried over from the page before.

A page that is mostly white space is the one thing to avoid: either cut back to fill what you have, or add the substance that justifies it.

The generator refuses to overwrite a hand-written `.tex` (no `AUTO-GENERATED` header) unless run with `--force`; such files stay frozen at the `_resumes/` root and still compile. `--check` exits non-zero if any committed `.tex` is stale relative to its spec.

## Dependency notes

- `markdown-it-mathjax3` is pinned to 4.x. v5.2.0 is unusable here: its `deasync`-based renderer exhausts the JS heap (build OOMs at 2 GB; the 4.x build finishes in under a second). `npm audit` is clean on 4.x, so there is no security pressure to retry until upstream fixes it.
