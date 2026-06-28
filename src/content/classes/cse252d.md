---
title: Advanced Computer Vision
code: CSE 252D
date: 2026-03-30
term: Spring 2026
level: graduate
---

This is the graduate advanced computer vision course, sitting at the modern, learning-heavy end of the field. Topics ranged across vision transformers and generative models, object detection and image segmentation, 3D reconstruction and neural fields, inverse rendering, and the increasingly blurry boundary between vision, language, and agents.

Rather than problem sets, the course was built around reading recent papers, an in-class topic presentation with a live demo, a final exam, and an open-ended research project.

## Topic presentation and demo

Each student presented and demonstrated an assigned topic. Mine argued a **position**: that visual navigation should be treated as a *task-driven perception–action* process rather than primarily as explicit 3D reconstruction. The demo backed the argument with a deliberately reconstruction-free pipeline on real **KITTI** street scenes—using **OpenCLIP** image/text embeddings and 2D-only semantic cues, and *intentionally* avoiding depth maps, point clouds, stereo, calibration, poses, SfM/SLAM, bundle adjustment, and LiDAR—to show how far task-relevant navigation cues can be pushed from 2D appearance alone.

## Final exam

A cumulative final over the lecture material—the architectures, the 3D and generative methods, and the vision–language topics worked through over the quarter.

## Final project — active perception for street-view geolocation

For the final project, our team built an agentic vision–language system that plays GeoGuessr by *actively choosing what to look at next*, driving a live Google Street View window through a Navigator–Geographer–Verifier loop instead of committing from a single frame. Full write-up [here](/projects/active-perception/).
