---
title: "Fortune Telling with Panda Express"
summary: "A browser game where your Panda Express order decides your fortune, built by a team of eight to practice agile development in CSE 110."
image: /assets/images/projects/fortune-teller/cover.png
date: 2023-06-14
cv: project/fortune-teller
category: class
role: "Wrote the page flow, the first CI workflows and the JSDoc setup (eight-person CSE 110 project)"
links:
    - { label: Site, href: "https://cse110-sp23-group8.github.io/cse110-sp23-group8/" }
    - { label: Code, href: "https://github.com/cse110-sp23-group8/cse110-sp23-group8" }
    - { label: Docs, href: "https://cse110-sp23-group8.github.io/JSDocs/" }
---

CSE 110 (Software Engineering) in Spring 2023 put us in a team of eight to practice how software teams work: sprints, sprint reviews and retrospectives, architecture decision records (ADRs) and CI. The product mattered less than the process.

Ours is a parody Panda Express order. You pick a meal size, a side and up to three entrées, and each choice nudges a score. A fortune cookie at the end gives you a fortune to match (good, neutral, bad, romantic or just weird), along with the nutrition totals for your meal.

## What I did

- **The page flow.** I wrote the first layout, the page switcher that steps you through the order, and the code that picks your fortune at the end.
- **CI.** I wrote the team's first GitHub Actions workflows: Prettier formatting that commits its own fixes on every push and pull request, and a Jest job. Andrew Masek later replaced them with an npm-based setup that added ESLint, and Jack Montoro wrote the unit tests.
- **Docs.** I added JSDoc comments across the code and wrote the ADR that moved the generated docs into [their own repo](https://github.com/cse110-sp23-group8/JSDocs), so generated files couldn't trip the linter.
- **The repo.** I created it, merged most of the pull requests, and kept our meeting notes, sprint reviews and retrospectives in it. My 72 commits were the most of our 10 contributors.
