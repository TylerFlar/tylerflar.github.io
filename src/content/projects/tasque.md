---
title: "Tasque"
summary: "A local-first daemon that runs long-horizon agent work as durable, restartable jobs."
image: /assets/images/projects/tasque/cover.png
date: 2026-07-30
date_range: "Mar 2026 – Present"
---

I use coding-agent CLIs for work that doesn't fit in a chat window: multi-hour jobs, jobs that should run at 7am whether or not I'm awake, jobs whose output the *next* job needs. A terminal session is the wrong container for that. Nothing survives a crash, nothing is scheduled, nothing is auditable, and "did that actually finish?" is answered by scrolling.

**Tasque** is the container. It's a single-user daemon that runs on my own machine, where the durable state is one SQLite file and a model-backed agent is just a subprocess that gets leased a job, handed a context packet, and required to report back through a tool call.

![Tasque architecture: intake to daemon to provider run, and the result path back](/assets/images/projects/tasque/cover.png)

---

## Two rewrites to get to boring

The first version, in March, was the ambitious one: nine autonomous "bucket coaches" (health, career, finance, …) over LangGraph, a Neo4j knowledge graph, a strategist agent decomposing long-horizon goals into per-bucket initiatives, and 24 MCP integrations. Every coach self-scheduled its own next run.

It demoed well and was miserable to depend on. Two problems dominated:

- **Two sources of truth.** Orchestration state lived in SQLite, semantic state lived in the graph, and they drifted. Reconciling them was a permanent tax.
- **Failures had no address.** When something didn't happen, the reason was somewhere inside a coach's judgment about its own priorities. There was no row to look at.

The second version deleted the knowledge graph and demoted the coaches from always-on drivers to optional interfaces around an explicit work loop. The third—this one—removed the standing agents entirely. Nothing in Tasque 2.0 has the job of deciding what to do next: there's a queue, a scheduler, a workflow engine, and a memory store, and the model only ever runs inside a work item that something explicitly created. Everything the earlier versions did as *agent behavior*, 2.0 does as *data*.

That's the actual arc of this project, and it's the opposite of the one I expected: the useful system was the one with less autonomy in it.

---

## The work item is the unit

Everything that runs is a `work_item` row—a title, a task instruction, a worker kind, and a JSON runtime contract. Around it sits the machinery you'd want from any job runner, because agent work fails in all the ordinary ways plus a few new ones:

| Field | What it buys |
|---|---|
| `priority`, `not_before` | ordering, and deferral without a sleeping thread |
| `deadline_at` | a window that can close (see below) |
| `idempotency_key` | a unique constraint, so double-enqueue is a no-op |
| `max_attempts`, `retry_policy` | bounded retries per item |
| dependencies | a row per blocked/blocker pair, with a condition |

Each try is its own `work_attempt` row rather than a mutated counter, so an item that succeeded on attempt three still carries what happened on attempts one and two—provider, model, exit code, error type, timing, and the artifacts each run produced. Items that exhaust their attempts land in `failed_work`, a real dead-letter table with a resolution note, not a log line.

`deadline_at` is the one that isn't obvious. Work that missed its window must not simply run late:

```python
for work_item in candidates:
    if self._deadline_passed(work_item, now):
        # Time-sensitive work whose window closed must not run late
        # (e.g. a daily trading step resuming a day after the daemon was
        # down). Abandon it instead of claiming it.
```

The daemon's tick is small and boring on purpose: poll schedules, advance workflow runs, claim ready work under a lease, run it. Concurrency is bounded by SQLite's single writer—the claim step is serialized with a process lock and committed before the lock releases, and no write lock is ever held across a subprocess, so N provider runs happen in parallel while exactly one of them can claim any given item.

---

## Knowing that a run actually finished

This is the part I got wrong first and care most about now.

The naive design is: launch the CLI, wait, parse the last thing it printed, mark the item done. That does not survive contact with real agent processes. They stream JSON, get killed, drop sockets mid-response, hit subscription usage limits, echo tool-call XML into their own text, and—worst—exit `0` having accomplished nothing at all.

So Tasque inverts it. Success is not something the runner parses out of stdout; it's a **write the agent has to perform**. Every attempt mints a fresh token, embeds it in the context packet, and the agent is required to call `submit_worker_result` through Tasque's own MCP server. That tool deposits the payload into a table; after the subprocess exits, the runtime reads and consumes it:

```python
payload = result_inbox.read_and_consume(result_token, agent_kind="worker")
if payload is None:
    # No worker result was deposited. The agent never reached
    # submit_worker_result -- the provider crashed, the API socket
    # dropped, it timed out, or it exited without submitting. None of
    # these is the agent's reported task outcome, so treat them as
    # transient/infra failures that are worth retrying.
    raise TransientProviderError(...)
```

That one distinction—*infrastructure failed* versus *the task failed*—is what makes retries safe. They're different rows, they get different policies, and only one of them counts against the item's attempt budget:

