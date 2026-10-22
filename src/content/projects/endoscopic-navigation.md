---
title: "Endoscopic Navigation"
summary: "Getting a robotic endoscope to find its own way through the kidney, using a map of the kidney from the patient's CT scan."
image: /assets/images/projects/endoscopic-navigation/endoscopic-navigation-cover.png
date: 2025-09-25
cv: role/arclab/endonav
category: research
role: "Lab member, UCSD Advanced Robotics and Controls Lab"
links:
    - { label: Exploration code, href: "https://github.com/TylerFlar/endonav-exploration" }
    - { label: Simulator, href: "https://github.com/TylerFlar/kidney-meshgen" }
---

I work on this at UCSD's [Advanced Robotics and Controls Lab](https://ucsdarclab.com/), with a medical robotics company and physicians at UCSD Health. The goal is a system that steers a robotic endoscope through the kidney on its own, finds kidney stones and helps clear them. The procedure is called flexible ureteroscopy.

## The problem

In ureteroscopy, a surgeon passes a thin, flexible scope up the urinary tract into the kidney and steers it through the kidney's branches (the calyces) looking for stones. Even experienced surgeons sometimes miss a branch, and a missed branch can mean a missed stone and a second procedure. A robot that checks every branch in order would fix that.

## What we know before the procedure

Patients usually get a CT scan first. From it we can build a 3D model of their kidney and pull out:

- the branching structure as a graph, with calyces as nodes and the passages between them as edges
- a centerline through each passage, for planning
- how many branches split off at each junction

The rest of the approach leans on that prior.

## Why SLAM didn't work

My first try was to have the robot follow the CT centerline while a visual SLAM system ([DROID-SLAM](https://github.com/princeton-vl/DROID-SLAM), then [VGGT-SLAM](https://github.com/MIT-SPARK/VGGT-SLAM)) tracked where the scope really was.

![3D kidney reconstruction from a CT scan](/assets/images/projects/endoscopic-navigation/ct-kidney-reconstruction.png)

It didn't hold up. The inside of the kidney is wet, smooth tissue with almost no texture, and the scope's light reflects off it. Feature matching kept failing, and so did loop closure, even with dense reconstruction.

## Navigating on the graph

We don't need the scope's exact position. The kidney is a tree, and the CT already tells us its shape and how many branches each junction has. So the question becomes "which node of the graph am I at?" and not "what is my exact 6-DoF pose?"

That changes what the robot has to see. If the CT says a junction has three branches and the camera shows two, the robot knows to rotate until it finds the third. Depth is enough for that: it shows how many openings are in view and keeps the scope off the walls (touching them isn't a disaster, but it's better avoided).

![Depth estimation and junction detection from the endoscope feed](/assets/images/projects/endoscopic-navigation/depth-junction-detection.png)

![The topological graph the system builds while it explores](/assets/images/projects/endoscopic-navigation/topological-exploration-graph.png)

## What I've built

**Exploration on real footage.** A per-frame pipeline runs on video from a kidney phantom ([endonav-exploration](https://github.com/TylerFlar/endonav-exploration)). It estimates depth from a single camera with Depth Anything v2, uses that depth to avoid walls and count branch openings, and uses DINOv2 features (the AnyLoc method) to notice when it's back somewhere it has already been. A state machine turns all of that into a graph of where it has explored and picks where to look next. There's no SLAM in it.

**A simulator with many kidneys.** To test a controller on more than one phantom, I wrote a procedural generator ([kidney-meshgen](https://github.com/TylerFlar/kidney-meshgen)). Each random seed produces a different kidney, shaped after a published classification of kidney anatomy, and exports what a real-time Unity simulator needs: the visible mesh, a collision mesh, a distance field, the centerline graph, waypoints and stones.

![Endoscope views rendered across twelve generated kidneys](/assets/images/projects/endoscopic-navigation/kidney-meshgen-rgb.png)

![The matching depth maps, the signal the navigation uses](/assets/images/projects/endoscopic-navigation/kidney-meshgen-depth.png)

It replaced an earlier all-Python simulator ([endonav-sim](https://github.com/TylerFlar/endonav-sim)) that modeled the scope's mechanics in detail (encoder steps, cable backlash, drift) and the find, break up and remove loop for stones.

**An autonomous agent, started.** [endonav-agent](https://github.com/TylerFlar/endonav-agent) is meant to explore every calyx depth-first, deal with the stones and check that each calyx is clear, using only what a real scope sees: the camera and noisy joint readings. The simulator's ground truth is only there to score it. It's still a scaffold.

## Where it stands

I paused the project in June 2026 and came back to it in October 2026. The exploration pipeline and the simulator work. The agent doesn't yet.

## Code

- [kidney-meshgen](https://github.com/TylerFlar/kidney-meshgen): the procedural kidney generator behind the current simulator
- [endonav-agent](https://github.com/TylerFlar/endonav-agent): the autonomous agent (a scaffold)
- [endonav-exploration](https://github.com/TylerFlar/endonav-exploration): depth-based exploration on real footage
- [endonav-sim](https://github.com/TylerFlar/endonav-sim): the earlier all-Python simulator
