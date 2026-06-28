---
title: "Active Perception for Street-View Geolocation"
summary: "An agentic vision–language loop that plays GeoGuessr by actively choosing what to look at next."
image: /assets/images/projects/active-perception/cover.png
date: 2026-06-09
date_range: "Apr 2026 – Jun 2026"
---

This was our final project for [CSE 252D (Advanced Computer Vision)](/classes/cse252d/). Single-image geolocation models commit from one frame, but the hardest street-level locations hinge on a clue that is small, occluded, or simply out of view—a directional sign down the road, one extra camera heading, a named institution around the corner. We asked a direct question: **can an agentic VLM loop that actively decides what to look at next beat a strong one-shot baseline**, under the same strict GeoGuessr rules (pixels only—no search, EXIF, or hidden coordinates)?

![Street View frame after panning surfaced directional signs ("Cournon", "La Pardieu") in Clermont-Ferrand. Black regions are HUD masks.](/assets/images/projects/active-perception/cover.png)

We built a working system that drives a live, project-owned Google Street View window and decomposes each episode into three roles. The result is nuanced, and we report it honestly: active perception clearly improves the *hypothesis* the system forms (country accuracy $57.1\% \rightarrow 85.7\%$), but a conservative commit policy keeps it from cashing that in—so the interesting contribution is the architecture plus a clear-eyed analysis of *when* active perception pays and *where* the calibration gap lies.

---

## The loop: Navigator, Geographer, Verifier

Each turn runs three role-specialized calls on the **same** underlying model, differing only in their prompt, the state they see, and whether they may see pixels or act:

- **Navigator (perception)** — the *only* role that sees pixels or touches tools. It inspects the masked frame, optionally pans / zooms / moves / inspects, and returns a *typed* evidence survey. It does not reason about where the location is.
- **Geographer (reasoning)** — no image, no tools, no web. It reasons purely over the Navigator's text survey, must submit a best guess *every* turn (carrying uncertainty in the confidence rather than refusing), and writes an instruction back to the Navigator when one more look would help.
- **Verifier (gate)** — also text-only. It runs a sanity check and emits *accept*, *revise*, or *continue*, and—unlike the Geographer—sees the **full, unfiltered** survey, so it can audit whether a forbidden clue leaked into the reasoning.

Every role call emits one schema-validated JSON object (enforced with Zod), so the whole loop is typed and replayable.

## The evidence firewall

The single most important safeguard is preventing guesses from resting on text that Google *rendered* onto the image—road-name overlays, POI labels, route shields—rather than on text that exists in the photographed world. Those overlays are effectively the answer printed on the frame, so we block them in depth:

1. The Navigator classifies every clue's `source` $\in \{\text{physical, inferred, overlay, uncertain}\}$.
2. Before the survey reaches the Geographer, we strip every `overlay`/`uncertain` clue, so the reasoner literally cannot cite it.
3. The scene graph's usable-evidence filter admits only `physical` clues ($\geq 0.5$) and `inferred` clues ($\geq 0.7$), routing the rest to a visible rejected-evidence bucket the Verifier audits.

Enforcement happens at classification, at the reasoner's input, and in persistent memory—defense in depth, not a single prompt instruction.

## The pixels-only contract

The environment is a *real* Google Street View window—a headful Chromium instance driven by Playwright—not saved panoramas. Two mechanisms keep the run honest:

- **HUD masking** — just before each screenshot we paint opaque black rectangles over Google's info panel, attribution strip, compass/zoom controls, and corners, so the model never sees Google's own location chrome and off-screen regions read as unavailable.
- **Coordinate redaction** — the camera state shown to the model is stripped to heading/pitch/zoom; the Street View URL, which holds the true coordinates, never enters a prompt. A sanitizer also discards any survey step that looks like an external lookup.

![A masked Street View start frame (Bloemfontein). The black regions are the HUD masks that enforce the pixels-only contract.](/assets/images/projects/active-perception/masked-frame.png)

