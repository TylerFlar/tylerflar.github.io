---
title: "Endoscopic Navigation"
summary: "Getting a robotic endoscope to find its own way through the kidney, using a map of the kidney from the patient's CT scan."
image: /assets/images/projects/endoscopic-navigation/endoscopic-navigation-cover.jpg
date: 2025-09-25
cv: role/arclab/endonav
category: research
role: "Student researcher, UC San Diego Advanced Robotics and Controls Lab"
links:
    - { label: Exploration code, href: "https://github.com/TylerFlar/endonav-exploration" }
    - { label: Simulator, href: "https://github.com/TylerFlar/kidney-meshgen" }
---

I worked on this at UC San Diego's [Advanced Robotics and Controls Lab](https://ucsdarclab.com/) from September 2025 to November 2026, with a medical robotics company and physicians at UC San Diego Health. The goal was a system that steers a robotic endoscope through the kidney on its own, finds kidney stones and helps clear them. The procedure is called flexible ureteroscopy.

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

## What I built

**Exploration on real footage.** A per-frame pipeline runs on video from a kidney phantom ([endonav-exploration](https://github.com/TylerFlar/endonav-exploration)). It estimates depth from a single camera with Depth Anything v2, uses that depth to avoid walls and count branch openings, and uses DINOv2 features (the AnyLoc method) to notice when it's back somewhere it has already been. A state machine turns all of that into a graph of where it has explored and picks where to look next. There's no SLAM in it.

**A simulator with many kidneys.** We can't just have a robot testing on a real patient, a 3D print isn't visually believable enough, and a phantom is only one kidney. So I wrote a procedural generator ([kidney-meshgen](https://github.com/TylerFlar/kidney-meshgen)). Each random seed produces a different kidney, shaped after a published classification of kidney anatomy, and exports what a real-time Unity simulator needs: the visible mesh, a collision mesh, a distance field, the centerline graph, waypoints and stones.

![Endoscope views rendered across twelve generated kidneys](/assets/images/projects/endoscopic-navigation/kidney-meshgen-rgb.png)

![The matching depth maps, the signal the navigation uses](/assets/images/projects/endoscopic-navigation/kidney-meshgen-depth.png)

It replaced an earlier all-Python simulator ([endonav-sim](https://github.com/TylerFlar/endonav-sim)) that modeled the scope's mechanics in detail (encoder steps, cable backlash, drift) and the find, break up and remove loop for stones. The move to Unity was for more flexibility in rendering, and to experiment with [SofaUnity](https://github.com/InfinyTech3D/SofaUnity), which runs the SOFA physics engine for soft, deformable objects inside Unity.

**An autonomous agent, started.** [endonav-agent](https://github.com/TylerFlar/endonav-agent) is meant to explore every calyx depth-first, deal with the stones and check that each calyx is clear, using only what a real scope sees: the camera and noisy joint readings. The simulator's ground truth is only there to score it. It's still a scaffold.

**Where the scope is, from the robot's own log.** In October 2026 I started working from recordings of the robot itself: the scope's video and the robot's joint log, which says how far the scope is inserted, how far it's rolled and how far its tip is bent. The two aren't on the same clock, so the first step syncs them by motion. Insertion speed lines up with how fast the image zooms, bend speed with how the image shifts, and a fit over each run takes out the drift. From there the pipeline builds a map of a kidney out of several runs through it, splits it into the ureter, the renal pelvis and the branches off the pelvis, and says which region the scope is in at every moment of every run.

**SLAM again, this time with the joints.** The joint log gave SLAM what it was missing. On the robot's footage DROID-SLAM follows the camera well from frame to frame, but its rotation drifts over a long run, its scale jumps when the scope gets close to tissue, and it has nothing to go on when the tip touches the wall and the image goes red. The joints never drop out, but they only report what the motors did, and the tip doesn't always follow. So the last thing I built fuses the two. DROID-SLAM runs over the video in short chunks. Loop closures tie revisited places together: DINOv3 descriptors propose pairs of frames, RoMa matches verify them, and the robot's insertion at the two frames has to agree. Then one solve puts it together, rotations first by robust averaging and positions and DROID's scale after, and writes out where the scope is and which way it points on every frame of the video.

I built this one by directing Claude Code. I set what it could use (only the video, the joint log and the camera calibration) and had it score every variant on a scoreboard, tuning on some runs and holding the rest out. A long unattended run then tried variants and kept the one that scored best.

There's no ground truth for where the scope really was, so every score is a consistency check: whether the path comes back to the point where it started, whether revisited places land on each other, and how far the path drifts when the camera is cut out. By those checks the path with loop closures came back much closer to its start than the path without them. They measure how well the path agrees with itself, not how close it is to the truth.

## Where I left it

I paused the project in June 2026, came back to it in October 2026 and left the lab in November 2026. The exploration pipeline and the simulator work. The fused pipeline works on a recorded run, after the fact. A live version, which takes in each frame once the way a robot would, was started and isn't finished. Neither is the agent.

## Code

- [kidney-meshgen](https://github.com/TylerFlar/kidney-meshgen): the procedural kidney generator behind the current simulator
- [endonav-agent](https://github.com/TylerFlar/endonav-agent): the autonomous agent (a scaffold)
- [endonav-exploration](https://github.com/TylerFlar/endonav-exploration): depth-based exploration on real footage
- [endonav-sim](https://github.com/TylerFlar/endonav-sim): the earlier all-Python simulator

The localization and fusion code runs on the partner's recordings, so those two repos are private.
