---
title: "Active Perception for Geolocation"
summary: "An AI agent that plays GeoGuessr by choosing where to look next in live Street View."
image: /assets/images/projects/active-perception/cover.png
date: 2026-06-09
cv: project/active-perception
category: research
featured: true
role: "Built the agent loop, browser tools, scene memory and commit rule (three-person CSE 252D project)"
links:
    - { label: Code, href: "https://github.com/TylerFlar/active-perception-geoguessr" }
---

This was our final project for CSE 252D (Advanced Computer Vision). Models that geolocate a single image have to commit from one frame, but in hard street-level cases the useful clue is small, blocked or just out of view: a road sign down the street, a building around the corner. We asked whether a vision-language model that decides where to look next could beat a strong one-shot baseline under GeoGuessr rules: pixels only, with no search, no EXIF and no hidden coordinates.

![A Street View frame after panning found direction signs ("Cournon", "La Pardieu") in Clermont-Ferrand. The black areas are masked UI.](/assets/images/projects/active-perception/cover.png)

It did form better guesses, with country accuracy going from 57.1% to 85.7%. But a cautious commit rule kept it from cashing them in, and working out why became the most useful part of the project.

It was a three-person project. I built the core: the live Street View harness and its tools, the Navigator, Geographer and Verifier loop, the scene memory, and the commit rule. I also ran the evaluation and wrote this analysis. Emma Zhang built the perception pre-pass, the coverage policy and the filter that strips overlay and uncertain clues. Nathan Van Lingen handled panorama unwarping and the turn limit.

## The loop

Each turn makes three calls to the same model, each with its own prompt, view of the state, and permissions:

- **Navigator** is the only role that sees pixels or uses tools. It looks at the masked frame, can pan, zoom, move or inspect, and returns a typed list of evidence. It doesn't guess the location.
- **Geographer** sees no image and has no tools. It reasons from the Navigator's evidence, gives a best guess every turn with a confidence, and can ask the Navigator for one more look.
- **Verifier** is also text-only. It decides to accept, revise or continue, and it sees the full, unfiltered evidence so it can check whether a banned clue slipped into the reasoning.

Every call returns one JSON object checked against a Zod schema, so the whole loop is typed and can be replayed.

## Keeping Google's labels out

The biggest risk is a guess that rests on text Google draws onto the image (road names, place labels, route shields) instead of text that's really in the scene. Those overlays basically print the answer, so clues get blocked in three places:

1. The Navigator labels every clue's source as physical, inferred, overlay or uncertain.
2. Overlay and uncertain clues are stripped before the Geographer sees anything.
3. The scene memory only keeps physical clues at confidence $\geq 0.5$ and inferred ones at $\geq 0.7$. The rest go to a rejected list the Verifier reviews.

## Pixels only

The environment is a real Google Street View window in a Chromium browser driven by Playwright, not saved panoramas. Before every screenshot, black boxes cover Google's info panel, attribution, compass and zoom controls. The model gets heading, pitch and zoom, but never the URL, which holds the true coordinates. A sanitizer also drops any step that looks like an outside lookup.

![A masked start frame in Bloemfontein. The black areas are the UI masks.](/assets/images/projects/active-perception/masked-frame.png)

The Navigator acts through a small set of typed actions (`pan`, `zoom`, `move(linkIndex)`, `inspect(target, …)` and `look`) served as tools over the [Model Context Protocol](https://modelcontextprotocol.io/). The tool server is attached only to the Navigator's calls. The Geographer and Verifier run with no tool config at all, so "text-only" is enforced in code. Every move is logged with its reason.

## Scene memory without coordinates

Coordinates are off limits, so the agent can't build a metric map. It keeps a topological graph instead. Moving to a new panorama adds a node and an edge for the move, and looking around in place adds frames (heading, pitch, zoom) to the current node. Evidence attaches to where it was seen. A simple coverage policy flags dead ends, finds nodes with unexplored branches, and lists the 45° headings not looked at yet.

![The scene graph for one episode, built without coordinates](/assets/images/projects/active-perception/scene-graph.png)

## The commit rule

The Verifier's decision is advisory. A fixed rule makes the binding call, based on the Geographer's confidence at the level of detail it named:

$$
\text{conf} \;\geq\;
\begin{cases}
0.85 & \text{if a city is named,}\\
0.55 & \text{else if a region is named,}\\
0.50 & \text{else if a country is named.}
\end{cases}
$$

If the Verifier says accept but the guess is under its threshold, the rule overrides it and keeps going. If the Verifier says continue but a guess above threshold already exists, the rule commits it, so a timid Verifier can't stall forever. This rule ended up being both the safety net and the main weakness.

## Results

We tested on seven residential or suburban locations in seven countries on six continents (France, Japan, the US, Brazil, South Africa, Australia and Sweden), picked so the answer takes real narrowing down. The loop and the baseline used the same model. The baseline saw one starting frame, with no tools and no movement. The loop averaged 6.1 turns, about 18 model calls per episode against 1.

We scored two ways. **Best-attempt** scores the best guess whether or not the rule committed it, which measures the guesses the agent formed. **Committed** scores a withheld guess as zero, which measures what the system would stand behind. The gap between the two is the calibration problem.

| Metric | Active loop | One-shot |
| --- | ---: | ---: |
| Country accuracy | **85.7%** | 57.1% |
| Region accuracy | **57.1%** | 42.9% |
| City accuracy | **57.1%** | 42.9% |
| Median distance (km) | **1.6** | 382 |
| Mean points, best-attempt | **3974** | 3899 |
| Mean points, committed | 2142 | **3899** |
| Committed / withheld | 3 / 4 | n/a |
| Model calls / episode | ≈18 | 1 |

Points use a GeoGuessr-style decay, $S(d) = 5000\,e^{-d/2000}$ with distance $d$ in km.

The loop made the difference twice. In **Bloemfontein**, the baseline guessed Windhoek, Namibia, 1,167 km off, from a generic dry-city look. The Navigator panned to a "Ramblers" sign that wasn't visible at the start and committed Bloemfontein at 1.64 km. In **Clermont-Ferrand** (the cover image), direction signs that only show up after panning pinned a city the baseline missed by 400 km.

It hurt twice too. When the first frame already showed a readable street name, the extra looking led the reasoner to second-guess a correct read and drift away from it (Lawrence, KS to Dubuque; Adelaide to Sydney).

## Where the points went

On best-attempt scores the loop won every category and cut median error from 382 km to 1.6 km. On committed scores it got only 2142 points, because the rule withheld four of seven guesses and a withheld guess scores zero. The baseline's 3899 won on raw points with about 18 times less compute.

The rule was good at catching its own mistakes: committed guesses averaged 0.8 km of error, and withheld ones 1,136 km. The problem was that it was too cautious with uniquely named places. **Uppsala** is the clearest case. The Navigator read an overhead sign, "Botaniska trädgården", which points to almost one place in Sweden, and the Geographer proposed Uppsala at 0.29 km, but at 72% confidence, just under the 0.85 city threshold. The rule withheld a guess worth 4999 points. Confidence grew with the number of clues, not their strength, so one decisive sign scored lower than a pile of weak hints.

In six of the seven episodes the Navigator found the deciding evidence. The lost points came from the rule withholding correct guesses and from the reasoner misjudging evidence it already had. The fixes are concrete: let one strong text clue clear the city threshold on its own, check named places against the guessed city to catch drift, and run the cheap one-shot first, starting the loop only when its confidence is low.

## Code

- [active-perception-geoguessr](https://github.com/TylerFlar/active-perception-geoguessr): the Street View harness and the Navigator, Geographer and Verifier loop
