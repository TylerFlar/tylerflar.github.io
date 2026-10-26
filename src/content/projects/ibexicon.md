---
title: "Ibexicon"
summary: "A Wordle solver for any word length that ranks your next guess by how much it would tell you and how likely it is to win."
image: /assets/images/projects/ibexicon/cover.png
date: 2025-08-28
cv: project/ibexicon
category: software
role: "Personal project, after CSE 250A (Probabilistic Reasoning and Learning)"
links:
    - { label: Demo, href: "https://tylerflar.com/ibexicon/" }
    - { label: Code, href: "https://github.com/TylerFlar/ibexicon" }
---

Ibexicon is a Wordle solver for words of any length, from 1 letter to 53. You type in your guesses and the colors you got back, and it ranks the best next guesses. I built it in a week in August 2025, with what CSE 250A had taught me about information gain.

## How it picks a guess

A guess splits the words that are still possible by the color pattern it would get back. The more evenly it splits them, the more you learn, and that's what expected information gain (EIG) measures. The chance that the guess is the answer measures whether it can win right now. The score mixes the two:

$$\text{score} = \alpha \cdot \text{EIG} + (1 - \alpha) \cdot P(\text{answer})$$

With thousands of words left, $\alpha$ is near 1 and the solver explores. As the list shrinks and the turns run out, $\alpha$ falls and it goes for the win. It's a sigmoid on the log of the number of words left, plus a push from the turns remaining, kept between 0.1 and 0.95. An optional Thompson-sampling bandit can also choose among five scoring policies as you play.

You can share a game with a link that encodes the board. The answer never appears in it, because the app never knows it.

## Making it fast

Scoring every guess against every possible answer takes a lot of color patterns.

- The scoring runs in a Web Worker, so the page stays responsive, shows progress and can cancel.
- For the 1- to 3-letter lists and the NYT five-letter list, it loads precomputed pattern tables and caches them in the browser's IndexedDB.
- For words up to 10 letters, a small Rust function compiled to WebAssembly computes the patterns.

## Results

I simulated 1,000 games at each length from 4 to 8 letters, with six guesses and answers drawn by how common each word is:

| Letters | Solved | Average guesses when solved |
| --- | --- | --- |
| 4 | 977 | 2.98 |
| 5 | 989 | 2.83 |
| 6 | 997 | 2.73 |
| 7 | 998 | 2.54 |
| 8 | 1,000 | 2.39 |

Longer words are easier, since each guess tells you about more letters.

The app is React and TypeScript with 85 tests: Vitest, property tests with fast-check, and a Playwright end-to-end test. It deploys to GitHub Pages only after the tests pass and a Lighthouse accessibility check scores at least 0.95.
