---
title: "Money Engine"
summary: "A personal finance assistant: Claude keeps my ledgers and tells me what's due through an MCP server I built, and no run signs in, pays or moves money."
image: /assets/images/projects/money-engine/cover.png
imageAlt: "Claude makes one run a day, calling Money Engine's 21 tools, which read and write SQLite ledgers. Every run ends with two lists: to check, and to pay or move."
date: 2026-09-01
cv: project/money-engine
category: software
role: "Personal project, built by directing Claude Code"
---

Money Engine is my personal finance assistant. Claude runs it each day through an MCP server I built, and it keeps my ledgers, works out what's due, and keeps my studio's books apart from mine.

It started inside [Tasque](/projects/tasque/), my agent platform, with ledgers that begin in September 2026. In October I moved it into its own Python package, with its own database and tool server. I built it by directing Claude Code, and every commit is co-authored by Claude.

The server has 21 tools over a SQLite database, through SQLAlchemy, and 57 tests. Every tool answers in JSON.

## The rules

Every run reads the same rules before it does anything:

- **Amounts come from the ledger.** A run can only state an amount that the ledger holds or a tool returned.
- **Numbers stay masked.** Account and card numbers never appear in full.
- **Claude doesn't touch the money.** No run signs in to an account, pays a bill or moves money. It tells me what needs doing, and I do it.

## What a run leaves me

Each run ends with two lists: what I need to check, and what I need to pay or move. Every line quotes its amount, account and due date from the ledger.

The code isn't public.