The Navigator acts through a small, typed action set—`pan`, `zoom`, `move(linkIndex)`, `inspect(target, …)`, and a convenience `look` that performs one action and returns the resulting masked frame—exposed as tools over the [Model Context Protocol](https://modelcontextprotocol.io/). We inject our `google-maps` MCP server into an off-the-shelf agent CLI *ephemerally*, and the Geographer and Verifier are invoked with the MCP config removed entirely, so the "text-only" guarantee is enforced in code, not merely requested in the prompt. Constraining the action space keeps every step attributable: each move and camera change is logged with its stated reason.

## 2.5D topological scene memory

Because hidden coordinates are forbidden, the agent can't build a metric map. Instead it maintains a 2.5D **topological** graph: a new *node* is created when the Navigator moves to a new panorama (with a *move-edge* recording the action), while staying put appends *frames* (each with heading, pitch, zoom) to the current node. Typed evidence attaches to wherever it was observed. A lightweight coverage policy flags low-information dead ends, identifies frontier nodes with unexplored branches, and lists unseen $45°$ heading bins—nudging the Navigator to expand coverage rather than re-inspect a spent view.

![The 2.5D topological scene graph for one episode: physical nodes, camera fans, and move-edges, built without any absolute coordinates.](/assets/images/projects/active-perception/scene-graph.png)

## The commit gate

The Verifier's natural-language decision is advisory; the *binding* decision is made by a deterministic gate that couples the decision to self-reported confidence at the chosen specificity:

$$
\text{conf} \;\geq\;
\begin{cases}
0.85 & \text{if a city is named,}\\
0.55 & \text{else if a region is named,}\\
0.50 & \text{else if a country is named.}
\end{cases}
$$

If the Verifier says *accept* but the guess is below its floor, the gate overrides to *continue*; if it says *continue* yet an above-floor guess already exists, the gate commits it (so a timid Verifier can't stall forever). This gate turns out to be both the source of the loop's safety and its biggest weakness.

---

## Results

We evaluated on seven worldwide residential/suburban locations spanning six countries and five continents (France, Japan, US, Brazil, South Africa, Australia, Sweden), chosen to stress mid-difficulty disambiguation rather than famous landmarks. The active loop and the baseline use the *same* strong VLM; the one-shot baseline sees a single starting frame with no tools or movement. At a mean of 6.1 turns × 3 calls, the loop spends ≈18 model invocations per episode versus 1 for the baseline.

We score each guess two ways. The **best-attempt** lens scores the guess whether or not the gate committed it (the quality of the hypothesis *formed*); the **committed** lens scores a withheld guess as zero (what the system would actually *stand behind*). The gap between them is the calibration signal.

| Metric | Active loop | One-shot |
| --- | ---: | ---: |
| Country accuracy | **85.7%** | 57.1% |
| Region accuracy | **57.1%** | 42.9% |
| City accuracy | **57.1%** | 42.9% |
| Median distance (km) | **1.6** | 382 |
| Mean points, best-attempt | **3974** | 3899 |
| Mean points, committed | 2142 | **3899** |
| Committed / withheld | 3 / 4 | — |
| Model calls / episode | ≈18 | 1 |

Points follow a GeoGuessr-style smooth decay, $S(d) = 5000\,e^{-d/2000}$ with distance $d$ in km.

The loop is **decisive** twice. In **Bloemfontein** the baseline guesses Windhoek, Namibia (1167 km off) from a generic arid-city look; the Navigator pans to a "Ramblers" sign invisible at the start and commits Bloemfontein at 1.64 km. In **Clermont-Ferrand** (the cover image), directional signs reachable only after panning pin a city the baseline missed by 400 km. These are the cases active perception is *for*—an ambiguous start frame where movement surfaces a named anchor.

It is a **liability** in two others: when the first frame already holds a readable street name, the extra context can invite the reasoner to second-guess a correct first read and drift (Lawrence KS → Dubuque; Adelaide → Sydney).

## The honest finding: calibration is the ceiling, not perception

Under the best-attempt lens the loop wins on every categorical metric and collapses median error from 382 km to 1.6 km. But under the committed lens it scores only 2142: the gate **withholds four of seven guesses**, and a withheld guess earns nothing—so the motionless baseline's 3899 wins on raw points, at roughly $18\times$ less compute.

The split is entirely the gate's doing, and as a *detector of its own mistakes* it behaves well (committed guesses averaged 0.8 km error vs 1136 km for withheld). The failure is systematic conservatism on uniquely named landmarks. The clearest case is **Uppsala**: the Navigator reads an overhead sign "Botaniska trädgården"—near-unique, unambiguous Swedish—and the Geographer proposes Uppsala at **0.29 km**, but at 72% confidence, just under the 0.85 city floor, so the gate withholds a guess that would have scored 4999. The confidence model accrues evidence by *count*, not *kind*, so one decisive text anchor scores below a pile of weak cues.

In six of seven episodes the Navigator *surfaced* the decisive evidence—the lost points came from the gate withholding a correct guess and the reasoner mis-weighting evidence it already held. The bottleneck is the commit policy, not the agent's eyes. The fixes that follow are concrete: a two-tier confidence model where one tier-1 text anchor alone clears the city floor, a toponym–city reconciliation check to catch the drift cases, and running a cheap one-shot first and only invoking the loop when that read is low-confidence.

---

### Repository

- Source: [github.com/TylerFlar/active-perception-geoguessr](https://github.com/TylerFlar/active-perception-geoguessr)
