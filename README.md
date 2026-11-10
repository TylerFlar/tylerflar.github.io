# tylerflar.github.io

My website, built with [Eleventy](https://www.11ty.dev/), plus the CV it shares its data with.

## Quick start

```powershell
npm install
npm run serve                 # dev server at http://localhost:8080, rebuilds on changes
npm run build                 # site output to docs/
npm test                      # every check: CV rules, placement, the rank, the standard, bullet budget, voice lint, profile limits (the same as npm run test:resumes)
npm run cv                    # regenerate _resumes/_cv.tex from master.yaml and cv.yaml, preview it as _resumes/output/cv.pdf, and check placement, the skill and course rank, the standard, two full pages and the bullet budget
npm run apply new <name> [from]  # start an application: a resume from every entry in master.yaml (or from application [from]'s)
npm run apply letter <name>   # add a cover letter, when it asks for one
npm run apply questions <name>   # add answers to its form's questions, read from Greenhouse when it's a Greenhouse job
npm run apply <name>          # build its resume, and its cover letter if it has one
npm run profiles              # LinkedIn and GitHub text, matching the CV, written to _resumes/output/profiles/
npm run hours                 # a project's typical week, measured from the commits behind the projects with a repo
npm run private:save [message]   # snapshot the private files (skills, applications, the voice guide) in their own history
```

Every push runs every check (`.github/workflows/ci.yml`): the tests, that `_cv.tex` matches `master.yaml` and `cv.yaml`, Prettier, the Eleventy build, `npm audit`, the site's internal links, and a build of the CV's PDF under TeX Live that fails unless it comes to `cv.yaml`'s `maxPages`. A push to `main` runs them as the first job of the deploy (`.github/workflows/deploy.yml`), so the site only deploys if they pass, with `/cv.pdf` being the PDF the checks built. When the CV has changed since the commit its last GitHub release was built from, the same PDF goes out as a new release. The checks also run on the first of each month, since the bullet budget reads the date. So regenerate `_cv.tex` (`npm run cv`, or `node _resumes/_generate.js` without TeX) in the same commit as a change to the CV.

## Where the text lives

| File | What it holds |
| --- | --- |
| `_resumes/data/master.yaml` | The record. Every entry in it has its facts here, every project page names one, and an application's resume picks from all of it. |
| `_resumes/data/cv.yaml` | The public CV: which sections, entries and bullets of the record print on `/cv.pdf`, held to two full pages, and why everything else is off. LinkedIn and the homepage show the same picks. |
| `_resumes/data/profile.yaml` | The about-me text that isn't on the CV: the homepage bio (a paragraph to each block), the projects intro, the LinkedIn headline and the GitHub bio. Each leads with the work and names no job to get. |
| `_resumes/data/website.yaml` | What's the homepage's own: the order its sections print in, a condensed school name and a paper's write-up link. |
| `_resumes/data/interests.yaml` | The "Outside of work" row on the homepage. |
| `src/content/projects/*.md` | Project pages. Each names its CV entry in `cv:` and has a `category`, a `role` and an `image`, its cover, and most have `links`. `coverFit: contain` shows a drawing or a chart whole on its card, where a photo is cropped to fill it, and `imageAlt` describes a cover that says something the text doesn't. |
| `_resumes/applications/` | Not in this repo: each application's folder, `about-me.md`, `contact.yaml` (the phone number a resume's heading prints) and `repos.yaml` (where each project's code is, for `npm run hours`). See [Private files](#private-files). |


## The record (`master.yaml`) and the CV (`cv.yaml`)

`master.yaml` is the record: every entry's facts live here, every project page names one, and an application's resume picks from all of it. It keeps every bullet worth having, however many an entry has, so nothing waits in a comment for the resume that wants it, and the [bullet budget](#the-record-masteryaml-and-the-cv-cvyaml) limits how many the CV and each resume print. Its `sections:` list sets the order and the headings everything picks from: Education, Skills, Experience, Projects, Publications, Honors & Awards, Leadership. Skills come right after Education, the order in the student templates of CMU, Georgia Tech, UMD, UCSD and Harvard CS, with each group one kind of thing (Languages, Machine Learning, LLM Agents, Robotics, Web, Databases, Cloud & DevOps, Systems & Tools). The CV orders the groups and the skills in them by [rank](#the-record-masteryaml-and-the-cv-cvyaml), so the order here only breaks ties. Experience holds the internships, the research and the tutoring and TA work together, newest first, the way LinkedIn lists them, and every rule for a role applies to all of them alike. To take something off everywhere, delete it.

`cv.yaml` picks the public CV from it, in the same form as an application's `resume.yaml` (see [The resume format](#the-resume-format)): a bare section title prints that section as `master.yaml` has it, and under a title each entry is `id: all` or a list of bullet ids. It takes `maxPages`, `coursework`, `sections` and `off`, and nothing else, so no headline or summary, no one-line heading, and no rewording: the CV prints `master.yaml`'s own words (`_resumes/_lib/cv.js`). It holds the CV to two full pages, since career centers put a master's student at one or two and readers rarely get past the first.

What the CV picks is what's public. LinkedIn (`npm run profiles`) lists the same entries with the same bullets and skills, and the homepage shows the same sections and entries, one line each, with the CV's projects as its cards and its skills as a card per group. Only the order is the homepage's own: `website.yaml`'s `order` lists the CV's section titles work first (Projects, Experience, Publications, then the rest), since a web page leads with the work where a student's CV opens on Education and Skills. It has to name every section the CV prints, so a section the CV gains fails the build until it has a place. The projects page keeps a page for every project in the record. Anything else the CV leaves off, like the NSF REU or the Baboons on the Move project, stays in `master.yaml` for the applications that want it.

**Rank.** The CV is picked by rank, the same whatever job it goes to, so it leads with what was done and aims at no role. Every role with budget left goes on, and so does the paper. Everything else ranks by its bullet budget (below): the work's share of the career, less what it's lost since it ended. Ties go to a result with a real number, then to newer work, and of two entries that show the same thing, the stronger goes on. The skills and courses rank by the work that shows them (`_resumes/_lib/rank.js`):

- a skill scores a point for each piece of work that lists it in its `skills:`, and one more when that work's own words (its tagline and bullets, or a paper's title and note) name it;
- a skill group, and each name in a skill's parentheses, scores the same way;
- a course scores a point for each piece of work whose words name its code;
- ties go to newer work, then to `master.yaml`'s order.

Every piece of work counts, whatever its budget, so this rank changes only when `master.yaml` does. The CV prints the top of each list in rank order, as much as fits, and `npm run cv` and the tests fail a pick that isn't, with the rank to pick from. An application's resume picks by its posting instead.

**Placement.** Everything in `master.yaml` is either on the CV or under `cv.yaml`'s `off`, with why:

- `room`: up to the standard but out for space, by key (`nsf-reu`, `e4e.baboons`, `tasque.audit`). An application's resume may still pick it.
- `below`: not up to the standard yet (no results to point at), so no resume prints it either.
- `skills` and `coursework`: what the CV leaves out, by group and by code.

A role that's still running is the exception: it's on the CV whatever its results so far, if only with one bullet, since career centers say to list a current position and keep it short while it's new (MIT, CMU, UCSD). Its bullets and subprojects are placed like any others. `cv.js` fails a running role that's left off or held under `off`. Once it ends, it's placed like anything else.

So something new (an entry, a bullet, a skill, a course) fails `npm run cv`, the tests, CI and the deploy until it's placed, and an `off` key that's gone from `master.yaml` or is on the CV too fails the same way. The cv skill (`.claude/skills/cv/SKILL.md`) is the rule for deciding, for a new item or a refresh.

**The standard** (`_resumes/_lib/standard.js`) is the same for the CV and every resume, and `npm run cv` and `npm run apply` fail until a document meets it:

- no headline or summary;
- 11pt;
- at most 6 courses;
- at most 15 skills in a group and 30 a page;
- every section newest first;
- every role prints at least one bullet;
- a role held to one bullet prints one that stands for the whole role, one its `oneBullet` names where it has the list;
- a website summary printed as a bullet passes the CV's bullet rules;
- nothing under `off.below`;
- full pages, with at most 8 lines free on the last one.

The CV also keeps at least 2 lines free, since the deploy's TeX Live sets XCharter a hair differently from MiKTeX. `npm run cv` says how much has to come out.

The loader (`_resumes/_lib/load.js`) checks `master.yaml` every time the site or the CV builds, and fails with a message that says what to fix. Its rules:

- **Tracks.** Each role has `track: research | industry | teaching`, which sets its typical week for the bullet budget. Each `kind: role` section lists the tracks it prints (Experience has `tracks: [industry, research, teaching]`), and every track is in exactly one section, so every role prints once.
- **Work type.** A role may set `workType: Remote | Hybrid | On-site`, which prints after its location on the CV ("La Jolla, CA (Hybrid)"), the homepage and LinkedIn, once when the location already says it (Leidos's location is Remote).
- **Rewordings.** A bullet with `rewords: <id>` is another wording of a bullet in the same list, kept for the documents that want it (E4E's `lead-zoo` rewords `lead`). A role's own bullet can reword one of its subprojects' as `rewords: <sub>.<id>` (E4E's `lead-rtt` rewords `rtt.modernized`). A document prints one or the other, never both, and `all` or a bare section title prints the original.
- **One bullet.** A role may set `oneBullet: [ids]`, the bullets that can stand for it alone, as `id` or `sub.id`. A document that prints just one of the role's bullets prints one of these, so a lead title never sits over a hands-on detail: E4E's are `lead-rtt`, `lead-zoo` and `lead`, which say what I led, and `lead-rtt` what I built and what came of it too.
- **Bullet budget** (`_resumes/_lib/budget.js`). `master.yaml` holds as many bullets as an entry has, and the budget limits how many of them the CV and each resume print. An entry's budget is measured against the career, which runs from the earliest start in `master.yaml`, education included (the BS, 2021-09), so the same work at the same point in a career gets the same budget at year 5 as at year 25, and each step just takes more years later on.
  - It earns bullets from its share of the career: its full-time months (the months it ran, up to today while it's still going, times a typical week over 40 hours) over the career's months. The week is 40 hours for industry roles, 20 for research, 10 for teaching and volunteering, and 3 for a project, unless the entry sets `hoursPerWeek`. Under 1/64 of the career earns 1 bullet, 1/64 earns 2, 3/64 earn 3, 7/64 earn 4, 15/64 earn 5, 31/64 earn 6 and 63/64 earn 7, with no cap. Today 1/64 of the career is about one full-time month.
  - A project's 3 hours is the one week that's measured. `npm run hours` (`_resumes/_hours.js`) estimates the hours behind each project that has a repo from its commits, the way git-hours does: commits less than two hours apart are one sitting, and each sitting gets two hours for the work before its first commit. Over the months those projects ran it came to 2.7 hours a week in November 2026, and my session logs for a few of those weeks agreed with the estimate. A side project is worked in bursts and then sits, and its months count from its first to its last, so its week is nothing like a job's. Every project takes the one number, since most have no history to measure by itself. So today a project earns one bullet until it has run about 13 months, and a job or a lab role is what earns more.
  - Once it ends, it loses a bullet for each whole quarter of the career that's passed since, so nothing is lost while it runs or for the first quarter after. A quarter is about 16 months in late 2026 and will be 6 years at year 24.
  - Its budget is what it earned less what it's lost. Because the career keeps growing, everything that has ended stops printing eventually, small things first. It stays in `master.yaml`, and its page comes off the site ([below](#when-an-entry-runs-out-of-budget)).
  - A role and its subprojects share one budget, and a subproject needs at least one CV bullet. A bullet counts when a document prints it, a website summary (`alt: true`) included.
  - A CV or resume that prints more of an entry than its budget, an entry at 0, or a skill that only entries at 0 back fails: `npm run cv` (after it writes the CV, so you can still look at it), `npm run apply <name>` and `npm run test:resumes`, so CI, the deploy and the CV release too. The dev server, `npm run build` and `npm run profiles` don't run it, so a month turning over never stops the site. A drop due within three months shows as a `budget note` first, and so does a page that's due off the site.
- **Skills** (`_resumes/_lib/skills.js`). Every skill falls under the work that shows it: each role, subproject, project and volunteering entry names its skills in its own `skills:` list, by the skill's full name or any name in it (`TypeScript` for JavaScript/TypeScript, `EC2` for the AWS line). Every skill needs at least one entry behind it, and so does each name in a skill's parentheses, so a skill or a listed service leaves the record with the last entry that used it, and no document prints it once every entry behind it is out of budget. A degree's `skills:` are the ones only its classes back; they count as one class, half a full-time month, ending with the degree, so they stop printing when a small project would. A paper's `skills:` are the ones my part of its work used. A paper has no budget to run out of, so they print for as long as the paper is in the record: the CV prints CHASER, and can still name ROS and the Bluetooth work after the class project behind it has aged out. The loader fails on a skill nothing backs, a claim that names no skill, or one that could name two.
- **Research Interests.** An optional top-level `researchInterests`, for an academic CV, is one line of topics: at most 110 characters, no first person, no closing period, printed by a `kind: research-interests` section. It's the only thing allowed at the top; a `headline` or `summary` key fails the build, in `master.yaml` and in `cv.yaml`. The CV has none.
- **Awards.** `awards:` is optional. Each award has a `name`, an `issuer`, a `term` like `Summer 2024` (or just a year) and an optional `note`, and the list needs a `kind: award` section once it has anything in it.
- **Coursework.** One education entry may carry a `coursework:` list, printed once after Education on the CV and under that degree on the homepage. The CV prints each course's title; its code (`CSE 252D`) is how `cv.yaml` or a resume picks it. There are no class pages.
- **Order.** Every dated list runs newest first: anything still running, then the latest end month, then the latest start (`_resumes/_lib/order.js`). When a role ends, move it down past the ones still running.
- **Project pages.** A page that names no `master.yaml` entry fails the build, so a project on the site is always in the record. And a project a document can still print is always on the site: `npm run cv` and the tests fail a project in budget that no page names (a draft doesn't count, since a full build leaves it out). Once its budget runs out, its page comes off the site ([below](#when-an-entry-runs-out-of-budget)) and the record keeps it.
- **What a heading prints.** A degree's `school`, `degree` and `field`, a role's `org` and `title`, a project's `name` and a subproject's `name` have to be there, or the CV would print "undefined" in their place.

Text uses a small markup, escaped for each target:

| Write | LaTeX | HTML |
| --- | --- | --- |
| `**bold**` / `*italic*` | `\textbf` / `\emph` | `<strong>` / `<em>` |
| `[text](url)` | `\href{url}{text}` | `<a href="url">` |
| `% & # $ _` | escaped | escaped |

Bullets use `>-` block scalars, dates are quoted `"YYYY-MM"` or `present` (an end still ahead is `"expected YYYY-MM"`), and a raw backslash is an error. At render time a bullet gets a closing period if it lacks one, and a lowercase first word is capitalized.

### When an entry runs out of budget

A budget that reaches 0 means no document prints the entry, or the skills (and names in parentheses) that only entries at 0 back. It stays in `master.yaml`: the record keeps everything, and it prints nothing itself, so it has no budget to keep to. `npm run cv` and the tests fail while the CV prints it, and `npm run apply` fails a resume that does. For the CV:

- move it to `off.room` in `cv.yaml`, with why, and the skills only it backed to `off.skills`;
- take off any `website.yaml` touch, since the homepage shows only what the CV does;
- reword `profile.yaml` if it names the entry (the bio is the homepage, LinkedIn's About and the GitHub README, and the headline and the GitHub bio name the internships and side projects);
- run `npm run cv` and `npm run profiles`, and update LinkedIn to match.

Its page comes off the site too, so the site shows the work a document can still print:

- delete the page in `src/content/projects/`, its pictures in `src/assets/images/projects/`, and any link to it from another page. `npm run cv` names each page that's due off in its `budget note` lines, and each one due within three months. They're notes, since deleting a page is my step to take, and nothing fails while one is late.
- A paper's write-up is the one exception. A paper has no budget to run out of, so the page `website.yaml` names as the write-up a paper came out of stays for as long as the CV prints the paper. FollowMe's page stays for CHASER, though the class project is out of budget.

With a project's week at 3 hours, most finished projects have one bullet, and it lasts a quarter of the career after the project ends, about 16 months in late 2026. Then the project's page goes.

An entry printed past its budget fails with the ids it prints, so cut the weakest from the pick and swap in a stronger one from `master.yaml` if there is one. Which entries are due next is in the `budget note` lines, three months ahead. To take an entry out of the record too, delete it from `master.yaml` along with the skills only it backed.

## Voice lint

`_resumes/_lib/voice.test.js` holds every CV bullet, publication and award note, project tagline, the Research Interests line, everything in `profile.yaml`, and the prose of every project page to a few writing rules: no long dashes, none of the words that read as model-written, bullets of one sentence and at most 220 characters, no bullet that says what the work is by what it isn't ("rather than", "instead of"), and no CV bullet that opens on an -ing word, since work that's still going is said in the plain present ("Build", not "Building"; website summaries may). A failure lists each hit with its file, line or entry, and the words around it.

## Profiles

`npm run profiles` renders LinkedIn and GitHub text from the CV (`cv.yaml`'s picks) and `profile.yaml`, word for word, so LinkedIn lists what the CV does and nothing else, and checks each field against its site's limit (headline 220, About 2,600, descriptions 2,000, GitHub bio 160). It writes nothing if a field is over. Paste from `_resumes/output/profiles/`.

## Applications

Each application gets a folder in `_resumes/applications/`. Most only need a resume, so that's what a new one starts with, and a cover letter or answers to the form's questions get added when an application asks for them. The whole folder is gitignored, because it shows where I'm applying and this repo is public.

1. `npm run apply new acme-robotics-intern` creates `_resumes/applications/acme-robotics-intern/`:
   - `resume.yaml`: every section and entry in `master.yaml` with budget left, each annotated with its budget and bullet ids, and each starting from the bullets the CV prints, then the rest in `master.yaml`'s order, up to its budget. A bullet marked `(rewords x)` is another wording of `x`, so pick one or the other. Delete what the job doesn't need, reorder the rest and pick bullets, then reword a bullet or trim a skill group if the job calls for it. Give the roles the job cares about 2 or 3 bullets before a weakly related one keeps its one: a role it needs less drops to one bullet, then comes off, and every role keeps at least one, as on the CV. A role held to one bullet prints one that stands for the whole role, one of its `oneBullet` where it has the list (the menu shows them as `one bullet:`). Internships go last, and the TA role goes first for a software job. No ATS documents rejecting on the years a resume's dates add up to (year screens are the form's own questions), so a resume doesn't need every role. It's held to one page with the one-line heading. To start from an earlier application's resume, name it last: `npm run apply new acme-robotics-2 acme-robotics-intern`.
   - `posting.md`: the job's link on its `Link:` line, any notes about where it came from, a `---` line, and the posting pasted below it to tailor against. Nothing builds from it, but the build reads the posting below the `---` (or below `Link:` if there's no `---`) to check the resume against it.
2. If it asks for a cover letter, `npm run apply letter acme-robotics-intern` adds:
   - `cover-letter.md`: front matter (`company` is required; `role`, `recipient`, `salutation`, `closing` and `date` are optional) and then your paragraphs, separated by blank lines.
   - `notes.md`: your answers about this job (have you used their product, why them, what connects you to it that isn't on the resume). The letter is written from these.
3. If its form asks questions, `npm run apply questions acme-robotics-intern` adds `answers.md`: an Answers list with each question word for word, its options or limit, ✱ if it's required, and the answer after its colon, ready to paste. A question that wants a paragraph or more gets its own heading. If it has a character limit, the limit goes in the heading, like `(2000 characters)`, and the answer to paste goes in a blockquote under it, so the notes around it aren't counted. When `Link:` is a Greenhouse job, the questions come straight from Greenhouse's public job board API, in the form's order; otherwise, or if Greenhouse can't be reached, you list them yourself.
4. `npm run apply acme-robotics-intern` writes `tyler-flar-resume.pdf` into the folder, plus `tyler-flar-cover-letter.pdf` once the letter has paragraphs. The letter uses the resume's one-line heading and has to fit on one page. The build prints:
   - how full the page came out, like `1 page, about 3 lines free`, or past `maxPages`, how much has to come out, like `about 13 lines too long` (counted in lines of bullet text, so a heading or the space between entries counts for more than one). A page with more than 8 lines free isn't full, and fails;
   - anything short of the standard the CV meets (see [Placement and the standard](#the-record-masteryaml-and-the-cv-cvyaml)), like a headline, a role with no bullets, a lead role held to a hands-on bullet, a skill group of 22, or something `cv.yaml` holds below the standard;
   - any entry printed past its bullet budget, or out of budget, and any skill that can't print for that reason, the same as the CV. These fail the build;
   - each reworded bullet as a word diff against the CV;
   - which of the CV's skills the posting names, and any the resume leaves off with the skill group to pick them from, like `not on this resume: Docker (skills: systems)`;
   - the voice lint's tells in the letter and in `answers.md`, as notes;
   - each answer in `answers.md` with a character limit, as its length once pasted against the limit, like `791 of 2,000 characters`. One that's over fails the build, since the form wouldn't take it.
5. When it's done, `npm run private:save` snapshots the folder in the [private history](#private-files). A build reads the CV as it is today, so building an old application again replaces its PDFs with today's wording, and that snapshot is what keeps the ones that went out. Nothing here records whether an application was sent or what came of it: this only builds them.

A cover letter isn't the resume again. It's where the reader meets you, so write it from `notes.md` and from `_resumes/applications/about-me.md`, which holds the answers that carry over between jobs and is shared by every application. Its Form answers section has the facts every form asks for (work authorization, start date, how salary answers are set and so on), each with the application it came from. `npm run apply` with no name lists your applications and what's built.

### How the page fill is measured

At the end of every document the preamble writes one line to the log: how tall the last page's text is with its spacing shrunk as far as TeX will shrink it, and how tall a page is. That's TeX's own test for whether a page fits, so `about 3 lines free` is room TeX would really use. When a resume runs past `maxPages`, the build compiles it once more on a single very tall page and compares the whole height against what the allowed pages hold. Every page also writes a line of its own as it ships, so `npm run cv` can say when an earlier page ends short, like `page 1 ends about 5 lines short: the next entry didn't fit, so it starts page 2`. All of these only add lines to the log, and the CV's text comes out the same, page for page, with or without them.

That's the fill on this machine. The deploy builds the PDF again under TeX Live, which sets XCharter a hair differently, so CI runs `node _resumes/_check-pdf.js`: it builds the committed `_cv.tex` the way the deploy does and fails unless it comes to `cv.yaml`'s `maxPages`.

### The resume format

`resume.yaml` starts from `master.yaml` and says what to keep, in what order. `cv.yaml` uses the same form without the one-line heading or rewordings, and adds its `off` list:

```yaml
coursework: [CSE 237D, CSE 237C]            # optional: false hides Relevant Coursework, a list keeps those courses (at most 6)
maxPages: 1                                 # optional, the build fails past this many pages
compactHeading: true                        # optional, one contact line instead of the CV's two
sections:
  - Education                    # a CV section's title prints it as on the CV
  - Experience:                  # a title with entries prints just those, in order
      arclab: all                # every bullet it has, if they fit its budget
      resmed: [docs-toolchain]   # just these bullets
      e4e:
        - lead
        - rtt.software           # subproject.bullet takes one bullet; rtt alone takes all of it
      leidos: [doj-monitoring]   # every role keeps at least one bullet
  - Teaching and Mentoring (role):   # your own title, with its kind in parentheses
      ta: all
  - Projects:
      jackdaw:
        - validation: >-         # a bullet reworded for this job
            Built a harness that plays the same moves in the real game and diffs
            the state across 275 scenarios.
      lycanworks:                # a reworded tagline, and the bullets to print under it
        tagline: A studio that sells avatar bases for VRChat
        bullets: [studio, release]
  - Publications:
      chaser:                    # a reworded note, on a paper or an award
        note: >-
          Contribution: the Bluetooth angle-of-arrival module, from a 4×4 antenna
          array to a heading back to the operator.
  - Skills:
      - languages                       # a whole skill group by key
      - cloud: ["AWS (Lambda, S3)", Docker]   # or just these skills from it, in this order,
                                              # and some of the names in a skill's parentheses
```

A mistake fails with what to write instead: an unknown section lists the CV's sections, an unknown bullet lists the entry's bullets, and a skill or course the CV doesn't have lists the ones it does.

### Rewording

A reworded bullet, tagline or note replaces the CV's wording on that resume only. Use it to name the part of the work a posting cares about, or to shorten a bullet so an entry fits. The build prints each one as a word diff against the CV, `[-removed-]` and `{+added+}`, and fails it if it breaks a rule the CV's text follows: the voice lint, one sentence of at most 220 characters for a bullet or note, and no number that isn't in the CV's text for that entry or on its project page. That catches a new or bigger number, not a stretched verb, so read the diff. A rewording that would help more than one application belongs in `master.yaml` instead.

Skills and coursework can be trimmed but not added to. A skill is picked by its name, or by the part before its parentheses (`AWS`), and a course by its code, so a resume can't list anything the CV doesn't. A pick with parentheses of its own keeps just those names, in that order: `AWS (Lambda, S3)` shows two of the services `master.yaml` lists, so a resume can show the ones its posting names. The CV shows the top three by rank.

## Layout notes

- The CV is held to `cv.yaml`'s `maxPages` (two) and an application's resume to its own (one). Pages after the first carry a "Tyler Flar – Page N" header.
- An entry stays in one piece: a role with its subprojects, a project with its bullets, a paper with its note. A page breaks between entries and nowhere inside one, so when the next entry doesn't fit, it starts the next page whole, and `npm run cv` says how short that left the page above. A section heading is a better break than any inside a section, so a section that doesn't fit whole moves to the next page.
- Text is XCharter (Bitstream Charter), T1-encoded, so every glyph is a Type 1 font with a Unicode map for parsers. Entry headings carry no bullet: the only bullets are the small dots in front of each line of work. Skills print one group to a line, its bold label run in ahead of its skills ("Languages: Python, ..."). A two-column table looked tidier, but text extractors that read a page in blocks took its label column apart from the skills, and CMU's guide says to avoid tables for that reason.
- A degree shows only when it ends ("Expected Mar 2027"), and coursework prints titles without codes.
- A subproject's italic heading prints only when it says something the bullets don't: dates of its own, or which of a role's two or more subprojects a bullet belongs to. A subproject that runs as long as its role leaves the dates to the role's line, and when it's the only one the role prints, its bullets join the role's list with no heading, which saves a line. That's how the career centers' samples do it: MIT's, CMU's and Stanford's name a lone project in the role's title line or a bullet, and MIT's master's sample and Gayle McDowell's own resume keep sub-headings for a role with several projects. LinkedIn keeps every subproject's line, since there it carries the project page's link.
- The CV is public, so its heading leaves the phone number off: under the name, San Diego, CA, then one line of contacts (email, site, LinkedIn, GitHub). A resume's and a cover letter's one-line heading keep the phone. This repo is public too, so the number isn't in it: the heading takes it from `_resumes/applications/contact.yaml` (`phone: "..."`), and a build without that file prints no phone and says so. Each PDF's title says what it is: "Tyler Flar – CV", "– Resume" or "– Cover Letter".
- `\resumeInterests` prints a labelled one-liner (Research Interests, Relevant Coursework) outside any list.

## The site

- **The site's own parts all come from its own host.** The font (Space Grotesk, under the SIL Open Font License) is served from `src/assets/fonts/`, the code colors are in `main.css`, and math is drawn to SVG at build time, so there's no font service, CDN or script to wait on. A test holds the templates and the stylesheet to that. The one thing a page loads from somewhere else is a video its write-up embeds: the Tasque page has one, from YouTube's no-cookie host.
- **Pictures.** Every picture on a page is one the image plugin made from `src/assets/images/`, in `docs/img/`. The originals don't deploy. A shared link previews with a 1200x630 JPEG that `.eleventy.js` makes from the page's cover, or with my portrait on a page that has none.
- **A project page** reads in one column: the text at about 80 characters a line, and its pictures, tables and code centered on the same axis. The layout prints the page's cover under its header, unless the write-up already places the cover itself.
- **The theme.** The dark theme's colors are written twice in `main.css`, once for the toggle and once for a visitor without JavaScript whose system is dark, and a test holds the two copies to each other.

## Private files

Some of this isn't in the repo, because it shows where I'm applying or is mine alone: the application folders with `about-me.md`, `contact.yaml` and `repos.yaml`, the voice guide (`_resumes/VOICE.md`), the Claude Code skills (`.claude/skills/`) and the LinkedIn text (`_resumes/output/profiles/`). The public `.gitignore` ignores all of it.

They have a history of their own: a second git repository over this same folder, in `.private.git`, which tracks only those paths (`_resumes/_private.js`).

```powershell
npm run private:save "what changed"     # snapshot them, if anything changed
npm run private -- log --oneline        # any git command against that history
npm run private -- diff HEAD~1 -- .claude
```

It has no remote. For a copy off this disk, add a private one: `npm run private -- remote add origin <url>`, then `npm run private -- push -u origin main`.

## Dependency notes

- `markdown-it-mathjax3` is pinned to 4.x. v5.2.0 runs the build out of memory (2 GB) where 4.x finishes in under a second, and `npm audit` is clean on 4.x.
- `markdown-it` stays on 14.x. `markdown-it-prism` (3.x and 4.x) only accepts a `markdown-it` below 15, so 15 installs with a broken peer.
- `markdown-it-prism` stays on 3.x. 4.0 stops putting the language class on `<pre>`, which is what the code-block styles in `main.css` select on.
- Dependabot (`.github/dependabot.yml`) opens a pull request each month for the rest, and holds these three back. CI runs on each one, the CV's PDF included.
- `actions/upload-pages-artifact` leaves dotfiles out from v4 on. The deploy passes `include-hidden-files: true`, since `.well-known/discord` is how Discord verifies the domain.
