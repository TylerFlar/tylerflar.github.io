---
title: "Conditioned Music Generation"
summary: "Two music-generation tasks: turning images into audio, and repairing missing bars of piano MIDI."
image: /assets/images/projects/music-generation/cover.png
date: 2026-06-05
date_range: "May 2026 – Jun 2026"
---

This was our group project for [CSE 253 (Machine Learning for Music)](/classes/cse253/), built as two complementary takes on **conditioned music generation**: a *continuous* task that turns an image into audio, and a *symbolic* task that repairs missing measures of a piano MIDI clip.

## Image-to-Music

The first task is **continuous conditioned generation**: given an image, generate audio that reflects its *semantics*—mood, scene, energy, and atmosphere—rather than any literal soundtrack. The research question we set out to answer was narrow and measurable: **does an explicit semantic "bridge" between the image and the music model actually improve alignment, compared to just feeding an image caption straight into a text-to-music model?**

![A sample input image from our scenery set.](/assets/images/projects/music-generation/sample-input.png)

### Pipeline

We kept the architecture deliberately simple and defensible, so that any gain is attributable to a specific component:

1. **Image → caption** — a vision–language model ([BLIP](https://arxiv.org/abs/2201.12086) / [BLIP-2](https://arxiv.org/abs/2301.12597)) produces a description of the image.
2. **Caption → music prompt** — a *bridge* rewrites that literal caption into a music-oriented prompt (mood, instruments, tempo, texture, genre). A plain "a child sits by a rainy window" becomes "slow, soft piano and warm strings, melancholic and intimate, sparse texture, reflective rainy-day atmosphere."
3. **Music prompt → audio** — [MusicGen](https://arxiv.org/abs/2306.05284) generates a short clip from the prompt.

The whole comparison is *raw caption → MusicGen* vs. *bridged prompt → MusicGen*, holding the image and the music model fixed.

### The bridge helps

Across a set of nature/scenery images, the music-aware prompt produced audio that was measurably calmer and more *consistent* than feeding MusicGen the raw caption: lower and tighter **spectral centroid**, lower **onset density**, and a tighter **tempo** spread. The bridge nudges the generator toward the cohesive, cinematic output the images call for, and away from MusicGen's busier default.

![Audio features of generated clips: a music-aware prompt (vs. the raw BLIP caption) lowers spectral centroid and onset density and tightens the tempo spread—calmer, more consistent output.](/assets/images/projects/music-generation/audio-features.png)

### Which knobs actually mattered

We then swept the pipeline's "knobs"—captioner (BLIP-base vs. BLIP-2), an optional caption *enrichment* step, and the prompt bridge—and ranked configurations by an **Image–Music Semantic Match (IMSM)** score. The cleanest setup won: a plain **BLIP-base** caption with the **Qwen** prompt bridge and **no** enrichment ranked highest, and adding the enrichment step consistently *hurt*. Complexity wasn't the win; the bridge was.

![Knob-grid ablation ranked by Image–Music Semantic Match (higher = better): a BLIP-base caption with a Qwen bridge and no enrichment ranked highest; enrichment consistently lowered the score.](/assets/images/projects/music-generation/config-ranking.png)

### LoRA fine-tuning — an honest negative result

The "one step above baseline" was to actually adapt the music model: we **LoRA fine-tuned MusicGen-small** (10.2M trainable / 599M total params, 1.71%) for 8 epochs on a curated cinematic subset of [MusicCaps](https://arxiv.org/abs/2306.05284). Training loss fell smoothly, but validation loss was noisy and bottomed out early.

The decisive test was a [CLAP](https://arxiv.org/abs/2211.06687) text–audio similarity ablation. Off-the-shelf MusicGen was already strong—**0.41**, about 78% of the real-reference score (0.53)—but our **LoRA-tuned** model dropped to **0.14**, roughly 65% *worse*. On a small, noisy subset, fine-tuning *degraded* a well-pretrained model, and the real, reliable win came from the cheap, transparent **semantic bridge**—not from touching the weights.

![CLAP text–audio similarity: raw MusicGen (0.41) reaches ~78% of the real-reference score (0.53), but LoRA fine-tuning on our small cinematic subset dropped it to 0.14.](/assets/images/projects/music-generation/clap-ablation.png)

## MIDI Repair

The second task is **symbolic conditioned generation**: given a corrupted piano MIDI clip with several complete bars deleted, generate a plausible symbolic repair for the missing measures—

$$p(x_{\text{missing}} \mid x_{\text{visible}}, m)$$

The key reframing is that the goal is *not* exact reconstruction. A missing bar has many valid completions, so we evaluate whether a repair is *plausible in context* rather than whether it matches the bytes of the original.

![Corrupted input (a hole of missing bars), the model's generated repair, and the original hidden reference, as piano rolls around the gap.](/assets/images/projects/music-generation/cover.png)

In the masked region (the teal band), the generator produces distinct, note-event-shaped material with contour—not a frozen chord or a held-texture blanket—and it connects to the visible left and right context.

### Corpus

The task is piano-only, so every pitch is mapped to the 88-key range (MIDI 21–108). We combined three datasets so the model isn't narrowly piano-classical: **[MAESTRO v3.0.0](https://magenta.withgoogle.com/datasets/maestro)** (virtuosic classical piano), **[POP909](https://github.com/music-x-lab/POP909-Dataset)** (pop arrangements), and **[GiantMIDI-Piano](https://github.com/bytedance/GiantMIDI-Piano)** (a large transcribed archive). Each clip is parsed into per-frame piano-roll features: note activity, onset, hold/sustain, velocity, and—crucially—**beat position** and **bar position**.

### Corruption: holes, not noise

Rather than mask random cells, we delete **2–6 complete bars** at a time. That makes the task closer to *replacing missing measures* than to denoising, and it's what forces the model to produce phrase-like continuations instead of locally plausible texture. We used a dataset-stratified train/validation split.

### Baseline and model

A **repeat-left-context** baseline copies the preceding visible frames into the gap—genuinely strong on local texture, but it can't produce a phrase. The learned model is a **single bidirectional beat/bar-aware note-event Transformer**: it sees the corrupted activity/onset/hold/velocity channels plus the mask, with beat- and bar-position embeddings, and predicts the note event for every masked frame. We chose this over a full REMI encoder-decoder because it's easy to visualize, trains quickly on one GPU, and avoids a naive framewise decoder's habit of holding a sustained chord blanket across the gap.

### Evaluation: does the repair *fit*?

Because exact reconstruction is the wrong target, we built a **context-fit** rubric—pitch-class cosine, density, register, and boundary scores, combined into one fit score—plus a **context-discrimination** test: does a generated chunk fit *its own* surrounding piece better than a *random other* piece? The learned model passes that test and improves context-fit over the baseline while producing note-event-shaped repairs—stronger evidence of context-awareness than any single number.

## Takeaways

Across both halves the lesson rhymed: the reliable wins came from **how we framed the problem**—a semantic prompt bridge for audio, a context-fit objective and bar-level corruption for MIDI—rather than from brute-force model training (LoRA fine-tuning actually *hurt*). It's the same conclusion the [Active Perception](/projects/active-perception/) project reached from a different direction.
