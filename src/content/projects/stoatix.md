---
title: "Stoatix"
summary: "A benchmarking CLI that runs suites from YAML, records every run, and fails CI when a change makes something slower."
date: 2025-12-18
cv: project/stoatix
category: software
role: "Personal project"
links:
    - { label: Code, href: "https://github.com/TylerFlar/stoatix" }
---

Stoatix is a command-line tool for benchmarking programs and catching performance regressions in CI. I wrote it in Python in December 2025.

## Running a suite

A suite is a YAML file of commands to time. A matrix expands one case into many, say every input size times every thread count, and each case gets warmup runs, timed runs, retries, a timeout, and its own environment and working directory. The order of the cases can be shuffled with a fixed seed.

Every attempt goes into a JSONL file, next to the session's metadata, the fully resolved config and the list of cases, so a run can be checked later. A summary gives each case its median, mean, 95th percentile and standard deviation, after optionally dropping outliers by the IQR rule, and writes a Markdown report.

## Comparing runs

`stoatix compare` lines up two runs and calls each case regressed, improved, unchanged, added or removed, by its median against a threshold (5% by default). It also flags cases too noisy to trust: a coefficient of variation of 5% or more, a 95th percentile at least 10% above the median, or fewer than 3 good runs.

`stoatix ci-gate` turns that into an exit code, and two GitHub Actions workflows use it. One saves a baseline from the main branch as an artifact, and the other compares each pull request against it.

## Profiling

On Linux it can run `perf stat` alongside each case and report cycles per instruction, instructions per cycle and the cache-miss rate, carrying on without them when perf isn't available. It can also `perf record` a case and draw a flame graph with Brendan Gregg's FlameGraph scripts.

It has 184 tests.
