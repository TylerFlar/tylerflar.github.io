# tylerflar.github.io

My website, built with [Eleventy](https://www.11ty.dev/), plus the CV it shares its data with.

## Quick start

```powershell
npm install
npm run serve           # dev server at http://localhost:8080, rebuilds on changes
npm run build           # site output to docs/
npm run test:resumes    # every check: CV rules, bullet budget, voice lint, profile limits
node _resumes/_generate.js _cv   # regenerate _resumes/_cv.tex after editing master.yaml
npm run profiles        # LinkedIn and GitHub text, written to _resumes/output/profiles/
```

Pushing to `main` deploys the site and builds `/cv.pdf` from the committed `_resumes/_cv.tex`. CI runs the tests and fails if `_cv.tex` doesn't match `master.yaml`, so regenerate it in the same commit.

## Where the text lives

| File | What it holds |
| --- | --- |
| `_resumes/data/master.yaml` | The CV. Every entry in it is on the CV, in file order, and the site reads its facts from here. |
| `_resumes/data/profile.yaml` | The about-me text that isn't on the CV: the homepage bio, the projects intro, the LinkedIn headline and the GitHub bio. |
| `_resumes/data/website.yaml` | Which entries and bullets the homepage timeline shows, plus display tweaks. |
| `_resumes/data/interests.yaml` | The "Outside of work" row on the homepage. |
| `src/content/projects/*.md` | Project pages. Each names its CV entry in `cv:` and has a `category`, `role` and `links`. |


## The CV (`master.yaml`)

`master.yaml` is the CV, not a source a CV is picked from. To take something off the CV, delete it. Its `sections:` list sets the order: Research Interests, Education, Research Experience, Publications, Projects, Industry Experience, Teaching, Leadership & Volunteering, Skills.

The loader (`_resumes/_lib/load.js`) checks the file every time the site or the CV builds, and fails with a message that says what to fix. Its rules:

- **Tracks.** Each role has `track: research | industry | teaching`, and `sections` has one `kind: role` section per track. Every role prints in exactly one section.
- **Bullet budget** (`_resumes/_lib/budget.js`). An entry's `tier` sets how many bullets it prints: `flagship` 3, `standard` 2 (the default), `minor` 1 (the default for teaching and volunteering). A role with subprojects shares 4 across all of them. Bullets marked `alt: true` are website-only and don't count.
- **Research Interests.** The top-level `researchInterests` is one line of topics: at most 110 characters, no first person, no closing period. It's the only thing allowed at the top; a `headline` or `summary` key fails the build.
- **Coursework.** One education entry may carry a `coursework:` list, printed once after Education on the CV and under that degree on the homepage. There are no class pages.
- **Order.** Every dated list runs newest first: anything still running, then the latest end month, then the latest start (`_resumes/_lib/order.js`). When a role ends, move it down past the ones still running.
- **Project pages.** A page that names no CV entry fails the build, so a project on the site is a project on the CV.

Text uses a small markup, escaped for each target:

| Write | LaTeX | HTML |
| --- | --- | --- |
| `**bold**` / `*italic*` | `\textbf` / `\emph` | `<strong>` / `<em>` |
| `[text](url)` | `\href{url}{text}` | `<a href="url">` |
| `% & # $ _` | escaped | escaped |

Bullets use `>-` block scalars, dates are quoted `"YYYY-MM"` or `present` (an end still ahead is `"expected YYYY-MM"`), and a raw backslash is an error. At render time a bullet gets a closing period if it lacks one, and a lowercase first word is capitalized.

## Voice lint

`_resumes/_lib/voice.test.js` holds every CV bullet, publication note, project tagline, the Research Interests line, everything in `profile.yaml`, and the prose of every project page to a few writing rules: no long dashes, none of the words that read as model-written, and bullets of one sentence and at most 220 characters. A failure lists each hit with its file, line or entry, and the words around it.

## Profiles

`npm run profiles` renders LinkedIn and GitHub text from `master.yaml` and `profile.yaml`, word for word, and checks each field against its site's limit (headline 220, About 2,600, descriptions 2,000, GitHub bio 160). It writes nothing if a field is over. Paste from `_resumes/output/profiles/`.

## Tailored resumes

`_resumes/variants/*.yaml` specs pick entries and bullets from `master.yaml` by id for one application, and `npm run gen:resumes` renders them all. They're gitignored, because they show where I'm applying and this repo is public. Note that `gen:resumes` rewrites every variant's `.tex`; to regenerate only the CV, use `node _resumes/_generate.js _cv`. A spec whose bullets have since been deleted from `master.yaml` is reported as stale and skipped.

## Layout notes

- There's no page limit. Pages after the first carry a "Tyler Flar – Page N" header, and `pageBreak: true` on a section starts it on a new page.
- A heading never ends a page apart from its first bullet.
- `\resumeInterests` prints a labelled one-liner (Research Interests, Relevant Coursework) outside any list.

## Dependency notes

- `markdown-it-mathjax3` is pinned to 4.x. v5.2.0 runs the build out of memory (2 GB) where 4.x finishes in under a second, and `npm audit` is clean on 4.x.
