---
title: "Conditioned Music Generation"
summary: "Filling in missing bars of a piano piece with a Transformer, the half of a four-person music-generation project that a partner and I took on."
image: /assets/images/projects/music-generation/cover.png
date: 2026-06-05
cv: project/music-generation
category: software
role: "Built the data and model for the MIDI-repair half (four-person CSE 253 project)"
---

This was the final project for CSE 253 (Machine Learning for Music). It was open-ended, and our group of four split it in half. The other pair took **image to music**: caption an image with BLIP, rewrite the caption as a music prompt, and generate audio with MusicGen. A partner and I took **MIDI repair**: delete a few bars from a piano MIDI clip and have a model write something that fits the gap.

## MIDI repair

A missing bar has lots of valid fillings, so I didn't score repairs against the original notes. I scored how well they fit the music around them.

![A corrupted clip with deleted bars, the model's repair, and the hidden original, shown as piano rolls around the gap.](/assets/images/projects/music-generation/cover.png)

- **Data.** I built a piano-only corpus from MAESTRO, POP909 and GiantMIDI-Piano and turned each clip into per-frame piano-roll features: note activity, onset, hold, velocity, and beat and bar position.
- **Corruption.** I deleted 2 to 6 whole bars at a time, so the model had to write a phrase and couldn't get by copying the texture next to the gap.
- **Model.** A bidirectional Transformer that sees the corrupted piano roll and the mask, with beat and bar position embeddings, and predicts a note event for every masked frame. I picked it over a REMI encoder-decoder because it trains quickly on one GPU and is easy to visualize.
- **Evaluation.** Repairs were scored on pitch-class similarity, note density, register, and how cleanly they join the bars on either side. I also checked whether a repair fits its own piece better than a random other piece. The model beat a baseline that repeats the bars before the gap.

## The other half

The image-to-music pair found that rewriting the caption into a music-style prompt helped MusicGen more than LoRA fine-tuning it, which made the output worse on our small dataset.
