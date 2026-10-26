---
title: "Claude MCP Servers"
summary: "Eight MCP servers that gave Claude 271 tools for Canvas, Gmail and Google Calendar, Fitbit and five other services."
image: /assets/images/projects/mcp-servers/cover.png
date: 2026-04-16
cv: project/mcp-servers
category: software
role: "Personal project, for my agent platform Tasque"
links:
    - { label: Canvas, href: "https://github.com/TylerFlar/claude-canvas-mcp" }
    - { label: Multi-Google, href: "https://github.com/TylerFlar/claude-multi-google-mcp" }
    - { label: Fitbit, href: "https://github.com/TylerFlar/claude-fitbit-mcp" }
---

In spring 2026 my agent platform, [Tasque](/projects/tasque/), ran Claude on jobs that needed my coursework, email, calendar and health data. Claude reaches outside tools through the Model Context Protocol (MCP), so over about two weeks I wrote eight MCP servers in TypeScript, one per service, with 271 tools in all.

Three of them are public:

- **Canvas** (55 tools): courses, assignments, grades, discussions and files, through Canvas's REST API with an access token.
- **Multi-Google** (24 tools): Gmail and Google Calendar across several Google accounts, each picked by a nickname. It signs in with OAuth and saves each account's refreshed tokens on its own.
- **Fitbit** (40 tools): sleep, heart rate down to the minute, SpO2, activity and weight, through Fitbit's Web API with OAuth.

The other five work with sites that have no public API, so they stay private.

They're all built the same way: the MCP TypeScript SDK, a zod schema for every tool's input, and both a stdio transport and an HTTP one on Express.

Two weeks in, I replaced the servers that scraped or drove websites with one general browser server, [autopilot-mcp](/projects/autopilot/).
