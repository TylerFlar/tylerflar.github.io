---
title: "Tasque"
summary: "An agent platform I vibe-coded to see what AI coding agents can and can't build, and to try LangGraph, MCP servers and monitoring along the way."
image: /assets/images/projects/tasque/cover.png
date: 2026-03-29
cv: project/tasque
category: software
role: "Built it by directing coding agents, as an experiment"
links:
    - { label: Code, href: "https://github.com/TylerFlar/tasque2.0" }
---

Tasque was an experiment. I wanted to see how far AI coding agents could carry a real system if I mostly directed them instead of writing the code myself, and I wanted somewhere to try the tools everyone was talking about: LangChain and LangGraph, MCP servers, and real monitoring. So I vibe-coded a self-hosted agent platform with Claude Code and Codex and ran a lot of my life on it from May to October 2026.

You wrote a task in plain Markdown, and Tasque ran it as a Claude Code or Codex session on a schedule, from the command line, or from a Discord message. Mine sent a morning brief, swept my inboxes, watched my classes, planned meals and workouts, and kept this website, my CV, LinkedIn and GitHub up to date. That last job is part of why I rewrote this site by hand.

![Tasque architecture: how a job came in, ran and reported back](/assets/images/projects/tasque/cover.png)

## How it got built

The agents wrote the code. I wrote what I wanted, reviewed what came back, ran it, and pushed back when it was wrong. By the end the public core was about 27,000 lines of Python across 127 modules, with 987 tests. It took three versions to get there.

**Version 1 (March)** was the ambitious one: nine always-on "coaches" (health, career, finance and so on) running on LangChain and LangGraph, a Neo4j knowledge graph, a strategist agent that broke long-term goals into tasks, and 24 MCP integrations. It demoed well and was miserable to depend on. State lived in two places that kept drifting apart, and when something didn't happen, the reason was buried somewhere in an agent's judgment, with no record to look at.

**Version 2** dropped the knowledge graph and turned the coaches into optional helpers around an explicit work loop.

**Version 3** removed the standing agents entirely. It was a job queue, a scheduler, a workflow engine and a memory store in one SQLite file, and a model only ran inside a job that something had explicitly created. That's the version that held up, and it gave the agents the least freedom of the three.

## Where the agents fell short

Running thousands of jobs surfaced the same kinds of failure again and again. Each fix ended up as code.

- **"Done" didn't mean done.** Agent runs would exit cleanly having done nothing, or crash, drop their connection or hit a usage limit and still look finished. Tasque stopped trusting exit codes. Each run got a one-time token and had to report its result back through Tasque's own MCP server, and a run that never reported was retried.
- **Usage limits looked like errors.** The providers report a usage limit as an ordinary error, so the retry logic burned through its attempts in about ninety seconds while the limit was still in force. Now the reset time is read out of the message and the retry waits for it.
- **Rules written in prose were ignored.** Memory documents that said "keep this short" in their own text grew to tens of kilobytes, because every run appended to them. The fix was a size limit that the code enforces on every write.
- **Truncation dropped the middle.** Long memories were cut down to their first and last lines, and the middle, where the useful part usually was, disappeared. Now long documents are split into sections and the relevant ones are kept.
- **More tools made things worse.** Every run loaded all 12 of my MCP servers. An audit of 400+ runs showed only 6 were ever called, and every run paid for the other 6 in its prompt. Jobs now declare the servers they need.
- **Settings didn't carry through.** All 389 runs in that audit used the largest model, including 146 that asked for a smaller one, because nothing passed the request along.

## Monitoring

In September I added OpenTelemetry: one trace per job, from the schedule that fired it through the agent run to every MCP tool call, plus metrics and logs. It all fed a local Grafana stack (Prometheus, Tempo and Loki) that the daemon started in Docker, with a dashboard of cost, runs and failures by job type and model. Questions like the MCP audit, which had taken a one-off script, became a panel.

It turned up one bug of its own. PromQL's `increase()` never counts the first value of a new series, so Tasque's sparse counters quietly lost the first event in each one. The panels compute their ranges by hand instead.

## By the numbers

| | |
| --- | --- |
| Ran | May 15 to October 19, 2026 |
| Jobs | 5,454 |
| Dead-lettered for me to look at | 58 |
| Workflow runs | 533 |
| Schedules | 75 |
| Public core | about 27,000 lines of Python, 127 modules, 987 tests |

Tasque doesn't run anymore. The code is public if you want to look at how it worked.

## Code

- [github.com/TylerFlar/tasque2.0](https://github.com/TylerFlar/tasque2.0)
