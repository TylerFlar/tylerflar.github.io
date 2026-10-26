---
title: "Cache Simulator"
summary: "A set-associative cache simulator in a Colab notebook, written after CSE 142 to watch a cache work one access at a time."
date: 2023-08-19
cv: project/cache-sim
category: software
role: "Personal project, after CSE 142 (Computer Architecture)"
links:
    - { label: Code, href: "https://github.com/TylerFlar/cache-simulator" }
    - { label: Open in Colab, href: "https://colab.research.google.com/github/TylerFlar/cache-simulator/blob/main/Cache-Simulator.ipynb" }
---

After CSE 142 (Computer Architecture) in summer 2023, I wrote a small cache simulator to watch a cache work one access at a time. It's one Colab notebook in plain Python.

You set the address width, the cache size, the line size and the associativity, and it splits each address into tag, index and offset bits. The default, a 32 KiB, 8-way cache with 64-byte lines, has 64 sets. Then you write out the memory accesses of a loop, and it replays them with least-recently-used replacement, keeping a timestamp on every line. Each access goes to a CSV with its tag, its index, whether it hit and what kind of miss it was.

The example loop works over five arrays of doubles:

```c
for (i = 0; i < 512; i++) {
  e[i] = (a[i] * b[i] + c[i]) / d[i];
}
```

That's 2,560 accesses. A 64-byte line holds eight doubles, so every eighth access misses: 320 compulsory misses, for a miss rate of 0.125.

## What didn't work

It's meant to sort misses into compulsory, capacity and conflict misses, and only the first works. Evicted lines all go into one list, so every miss that isn't a first touch gets called a conflict miss, and the capacity count is always zero.
