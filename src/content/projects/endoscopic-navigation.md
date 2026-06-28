---
title: "Endoscopic Navigation"
summary: "Autonomous graph-based navigation of a surgical robot through the kidney for kidney stone treatment."
image: /assets/images/projects/endoscopic-navigation/endoscopic-navigation-cover.png
date: 2025-11-12
date_range: "Sep 2025 – Present"
---

This is an ongoing project under UCSD's [Advanced Robotics and Control Lab (ARCLab)](https://ucsdarclab.com/), in collaboration with a medical robotics company and physicians at UCSD Health. The goal is to build an autonomous system that can pilot a monocular robotic endoscope through the kidney's collecting system to locate and destroy kidney stones—a procedure known as flexible ureteroscopy.

During ureteroscopy, a flexible scope is passed through the urinary tract into the kidney. Practitioners navigate the scope through the kidney's branching internal structure (the calyces) to find and treat stones. In practice, it is possible for even experienced operators to miss calyces and therefore miss stones, requiring patients to return for follow-up procedures. An autonomous system that can thoroughly and systematically explore every branch would address this directly.

---

## Prior information from CT

Fortunately, a CT scan is typically ordered before the procedure. This gives us a 3D model of the patient's kidney ahead of time, from which we can extract:

- The **tree/graph structure** of the collecting system — nodes (calyces) connected by edges (infundibula)
- A **centerline** through each branch for path planning
- The **number of junctions** at each node (i.e., how many branches split off)

This prior knowledge is the foundation of the navigation approach.



---

## Why SLAM failed

The first attempt at solving this problem was to use foundational SLAM algorithms — specifically [DROID-SLAM](https://github.com/princeton-vl/DROID-SLAM) and [VGGT-SLAM](https://github.com/MIT-SPARK/VGGT-SLAM) — to close the loop between the robot following the precomputed centerline and the SLAM system estimating the robot's true position.

![3D kidney reconstruction from CT scan](/assets/images/projects/endoscopic-navigation/ct-kidney-reconstruction.png)

However, the interior of the kidney is featureless, wet tissue. Even with dense reconstruction, these visual SLAM approaches cannot reliably track features in this environment. The lack of texture, combined with specular reflections from the wet mucosal surface, makes feature matching and loop closure extremely fragile.

---

## Key insight: graph-based navigation

One key observation is that we don't necessarily need the precise metric position of the camera. Kidneys — and other complex organs like the lungs — can be modeled as **tree structures**. We know the graph topology ahead of time from the CT scan: the nodes, the edges, and crucially, the number of branches at each junction.

This means the navigation problem can be reframed:

- If we enter the kidney and reach a junction that we know (from CT) has **3 branches**, but the camera currently sees only **2**, the system can reason that there must be a 3rd branch it isn't seeing and needs to rotate the camera to find it.
- Rather than dense 3D reconstruction, we only need **depth information** — enough to determine how many junctions the camera is seeing and to ensure the scope doesn't collide with the tissue walls (not catastrophic if it does, but should be avoided).

This reduces the problem from full SLAM to **depth-based junction detection** combined with **graph-level localization**: answering "which node in the known graph are we at?" rather than "what is our exact 6-DoF pose?"

![Depth estimation and junction detection from endoscope feed](/assets/images/projects/endoscopic-navigation/depth-junction-detection.png)

![Topological exploration graph built during navigation](/assets/images/projects/endoscopic-navigation/topological-exploration-graph.png)

---

## Current research

The work now runs along three threads.

### Reactive exploration on real footage

The perception side runs as a per-frame pipeline on phantom kidney endoscope video ([endonav-exploration](https://github.com/TylerFlar/endonav-exploration)): monocular depth (Depth Anything v2), depth-based proximity / collision avoidance, depth-gated **junction detection** to count branch openings, and AnyLoc / DINOv2 place recognition to flag revisited locations — all feeding a state machine that builds the topological exploration graph and decides where to look next. No global SLAM or metric reconstruction.

### A real-time procedural simulator

To train and evaluate controllers against *diverse* anatomies rather than one canonical phantom, the simulator has moved from an all-in-one Python renderer to a leaner procedural **mesh / asset generator** that feeds a real-time Unity/Gym engine ([kidney-meshgen](https://github.com/TylerFlar/kidney-meshgen)). Each seed produces a unique Takazawa-style pelvicalyceal tree as a bundle of runtime assets — visual lumen mesh, collision proxy, approximate SDF grid, centerline graph, navigation waypoints, stones, and a `runtime_scene.json` descriptor.

![Realistic endoscope views rendered across twelve sampled anatomies by the procedural simulator.](/assets/images/projects/endoscopic-navigation/kidney-meshgen-rgb.png)

![Matching colorized depth maps—the depth signal the navigation pipeline leans on for junction detection and collision avoidance.](/assets/images/projects/endoscopic-navigation/kidney-meshgen-depth.png)

This supersedes the earlier all-Python [endonav-sim](https://github.com/TylerFlar/endonav-sim), which packed procedural Sampaio Type A1 anatomy, *honest* ureteroscope dynamics (encoder quantization, tendon-sheath backlash hysteresis, shaft buckling, dead-reckoned pose drift), the clinical *find → laser-fragment → basket* stone loop, and EndoPBR-style coaxial rendering into a single 60+ fps simulator.

### Autonomous agent

On top of the simulator, an autonomous controller ([endonav-agent](https://github.com/TylerFlar/endonav-agent)) enters the procedural kidney, DFS-explores every calyx, finds and laser-fragments stones, baskets the fragments, verifies each calyx is stone-free, and exits once the entire collecting system is cleared. It sees only what a real scope would—the camera frame plus noisy proprioception—with the simulator's ground truth reserved for evaluation.

---

### Repositories

- **Procedural kidney mesh/asset generator** (current simulator) — [kidney-meshgen](https://github.com/TylerFlar/kidney-meshgen)
- **Autonomous ureteroscopy agent** — [endonav-agent](https://github.com/TylerFlar/endonav-agent)
- **Reactive depth-based exploration** (real endoscope footage) — [endonav-exploration](https://github.com/TylerFlar/endonav-exploration)
- **Earlier all-Python simulator** (predecessor to kidney-meshgen) — [endonav-sim](https://github.com/TylerFlar/endonav-sim)