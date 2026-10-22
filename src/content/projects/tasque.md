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

I think AI is a great tool, but it often makes decisions you aren't aware of, or blows things out of proportion. When it was applying to jobs, it heavily favored Tasque itself. And as the system grew, it got much harder to get exactly what I wanted out of it, because it struggled to see the bigger picture.

My CV and this website had the same problems. I originally let an AI go through my GitHub and turn my work into a resume, and it oversold everything in a way that was obviously AI, which to me just reads as lazy. When I added a project later, it played that one up because it was new, even though it was just another project. And because I didn't write it, it missed the point of a lot of things. Here's one bullet it wrote about my [endoscopy research](/projects/endoscopic-navigation/):

> Built a procedural renal collecting-system generator (Python/NumPy) that emits a visual lumen mesh, collision proxy, SDF grid, centerline graph, waypoints, and stones for a real-time Unity/Gym simulator…

That's all true, but it never says why I built a simulator in the first place. We want a robot to navigate a kidney on its own, but we can't just have it testing on a real patient, and a 3D print isn't visually believable enough. It also never says why I moved the simulator from Python to Unity. Only I knew those things, because I made those decisions, and in research that's the important part. Future models might do better with these shortfalls, but only time and experimentation will tell.

It reaches a point where it's not "what can we do?" but "why would we even want to do this?" I really didn't need a super complex meal planner just because I could build one. It read photos of my groceries to keep track of my pantry, turned a recipe into a week of meal prep, and put whatever I was missing in my grocery cart.

The meal planner wasn't the only thing like that. My morning brief picked an outfit from my closet based on the weather. The first version had nine always-on coaches for things like my health, career and finances, plus a strategist agent that broke my long-term goals into tasks. I didn't need most of that either.

When you use AI for everything, it's also hard to go back, and I've fallen into that trap too. Before AI, I thought really hard about little things when I coded, because I knew exactly how everything worked, and being that close to the code made me notice more. Smaller features got tested more, too, since it was normal to run the code over and over after the smallest change. And because AI can do so much so quickly, going back sounds worse on paper. It reminds me of the SpongeBob episode where King Neptune makes a pile of Krabby Patties that look fine on the surface, and SpongeBob makes one really good one, even though it takes forever.

I'll admit AI is probably hyped way more than it should be. There's a huge gap between how useful it actually is and what people say about it. A lot of people seem to think you can just make things with AI and don't need someone who knows what's going on, and I think that's a big part of why job security feels so scary right now. Saying how you used AI, and what you learned about its imperfections, is a lot better than using it blindly.

Tasque is archived now, and the code is on GitHub.
