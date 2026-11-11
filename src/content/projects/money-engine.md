---
title: "Money Engine"
summary: "A personal finance assistant: Claude kept my ledgers and told me what was due through an MCP server I built, and no run signed in, paid or moved money."
image: /assets/images/projects/money-engine/cover.png
imageAlt: "Claude made one run a day, calling Money Engine's 21 tools, which read and wrote SQLite ledgers. Every run ended with two lists: to check, and to pay or move."
date: 2026-09-01
cv: project/money-engine
category: software
role: "Personal project, built by directing Claude Code"
---

Money Engine was my personal finance assistant. From September to November 2026 Claude ran it each day through an MCP server I built, and it kept my ledgers, worked out what was due, and kept my studio's books apart from mine.

It started inside [Tasque](/projects/tasque/), my agent platform, with ledgers that begin in September 2026. In October I moved it into its own Python package, with its own database and tool server. I built it by directing Claude Code, and every commit is co-authored by Claude.

The server has 21 tools over a SQLite database, through SQLAlchemy, and 57 tests. Every tool answers in JSON.

## The rules

Every run read the same rules before it did anything:

- **Amounts came from the ledger.** A run could only state an amount that the ledger held or a tool returned.
- **Numbers stayed masked.** Account and card numbers never appeared in full.
- **Claude didn't touch the money.** No run signed in to an account, paid a bill or moved money. It told me what needed doing, and I did it.

## What a run left me

Each run ended with two lists: what I needed to check, and what I needed to pay or move. Every line quoted its amount, account and due date from the ledger.

I stopped running it in November 2026. The code isn't public.
