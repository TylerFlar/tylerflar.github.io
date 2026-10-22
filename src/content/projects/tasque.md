---
title: "Tasque"
summary: "A self-hosted platform that ran AI agents as scheduled jobs, which I vibe-coded to find out what AI coding agents can and can't build."
image: /assets/images/projects/tasque/cover.png
date: 2026-03-29
cv: project/tasque
category: software
role: "Built it by directing coding agents, as an experiment"
links:
    - { label: Code (archived), href: "https://github.com/TylerFlar/tasque2.0" }
---

Tasque was a self-hosted platform for running AI agents as jobs. You wrote a task in plain Markdown, and Tasque ran it as a Claude Code or Codex session on a schedule, from the command line, or from a Discord message, with only the tools that task needed. I used it as my personal assistant from May to October 2026. It sent me a morning brief, swept my inboxes, watched my classes, planned meals and workouts, and kept this website, my CV, LinkedIn and GitHub up to date. That last job is part of why I rewrote them by hand.

It was also an experiment. I built it almost entirely by directing coding agents, to see how far they could take a real system, and to have a reason to try LangChain and LangGraph, MCP servers, and proper monitoring.

## How it worked

![Tasque architecture: how a job came in, ran and reported back](/assets/images/projects/tasque/cover.png)

Every job was a row in one SQLite database, next to the schedules, workflow runs, notes and the files that jobs produced. A small daemon claimed the next job, gave the agent a short briefing (the task, what earlier jobs had found, the notes that applied), and started it with only the tools that job asked for. Work with several steps ran as a workflow that could fan out over a list and wait for my approval before doing anything that couldn't be undone. Every job and every tool call was traced with OpenTelemetry into a local Grafana dashboard.

## How it got built

The agents wrote the code. I wrote what I wanted, reviewed what came back, ran it, and pushed back when it was wrong. It took three versions. The first, in March, had nine always-on "coaches" built on LangChain and LangGraph, a Neo4j knowledge graph, and 24 MCP integrations. The second dropped the knowledge graph and turned the coaches into helpers. The third removed the standing agents and kept a plain job queue, and that's the one that lasted.

## What building it with AI taught me

- **Agents can build a lot.** The last version was about 27,000 lines of Python with 987 tests, and it ran 5,454 jobs. Nearly all of that code was written by agents.
- **Less autonomy worked better.** The always-on coaches demoed well and were miserable to depend on. When something didn't happen, the reason was buried in an agent's judgment, with no record to check. A queue where a model only ran inside a job I had created was much easier to trust.
- **"Done" didn't mean done.** Agents would exit cleanly having done nothing. So every job had to report its result back through Tasque's own MCP server before it counted, and a job that never reported was retried.
- **Rules written in prose didn't stick.** Notes like "keep this short" were ignored until the code enforced a limit.
- **More tools made it worse.** Every run loaded all 12 of my MCP servers. An audit of 400+ runs showed 6 were never called, but every run paid for them in its prompt. After that, each job declared the servers it needed.
- **Read the logs, not just the results.** All 389 runs in that audit used the largest model, including 146 that asked for a smaller one, because nothing passed the request along. Nothing failed, so I only found it by reading the run logs.

## What I think now

For a while Tasque was even applying to jobs for me, and some of those applications got me interviews. I don't use it for that anymore.

I think AI is a great tool, but it often makes decisions you aren't aware of, or blows things out of proportion. When it was applying to jobs, it heavily favored Tasque itself. And as the system grew, it got much harder to get exactly what I wanted out of it, because it struggled to see the bigger picture. Future models might do better with these shortfalls, but only time and experimentation will tell.

There also comes a point where, just because we can do something with AI, there's still the question of why. I really didn't need a super complex meal planner just because I could build one. It read photos of my groceries to keep track of my pantry, turned a recipe into a week of meal prep, and put whatever I was missing in my grocery cart.

The meal planner wasn't the only one. My morning brief picked an outfit from my closet based on the weather. The first version had nine always-on coaches for things like my health, career and finances, plus a strategist agent that broke my long-term goals into tasks. I didn't need most of that either.

Tasque is archived now, and the code is on GitHub.
