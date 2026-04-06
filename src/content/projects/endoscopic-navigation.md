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

Research is currently focused on two threads:

1. **Minimal sensing for agentic navigation** — determining what tools and information are sufficient for an agentic system to navigate the kidney's graph structure. Key questions include how to localize within the node graph using depth and junction count, and how to distinguish revisited locations from new ones to ensure complete coverage.

2. **Kinematic simulation in NVIDIA Isaac Sim** — building a physics-based simulation of the flexible robotic endoscope to evaluate navigation algorithms in anatomically constrained environments before moving to real hardware.

---

### Repository

Experimental work on depth estimation and branch detection: https://github.com/TylerFlar/endonav-exploration