| Outcome | Signal | Handling |
|---|---|---|
| Task succeeded | payload with a summary, report, and `produces` | attempt closes, outputs recorded |
| Task failed | payload with `status: failed` | genuine failure, counts against `max_attempts` |
| Agent blocked | `status: blocked` / `awaiting_user` | recorded as a completion signal, not an error |
| Nothing submitted | no row for the token | transient; retried with a floor of 3 attempts regardless of `max_attempts` |

The retry floor exists because a single dropped socket used to permanently dead-letter work that had never really been attempted. And one class of transient failure needed its own handling entirely—providers report subscription limits as ordinary errors:

> You've hit your session limit · resets 11:40am (America/Los_Angeles)

Retrying that on the 30-second transient cadence burns the entire retry floor in ninety seconds while the limit is still in force. That is exactly how a job of mine dead-lettered on 8 July. Limit-shaped messages are now parsed for their stated reset time and timezone, and the retry is scheduled just after it instead—falling back to a 30-minute backoff when there's no parseable time, and capped at 12 hours.

Everything the provider emitted—stdout, stderr, the raw stream, and a readable markdown trace of the tool calls—is captured as artifacts on the way through, so a run that went wrong can be read back after the fact rather than reconstructed.

---

## Workflows are data

Multi-step work is a JSON DAG that gets materialized into node and edge rows at start time. Four node kinds cover what I've actually needed: `work`, `fan_out`, `join`, and `gate`.

![A workflow run: collect, fan out over items, join, human gate, report](/assets/images/projects/tasque/workflow-dag.png)

```json
{
  "key": "apply",
  "kind": "fan_out",
  "depends_on": ["collect"],
  "items_from_output": "collect.roles",
  "tolerate_child_failures": true,
  "child_worker_kind": "provider.default",
  "child_title_template": "Apply to {item[company]}",
  "child_task_instruction_template": "Draft and submit an application for {item[role]} at {item[company]}."
}
```

Two details earned their complexity. `tolerate_child_failures` rewrites the fan-out's downstream edges from `succeeded` to `finished` and downgrades a dead-lettered child to `failed_tolerated`—so one child failing out of twelve doesn't sink the run, and the report node still executes and can *account for* the gap. And a `gate` node parks the whole run at `awaiting_input`, which surfaces in Discord as a message with buttons; answering it resumes the run from that node.

Since nodes are rows, a run is inspectable and restartable at any point. The daemon just asks which nodes have satisfied dependencies and starts those.

---

## Context is budgeted, and the ledger isn't the agent's to rewrite

Before a provider runs, Tasque assembles a context packet: the work item, its task context, the parent work item that spawned it, the workflow run's state, relevant memories, recent artifacts, and recent events. Every section is size-limited, with a note telling the agent to use the MCP read tools when it needs more—the packet is a starting point, not the whole world.

Memory is namespaced, with canonical keys for documents that should be updated in place (supersede, archive, pin, TTL, importance). Retrieval is hybrid: SQLite FTS5 for keyword matching fused with vector similarity. The default embedder is pure-stdlib feature hashing, which means memory works offline, deterministically, and in tests with zero setup; a real model is used only when an API key is configured. Vectors are packed `float32` in a side table and scored by brute-force dot product, because at one person's data volume that is sub-millisecond and a vector database would be a dependency bought with nothing.

Two findings from actually living with it:

**Prose is not enforcement.** Several canonical documents politely asked, in their own text, to stay small ("small pointer record only"). They grew to tens of kilobytes anyway—every run reads the doc, appends to it, and hands the next run more to re-emit. The fix was to make the limit a fact the write path can check, declared by the document itself so no central registry has to know a worker's keys:

```markdown
<!-- tasque:max_chars=4000 -->
```

A canonical write over its declared budget is now rejected with an error telling the worker to compact rather than append.

**Truncation deletes the middle, which is where the signal is.** The original builder compressed every long memory to a fixed head-and-tail window, so a 14k-character ledger reached the worker as its first and last twenty lines with everything between them gone. Long documents are now split into sections and ranked lexically against the run (with an optional recency bias for append-style logs), then reassembled in original order.

There's also a category of state the agent shouldn't be able to rewrite at all. Extension-registered digests are computed in code from append-only ledger tables that workers write through validated tools, and injected into matching context packets—ground truth the agent reads but cannot revise, unlike its own memories.

---

## Both ends of MCP

Tasque sits on both sides of the Model Context Protocol, which is easy to conflate and worth separating.

**It serves.** Every provider run launches with Tasque's own stdio MCP server attached—64 tools that let the worker read and write the same database the daemon is using: memory search and canonical upserts, artifact capture, work enqueue and retry, schedule CRUD, workflow start, and `submit_worker_result`. This is how a worker does durable things instead of narrating them. Read tools take a required `intent` string, which is a small forcing function: state why you're looking before you look, and leave that reason in the captured trace.

**It hosts.** The worker subprocess also loads *outside* MCP servers, and that's where most of the reach into the world actually comes from—browser automation, calendar and mail, health data, GitHub, image generation, Discord. Several of those are servers I wrote for exactly this purpose, including [autopilot](https://github.com/TylerFlar/autopilot-mcp), a browser-automation server whose credential injection is Bitwarden-backed so a password is typed into a page without ever entering the agent's context.

