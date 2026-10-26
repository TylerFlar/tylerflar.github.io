---
title: "Graph Isomorphism Heuristic"
summary: "Lining up the vertices of two graphs so as many edges as possible match, in C++, for CSE 202."
date: 2025-12-05
cv: project/graph-isomorphism
category: class
role: "My project for CSE 202 (Algorithm Design and Analysis)"
---

CSE 202 is UC San Diego's graduate algorithms course. In Fall 2025 its project was a matching problem: given two undirected graphs $G$ and $G'$ on the same vertex set, output a permutation $f$ of the vertices so that as many edges as possible line up. The score was a cubic function of the fraction of edges that matched:

$$x=\frac{\#\{(u,v)\in E: (f(u),f(v))\in E'\}}{m}$$

My heuristic, in C++, scored 3.95 on the course's test instance, about 96%. It makes no guarantee on other graphs. It works in five steps.

## 1. Color refinement

Start by coloring every vertex by its degree, then refine: a vertex's new color is its old color plus the sorted colors of its neighbors. This is [Weisfeiler-Lehman](https://en.wikipedia.org/wiki/Weisfeiler_Leman_graph_isomorphism_test) refinement, run on both graphs together, so vertices that look alike structurally end up sharing a color.

```cpp
for (int v = 1; v <= n; v++) {
    vector<int> sig;
    sig.push_back(color[v]);        // own color
    for (int u : adj[v]) sig.push_back(color[u]);
    sort(sig.begin() + 1, sig.end());
    newColor[v] = get_or_create_id(sig);
}
color.swap(newColor);
```

## 2. Seeds

A color that appears exactly once in each graph almost certainly pairs those two vertices. Those pairs become the seeds.

## 3. Extend from the seeds

Next I map the unmapped vertex with the most already-mapped neighbors, choosing among same-colored candidates in $G'$ the one that keeps the most of those edges. Whatever is left in each color class gets paired greedily.

## 4. Swap search

Then I repeatedly pick two vertices of the same color and try swapping their images, keeping the swap if more edges match. Only the edges touching those two vertices can change, so each try is cheap:

```cpp
long long delta = 0;
for (auto [u, v] : incident_edges_of(a, b)) {
    bool oldMatch = edge2.count(enc(f[u], f[v]));
    int fu_new = (u == a ? f[b] : (u == b ? f[a] : f[u]));
    int fv_new = (v == a ? f[b] : (v == b ? f[a] : f[v]));
    bool newMatch = edge2.count(enc(fu_new, fv_new));
    delta += (newMatch - oldMatch);
}
if (delta > 0) swap(f[a], f[b]);
```

## 5. Hungarian reassignment

For small color classes, I build a weight matrix of how many edges would match if vertex $i$ went to vertex $j$, and run the Hungarian algorithm to find the best assignment inside that class.
