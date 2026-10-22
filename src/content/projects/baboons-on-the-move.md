---
title: "Baboons on the Move"
summary: "Detecting and tracking baboons in drone footage so researchers can study how a troop moves."
image: /assets/images/projects/baboons-on-the-move/cover.jpg
date: 2024-12-12
cv: role/e4e/baboons
category: research
role: "Led data collection and benchmarking, and reimplemented the AGMM and MMB baselines"
links:
    - { label: AGMM code, href: "https://github.com/UCSD-E4E/baboon-agmm" }
    - { label: MMB code, href: "https://github.com/UCSD-E4E/baboon-mmb" }
---

Baboons on the Move is a long-running [Engineers for Exploration](https://e4e.ucsd.edu/) project (early 2010s to 2024) that supports the [Uaso Ngiro Baboon Project](https://www.baboonsrus.com/) in measuring how baboons move and interact in the wild. Early on, commercial drones were hard to get in Kenya, so earlier teams built a hot-air balloon that carried a camera over the troops.

Later the project switched to off-the-shelf drones like the DJI Mavic, with steadier, sharper video. Once overhead video was easy to get, the bottleneck moved to processing it: how do you turn hours of footage into tracks, interactions and group structure?

I led the work on computer vision pipelines that detect, and eventually track, individual baboons in aerial video. My part was coordinating data collection and labeling, reimplementing two baselines (AGMM in C++ and MMB in MATLAB), and the hyperparameter search that ran the evaluation. The tracker itself, Spot, was a master's student's thesis work that I helped with.

## Data collection

I needed footage that showed what the data really looks like: terrain, lighting, motion blur, compression. I couldn't travel to Kenya, but the BBC happened to be filming a documentary with the baboon project. I sent them capture requirements (altitude, camera angle, overlap, stabilization), and they came back with hours of aerial video across different environments and light.

![Aerial footage of baboons](/assets/images/projects/baboons-on-the-move/aerial-footage.png)

The documentary is ["The Secret Lives of Animals"](https://www.apple.com/tv-pr/originals/the-secret-lives-of-animals/) on Apple TV+. Episode 10 features these baboons, and a second or so of our footage made it in.

Then I ran labeling sessions with E4E volunteers in [Label Studio](https://labelstud.io/). We drew a box around every baboon in several thousand frames, and that became the **Laikipia Baboon Aerial Dataset (LBAD)**.

We also didn't want a pipeline that only works on baboons. Satellite video of highway traffic has the same problems (a high viewing angle, small objects, little to go on visually), so we also used the [VISO dataset](https://github.com/QingyongHu/VISO), which comes with published baselines to compare against.

## The tracker

The algorithm, **Spot**, was the master's student's thesis work. The thesis is [here](https://ccrutchf.github.io/assets/pdfs/Crutchfield2023%20-%20Spot,%20an%20Algorithm%20for%20Low%20Resolution,%20Low%20Contrast,%20Moving%20Object%20Tracking%20with%20a%20Non%20Stationary%20Camera.pdf), and the code is on [GitHub](https://github.com/UCSD-E4E/baboons-on-the-move).

Spot targets the hard case: small, low-contrast animals (sometimes about 30×30 px) filmed from a moving camera. It aligns past frames to the current one to cancel out camera motion, pulls out motion to find candidate regions, and links regions over time with a particle-filter-style tracker.

## Baselines I reimplemented

To evaluate Spot we needed strong baselines. Several methods did well on VISO, including ClusterNet, D&T, AGMM and MMB. AGMM and MMB had no usable public code, so I reimplemented them from their papers.

### AGMM (C++ and OpenCV)

AGMM models each pixel's background with an adaptive mixture of Gaussians. I wrote it in C++ with OpenCV and split it into three classes that match the method: a video-level `AGMM` that updates each frame and produces masks, a per-pixel `Mixture` with the update and replacement rules, and a `Gaussian` that holds a mean, variance and weight. That split made per-pixel behavior easier to debug and the per-pixel loop easy to parallelize with OpenMP.

Each frame produces an object mask, an optional shadow mask, and a final mask (object minus shadow) that's applied to the frame:

```cpp
this->backgroundModelMaintenance();
this->foregroundPixelIdentification();
if (!this->disableShadow) this->shadowDetection();
this->finalMask = this->objectMask - this->shadowMask;
this->objectExtraction();
this->objectTypeClassification();
cv::bitwise_and(this->frame, this->frame, this->result, this->finalMask);
```

The code is on [GitHub](https://github.com/UCSD-E4E/baboon-agmm).

### MMB (MATLAB)

MMB has three stages: accumulative multi-frame differencing (AMFD), low-rank matrix completion (LRMC) to separate background from foreground, and a pipeline filter (PF) for consistency over time. LRMC follows an existing MATLAB implementation (fRMC), so I wrote the whole pipeline in MATLAB.

Beyond porting it, I added four things:

1. **One configurable entry point.** `baboon_mmb` checks its parameters, loads a frame sequence, runs AMFD and LRMC, combines their masks, runs the filter, and returns bounding boxes:

```matlab
objects = baboon_mmb('IMAGE_SEQUENCE', 'path/to/frames', 'FRAME_RATE', 10, ...
                    'K', 4, 'AREA_MIN', 5, 'AREA_MAX', 80, ...
                    'PIPELINE_LENGTH', 5, 'H', 3, ...
                    'DEBUG', true);
```

2. **Debug output.** With `DEBUG=true` it saves each stage's masks, the detected objects and box overlays, so you can tell which stage caused a bad detection.

3. **Parallel LRMC.** LRMC is the slow part, so there's an option that splits the frames across MATLAB workers and merges the results back in order.

4. **The pipeline filter.** The paper describes one but doesn't ship it. Mine buffers masks over a window, matches detections across frames with `matchpairs` on Euclidean distance, keeps only objects seen in at least H of the buffered frames, and can fill short gaps. It removed most of the one-frame flicker that aerial and satellite video produce.

The code is on [GitHub](https://github.com/UCSD-E4E/baboon-mmb).

## Evaluation

With a limited budget, we compared Spot with MMB on 7 VISO videos (the subset the VISO paper used for MMB) and 3 LBAD videos. MMB was the comparison because it was among the strongest published results on VISO.

![LBAD videos](/assets/images/projects/baboons-on-the-move/lbad-videos.png)

![VISO videos](/assets/images/projects/baboons-on-the-move/viso-videos.png)

MMB has no identity tracking, so we compared detection: precision, recall, F1 and AP. The hyperparameter sweeps ran on AWS EC2 over several months.

## Results

### LBAD

| Video | Algorithm |  Precision |     Recall |         F1 |         AP |
| ----: | --------- | ---------: | ---------: | ---------: | ---------: |
|    01 | MMB       | **0.6511** | **0.4983** | **0.5645** |     0.5361 |
|    01 | Spot      |     0.6062 |     0.4658 |     0.5268 | **0.5362** |
|    02 | MMB       |     0.5943 |     0.5072 |     0.5473 |     0.5111 |
|    02 | Spot      | **0.7534** | **0.6530** | **0.6996** | **0.7018** |
|    03 | MMB       |     0.5110 |     0.6257 |     0.5626 |     0.5145 |
|    03 | Spot      | **0.6022** | **0.8046** | **0.6888** | **0.6977** |

**Overall mAP**: 0.521 (MMB) vs **0.645 (Spot)**

### VISO

| Video | Algorithm |  Precision |     Recall |         F1 |         AP |
| ----: | --------- | ---------: | ---------: | ---------: | ---------: |
|    01 | MMB       | **0.7378** | **0.8203** | **0.7769** | **0.7949** |
|    01 | Spot      |     0.3601 |     0.3796 |     0.3696 |     0.2583 |
|    02 | MMB       | **0.6933** |     0.5971 | **0.6416** | **0.6867** |
|    02 | Spot      |     0.6442 | **0.6167** |     0.6301 |     0.6744 |
|    03 | MMB       | **0.7417** | **0.8117** | **0.7751** | **0.7414** |
|    03 | Spot      |     0.5477 |     0.7074 |     0.6174 |     0.5795 |
|    04 | MMB       | **0.7248** |     0.5945 |     0.6532 | **0.6611** |
|    04 | Spot      |     0.7119 | **0.6482** | **0.6786** |     0.6508 |
|    05 | MMB       | **0.7640** | **0.7218** | **0.7423** | **0.7156** |
|    05 | Spot      |     0.6457 |     0.6329 |     0.6393 |     0.6212 |
|    06 | MMB       |     0.6993 | **0.6953** | **0.6973** |     0.7186 |
|    06 | Spot      | **0.7358** |     0.6323 |     0.6802 | **0.7210** |
|    07 | MMB       |     0.7757 | **0.6706** | **0.7193** |     0.7161 |
|    07 | Spot      | **0.9337** |     0.5481 |     0.6907 | **0.7440** |

**Overall mAP**: **0.719 (MMB)** vs 0.607 (Spot)

## What we learned

On LBAD, Spot had the higher overall mAP and won two of the three videos. Video 01 has very few baboons, and with so few targets both methods over-detect motion that isn't a baboon. In videos 02 and 03, with more animals in frame, Spot was better on both precision and recall.

On VISO, MMB came out ahead, though the scores were close. Most of Spot's gap comes from VISO video 01, which is mostly bay water: compression turns the water into sharp, flickering contrast, which breaks Spot's assumption of a mostly still background. Outside that case Spot holds up against strong satellite-video baselines, which suggests it isn't overfit to baboons.

Neither method is a complete answer for tracking a troop from high altitude. Spot finds moving animals well, but we didn't fully measure how it keeps identities or handles animals that stop moving. It's a strong baseline to build on.

Compute matters too. Field researchers often have a basic laptop, sometimes without a GPU, and Spot and MMB can take over an hour per video and more than 64 GB of memory. With some speedups they'd still be useful for pre-labeling: a motion-based detector proposes boxes, and a person corrects them in a tool like CVAT, Label Studio or VIAME/DIVE.