**And loading everything has a price.** Claude Code inherits every user-scope MCP server unless it's launched with `--strict-mcp-config`, so for months each worker started with all 12 of mine injected. Parsing `tool_use` blocks across 400-plus runs, only 6 were ever called—`blender`, `canvas`, `figma`, `slack`, and `agentmemory` were never invoked once, while their tool schemas were paid for on every single run. A work item now declares what it needs:

```json
"runtime_contract": {
  "mcp_servers": ["autopilot", "github"],
  "model_profile": "low"
}
```

with `TASQUE2_DEFAULT_MCP_SERVERS` as the baseline for items that declare nothing, and inherit-everything preserved when neither is set. The same audit found a second leak next to the first: all 389 runs in that window had executed on the largest model, including 146 that explicitly declared a `low` or `medium` tier, because the model came only from an env-global profile and no contract key could lower it.

Neither leak was visible from the outside—the daemon worked fine, it was just quietly expensive. That's the argument for keeping every provider run's argv, environment keys, model, and token usage as a row: the questions worth asking are usually ones you didn't know to ask when you wrote the code.

---

## A generic core and a private half

The repository is public. My life isn't. That tension is resolved by an extension system rather than by censoring commits.

The core knows about queues, schedules, workflows, memory, artifacts, providers, and Discord. Personal domains live in `extensions/`—gitignored plain Python packages, each exposing `register(registry)`, which can contribute SQLAlchemy models on the core `Base`, an Alembic migration directory whose revisions chain off core revisions (so core and extension schema histories upgrade together in one command), MCP tools served alongside the core ones, context digests, and post-attempt ingestors. Mine registers 24 tools, 8 digests, and 95 tests of its own across a handful of domains—training and nutrition ledgers, a pantry, a wardrobe, a job-application pipeline.

Loading fails loudly: a broken extension raises at startup, because a daemon quietly missing its domain tools corrupts runs far worse than a crash does.

---

## Living in it

Day to day, Tasque is a Discord server. Messages in the intake channel become work items. Each work item and workflow run gets a thread; replying in that thread routes back into the run as a follow-up rather than a new conversation. Approvals and gates are buttons. Failed work lands in a dead-letter channel you can retry from. Attachments are captured as artifacts on the way in, and images the agent produces come back out the same way.

The CLI is the other half—53 commands covering queueing, schedules, workflows, memory, artifacts, backup/restore, a `doctor` health check, and a local smoke runbook that exercises the whole daemon loop against fake providers.

The jobs themselves fall into a handful of shapes:

- **Scheduled briefings.** A cron schedule fires a work item that pulls together calendar, weather, and whatever's open, and posts a digest to a Discord thread. Nothing about it is interactive—I just read it.
- **Recurring upkeep.** Nightly and weekly passes that reconcile the append-only ledgers, compact canonical documents that have drifted over budget, and surface what's gone stale.
- **Fan-out behind a gate.** One node collects a list of candidates, a child runs per item, and the run parks at an approval gate before anything leaves my machine. This is the pattern I trust most, because the irreversible step is always behind a button I have to press.
- **Research that feeds later work.** A scouting job writes a report artifact; a later job takes that artifact's id as input rather than re-deriving it. The artifact table is what makes the handoff cheap.
- **Small chores against my own repos**, through the GitHub server—well-specified changes that aren't worth opening an editor for.

The common thread is that none of it is a conversation. Each one is a row that either finished or didn't, and I find out which by looking, not by remembering.

---

## Where it stands

It has been running continuously on my machine since mid-May. The core is about 19,000 lines of Python across 44 modules with 244 tests, exposing 64 MCP tools to workers; the private extension package adds its own models, migrations, tools, and tests on top.

What that has amounted to, read out of the live database:

| Metric | To date |
|---|---|
| Work items run | 1,466 — 1,415 succeeded, 22 dead-lettered |
| Attempts / provider runs | 1,553 / 1,550 (1,202 Claude, 348 Codex) |
| Workflow runs | 239, across 1,182 nodes |
| Schedules | 26 defined, 9 currently enabled |
| Memories · artifacts · events | 1,895 · 9,361 · 25,440 |

The number I actually watch is the gap between 121 failed attempts and 22 dead-lettered items: most failures were transient, and the classification above is what let them retry into a success instead of ending as a silent hole in a workflow.

The honest limits are all consequences of decisions I'd make again. It is single-user and single-host: SQLite's one-writer model *is* the concurrency design, and scaling past one machine would mean replacing the part of the system I most trust. There's no web UI—Discord and the CLI are the whole interface. And provider adapters are subprocess-shaped, so Tasque's ceiling is whatever the agent CLIs can do; it schedules, contextualizes, and audits them, but it doesn't reason for them.

What I'd claim for it is narrow and, I think, correct: agent work becomes dependable at the point where finishing is something the agent must *record*, not something the runner infers.

---

### Links

- Source: [github.com/TylerFlar/tasque2.0](https://github.com/TylerFlar/tasque2.0)
