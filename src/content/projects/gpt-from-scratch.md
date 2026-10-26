---
title: "GPT from Scratch"
summary: "A small GPT language model in PyTorch, following Andrej Karpathy's lecture, with my own byte-level tokenizer and training tool."
image: /assets/images/projects/gpt-from-scratch/cover.png
date: 2026-02-27
cv: project/gpt-from-scratch
category: software
role: "Personal project, following Andrej Karpathy's GPT lecture"
links:
    - { label: Code, href: "https://github.com/TylerFlar/gpt-from-scratch" }
---

I wanted to see what's inside a GPT, so I built a small one in PyTorch, following Andrej Karpathy's ["Let's build GPT"](https://github.com/karpathy/ng-video-lecture) lecture. The model stays close to his: the same attention heads, the same blocks and most of the same defaults. The repo used to be called yeen-gpt, and the code still is.

What I added:

- **A byte-level BPE tokenizer** in place of the lecture's characters. It learns 256 merges on top of the 256 byte values, for a 512-token vocabulary, the way the basic tokenizer in Karpathy's [minbpe](https://github.com/karpathy/minbpe) does.
- **Training I could leave running.** It evaluates every 250 steps, stops early after five evaluations with no improvement, restores the best weights, and saves checkpoints that keep the model, the tokenizer and the config together.
- **A command-line tool** with `train` and `generate` commands. Its flags come from the config, and it runs on a GPU when there is one.

At the defaults it's a 6-layer model with 6 heads, 384-dimensional embeddings and a 256-token context, about 11 million parameters, set up to train on a plain text file like Tiny Shakespeare.
