# tylerflar.github.io

My website, built with [Eleventy](https://www.11ty.dev/), plus the CV it shares its data with.

## Quick start

```powershell
npm install
npm run serve                 # dev server at http://localhost:8080, rebuilds on changes
npm run build                 # site output to docs/
npm run test:resumes          # every check: CV rules, bullet budget, voice lint, profile limits
npm run cv                    # regenerate _resumes/_cv.tex and preview it as _resumes/output/cv.pdf
npm run apply new <name> [from]  # start an application: a resume from the whole CV (or from application [from]'s)
npm run apply letter <name>   # add a cover letter, when it asks for one
npm run apply questions <name>   # add answers to its form's questions
npm run apply <name>          # build its resume, and its cover letter if it has one
npm run profiles              # LinkedIn and GitHub text, written to _resumes/output/profiles/
```

Pushing to `main` deploys the site and builds `/cv.pdf` from the committed `_resumes/_cv.tex`. CI runs the tests and fails if `_cv.tex` doesn't match `master.yaml`, so regenerate it (`npm run cv`, or `node _resumes/_generate.js` without TeX) in the same commit.

## Where the text lives

| File | What it holds |
| --- | --- |
| `_resumes/data/master.yaml` | The CV. Every entry in it is on the CV, in file order, and the site reads its facts from here. |
| `_resumes/data/profile.yaml` | The about-me text that isn't on the CV: the homepage bio, the projects intro, the LinkedIn headline and the GitHub bio. |
| `_resumes/data/website.yaml` | Which entries and bullets the homepage timeline shows, plus display tweaks. |
| `_resumes/data/interests.yaml` | The "Outside of work" row on the homepage. |
| `src/content/projects/*.md` | Project pages. Each names its CV entry in `cv:` and has a `category`, `role` and `links`. |


## The CV (`master.yaml`)

`master.yaml` is the CV, not a source a CV is picked from. To take something off the CV, delete it. Its `sections:` list sets the order: Education, Industry Experience, Research Experience, Projects, Publications, Honors & Awards, Teaching, Leadership & Volunteering, Skills.

The loader (`_resumes/_lib/load.js`) checks the file every time the site or the CV builds, and fails with a message that says what to fix. Its rules:

- **Tracks.** Each role has `track: research | industry | teaching`, and `sections` has one `kind: role` section per track. Every role prints in exactly one section.
- **Bullet budget** (`_resumes/_lib/budget.js`). An entry's budget comes from the work behind it, in full-time months: the months it ran (up to today while it's still going) times a typical week over 40 hours. The week is 40 hours for industry roles, 20 for research and projects, and 10 for teaching and volunteering, unless the entry sets `hoursPerWeek`. Each doubling earns one more bullet: under 1 full-time month gets 1, 1 gets 2, 3 get 3, 7 get 4 and 15 get 5. A role and its subprojects share one budget. It's there to keep the work even, not as a cap: an entry over it still builds, and `npm run cv` and the tests list it as a note. Bullets marked `alt: true` are website-only and don't count.
- **Research Interests.** An optional top-level `researchInterests`, for an academic CV, is one line of topics: at most 110 characters, no first person, no closing period, printed by a `kind: research-interests` section. It's the only thing allowed at the top; a `headline` or `summary` key fails the build. The CV leads with industry now, so it has none.
- **Awards.** `awards:` is optional. Each award has a `name`, an `issuer`, a `term` like `Summer 2024` (or just a year) and an optional `note`, and the list needs a `kind: award` section once it has anything in it.
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

`_resumes/_lib/voice.test.js` holds every CV bullet, publication and award note, project tagline, the Research Interests line, everything in `profile.yaml`, and the prose of every project page to a few writing rules: no long dashes, none of the words that read as model-written, and bullets of one sentence and at most 220 characters. A failure lists each hit with its file, line or entry, and the words around it.

## Profiles

`npm run profiles` renders LinkedIn and GitHub text from `master.yaml` and `profile.yaml`, word for word, and checks each field against its site's limit (headline 220, About 2,600, descriptions 2,000, GitHub bio 160). It writes nothing if a field is over. Paste from `_resumes/output/profiles/`.

## Applications

Each application gets a folder in `_resumes/applications/`. Most only need a resume, so that's what a new one starts with, and a cover letter or answers to the form's questions get added when an application asks for them. The whole folder is gitignored, because it shows where I'm applying and this repo is public.

1. `npm run apply new acme-robotics-intern` creates `_resumes/applications/acme-robotics-intern/`:
   - `resume.yaml`: the whole CV, every section and entry, each entry annotated with its bullet ids. Delete what the job doesn't need, reorder the rest and pick bullets. It's held to one page with the one-line heading. To start from an earlier application's resume, name it last: `npm run apply new acme-robotics-2 acme-robotics-intern`.
   - `posting.md`: paste the job posting here to tailor against. Nothing builds from it.
2. If it asks for a cover letter, `npm run apply letter acme-robotics-intern` adds:
   - `cover-letter.md`: front matter (`company` is required; `role`, `recipient`, `salutation`, `closing` and `date` are optional) and then your paragraphs, separated by blank lines.
   - `notes.md`: your answers about this job (have you used their product, why them, what connects you to it that isn't on the resume). The letter is written from these.
3. If its form asks questions, `npm run apply questions acme-robotics-intern` adds `answers.md`: each question in a heading, word for word with its limit, and the answer under it, ready to paste.
4. `npm run apply acme-robotics-intern` writes `tyler-flar-resume.pdf` into the folder and prints its page count, plus `tyler-flar-cover-letter.pdf` once the letter has paragraphs. The letter uses the resume's one-line heading and has to fit on one page. The voice lint's tells in the letter and in `answers.md` print as notes.

A cover letter isn't the resume again. It's where the reader meets you, so write it from `notes.md` and from `_resumes/applications/about-me.md`, which holds the answers that carry over between jobs and is shared by every application. `npm run apply` with no name lists your applications and what's built.

### The resume format

`resume.yaml` starts from the CV and says what to keep, in what order:

```yaml
headline: Autonomy and robotics software   # optional line under the name
summary: A short paragraph at the top       # optional
fontSize: 10pt                              # optional, 11pt by default
coursework: false                           # optional, hides Relevant Coursework
maxPages: 1                                 # optional, the build fails past this many pages
compactHeading: true                        # optional, one contact line instead of the CV's two
sections:
  - Education                    # a CV section's title prints it as on the CV
  - Experience (role):           # your own title, with its kind in parentheses
      arclab: all                # every CV bullet
      resmed: [docs-toolchain]   # just these bullets
      e4e: [lead, rtt]           # a subproject id takes the whole subproject
      aquamesh: [aquaspectra.work]   # subproject.bullet takes one bullet
  - Projects:
      followme: all
  - Skills: [languages, robotics]    # skill groups by key, or a bare "Skills"
```

A mistake fails with what to write instead: an unknown section lists the CV's sections, and an unknown bullet lists the entry's bullets.

## Layout notes

- There's no page limit. Pages after the first carry a "Tyler Flar – Page N" header, and `pageBreak: true` on a section starts it on a new page.
- A heading never ends a page apart from its first bullet, and an entry's bullets stay together, so pages break between entries.
- `\resumeInterests` prints a labelled one-liner (Research Interests, Relevant Coursework) outside any list.

## Dependency notes

- `markdown-it-mathjax3` is pinned to 4.x. v5.2.0 runs the build out of memory (2 GB) where 4.x finishes in under a second, and `npm audit` is clean on 4.x.
