---
title: "autopilot-mcp"
summary: "A browser for AI agents: a profile for every site, logins filled from my password vault without the agent ever seeing a password, and playbooks it can replay."
image: /assets/images/projects/autopilot/cover.png
date: 2026-09-20
cv: project/autopilot
category: software
role: "Personal project"
links:
    - { label: Code, href: "https://github.com/TylerFlar/autopilot-mcp" }
---

autopilot-mcp is an MCP server that gives an AI agent a real browser. I started it in April 2026 to replace a pile of one-site servers, each with its own selectors that broke whenever the site changed, and kept working on it through September.

It has 42 tools over [Camoufox](https://github.com/daijro/camoufox), a Firefox build for automation:

- **A profile per site.** Each site, keyed by its registrable domain, gets its own persistent profile, so logins stick and sites don't share cookies.
- **Parallel instances.** An agent can clone a profile into a temporary instance, so several agents can work on one site at once without sharing a page.
- **Playbooks.** A sequence of steps that worked can be saved and replayed in one call, with a JSON log of every run.
- **Uploads.** A small localhost file server hands local files to a page.

It has 129 tests.

## Fill, don't reveal

The part I cared most about is logins. An agent that types a password has the password in its prompt, in its tool calls and in every log they pass through. Here the agent asks the server to fill a login form from a vault entry, and the server fills it from Bitwarden itself, through one shared `bw serve` daemon. The agent learns that the form got filled, and never sees the password. Two-factor codes are computed locally, and the vault's master password stays in the OS keyring, never on disk or in an environment variable.

## What it doesn't solve

Hiding the password only keeps the password from leaking. Once the agent is logged in, it can still read anything on the page, a page can try to talk it into something, and it can click a button that does damage. The session cookies sit in the profile, too. Those need limits that live outside the model, like read-only modes and a person signing off on anything destructive.
