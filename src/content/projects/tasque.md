---
title: "Tasque"
summary: "An agent platform I vibe-coded to find out what AI coding agents can and can't build."
image: /assets/images/projects/tasque/cover.png
date: 2026-03-29
cv: project/tasque
category: software
role: "Built it by directing coding agents, as an experiment"
links:
    - { label: Code (archived), href: "https://github.com/TylerFlar/tasque2.0" }
---

Tasque was an experiment in building with AI. I wanted to see how far coding agents could take a real system if I directed them and didn't write the code myself, and I wanted a reason to try LangChain and LangGraph, MCP servers, and proper monitoring. So I vibe-coded a self-hosted platform with Claude Code and Codex that ran AI agents as scheduled jobs, and used it as my personal assistant from May to October 2026. It also kept this website, my CV, LinkedIn and GitHub up to date, which is part of why I rewrote them by hand.

## What I learned

- **Agents can build a lot.** The last version was about 27,000 lines of Python with 987 tests, written by the agents while I reviewed it, ran it and corrected it. It ran 5,454 jobs before I shut it down.
- **Less autonomy worked better.** The first version had nine always-on agents built on LangGraph, plus a knowledge graph. It demoed well and was miserable to depend on. The version that lasted was a plain job queue, where a model only ran inside a job I had created.
- **"Done" didn't mean done.** Agents would exit cleanly having done nothing, so every job had to report its result back before it counted.
- **Rules written in prose didn't stick.** Notes like "keep this short" were ignored until the code enforced them.
- **More tools made it worse.** Every run loaded all 12 of my MCP servers, and an audit showed 6 were never called while every run paid for them.

The code is archived on GitHub.
