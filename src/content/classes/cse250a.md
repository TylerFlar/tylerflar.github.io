---
title: "Principles of Artificial Intelligence: Probabilistic Reasoning and Learning"
code: CSE 250A
date: 2025-01-14
term: Spring 2025
level: graduate
---

This class was an overview of probabilistic modeling and learning: Bayesian networks, Markov models, HMMs, EM, and information theory (entropy, KL, mutual information). What made it especially fun was how abstract math kept turning into very concrete little systems.

Some of the more interesting/unique bits:

- Treating **Hangman** as a Bayesian inference problem and building a letter-prediction engine from word frequency tables.
- Proving info–theoretic facts (e.g., **entropy is maximized by the uniform distribution**, KL ≥ 0) using Lagrange multipliers and convexity.
- Learning a **noisy-OR medical model** with EM on real SPECT heart data, then tracking both log-likelihood and classification error.
- Implementing a tiny **movie recommender**: a latent “user type” model trained with EM that predicts how you’d rate films you haven’t seen.
- Using the **Viterbi algorithm** on a given HMM to decode a hidden sequence of states that spells out a famous quotation.

Using the knowledge from this class, I made a Wordle solver that uses letter frequency and positional information to maximize expected information gain on each guess. 

![Wordle solver screenshot](/assets/images/classes/cse250a-wordle.png)

The solver can be found [here](https://tylerflar.com/ibexicon) ([GitHub](https://github.com/TylerFlar/ibexicon)).