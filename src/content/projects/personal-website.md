---
title: "This Website and CV"
summary: "My site, my CV and my LinkedIn and GitHub text, all built from one YAML file, with checks that keep them saying the same thing."
image: /assets/images/projects/personal-website/cover.png
date: 2025-12-02
cv: project/personal-website
category: software
role: "Built and maintain it"
links:
    - { label: Code, href: "https://github.com/TylerFlar/tylerflar.github.io" }
    - { label: CV, href: "/cv/" }
---

This site started in February 2024 as a Jekyll template I never filled in. In December 2025 I rebuilt it in [Eleventy](https://www.11ty.dev/), and since then it's grown into the system that holds my CV.

## One source

Everything about my work lives in one YAML file. From it, a few Node scripts write:

- a two-page CV as LaTeX, picked by a short second file, which GitHub Actions compiles into [/cv.pdf](/cv/)
- the homepage timeline, and the dates on every project card
- the text for my LinkedIn and GitHub profiles, checked against each site's character limits
- a resume for each job application, picked and reordered from the same file

A project page has to name its entry in the YAML, or the build fails. So a project on this site is always in the YAML, and the two can't disagree about its dates.

## What it checks

The loader fails the build, with a message that says what to fix, when:

- a dated list isn't newest first (still running, then the latest end, then the latest start)
- a bullet runs past 220 characters, or has a semicolon or a long dash
- a project page names a CV entry that doesn't exist
- the committed LaTeX no longer matches the YAML

It also budgets each entry's bullets against my career: an entry earns a bullet for each doubling of its share of the career, and once it ends, it loses one for each quarter of the career that's passed since. When an entry's budget runs out, the checks fail with everything that has to come off with it, down to the skills only it backed, so old work makes room for new.

A voice lint holds every bullet, profile line and project page, this one included, to how I write. It catches the words and dashes that make text read as generated. It can't make a sentence sound like me, so I still edit by hand.

All of it runs in GitHub Actions on every push: 158 tests, a check that the committed CV is current, Prettier, the Eleventy build, `npm audit` and a link check over the built site. Pushing to `main` deploys the site, and when the CV has changed since its last GitHub release, the same build's PDF goes out as a new one.

## Applications

`npm run apply new <name>` starts a folder for a job with every entry as its resume spec. I delete what the job doesn't need, pick bullets and reorder sections, and the build holds the resume to one page. A cover letter or answers to the form's questions get added only when the application asks for them, and a Claude Code skill in the repo drafts the letter from my own answers about the job, not from the resume.
