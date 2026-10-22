---
title: "FollowMe Robot"
summary: "Bluetooth direction finding so a Boston Dynamics Spot can keep following a person after its camera loses them."
image: /assets/images/projects/followme-robot/cover.png
date: 2025-06-12
cv: project/followme
category: research
role: "Built the Bluetooth direction-finding module (CSE 237D team project for NIWC)"
links:
    - { label: Paper, href: "https://hichristensen.com/publication/2026-chaser/" }
---

FollowMe was a project for NIWC (Naval Information Warfare Center) to turn a Boston Dynamics Spot into a robot that follows a person and takes commands from a smartwatch. It had three parts: smartwatch control, a camera-based follower, and Bluetooth direction finding. I built the Bluetooth part.

![FollowMe system overview](/assets/images/projects/followme-robot/system-annotated.png)

## Why Bluetooth

Cameras lose people. They walk around a corner, get blocked by someone else, or leave the frame. A Bluetooth signal still reaches the robot in those cases, so the idea was to have the person carry a small beacon and estimate where it is from the radio signal alone.

## How it works

The beacon sends Bluetooth Low Energy packets with a Constant Tone Extension. An antenna array on the robot samples that tone on each antenna, and the phase differences between antennas give the signal's angle of arrival. Signal strength (RSSI) gives a rough distance. Angle plus distance gives a 3D position the follower can steer toward.

### Hardware and tools

- Receiver on the robot: Silicon Labs BG22 dual-polarized antenna array kit, a 4×4 array
- Beacon: an EFR32BG22 Thunderboard during development, with a Samsung Galaxy Watch Ultra as the long-term goal so the user carries less
- Silicon Labs' direction-finding SDK, C for pulling data off the board, Python for processing, and ROS 1 Noetic on Ubuntu 20.04

![Silicon Labs BG22 antenna array](/assets/images/projects/followme-robot/antenna-array.jpg)

### The pipeline

![Bluetooth pipeline from IQ samples to a 3D position](/assets/images/projects/followme-robot/bt-pipeline.png)

**1. Angle.** Silicon Labs' library estimates azimuth $\theta$ and elevation $\phi$ from the IQ samples. Single-frame spikes were common, so I smoothed the angle with an exponential moving average:

$$\hat{\alpha}_k = (1 - \beta)\hat{\alpha}_{k-1} + \beta \alpha_k$$

During bring-up I used $\beta = 0.65$ so it would respond quickly.

**2. Distance.** RSSI goes through a log-distance path-loss model, where $A$ is the RSSI at one meter, $r$ the measured RSSI and $\eta$ the path-loss exponent:

$$\rho = 10^{\frac{A - r}{10\eta}}$$

RSSI jumps around a lot, so I threw out sudden jumps above a threshold and averaged across the antennas.

**3. Position.** Convert $(\rho, \theta, \phi)$ to a point in the array's frame:

$$x = \rho\sin\phi\cos\theta \qquad y = \rho\sin\phi\sin\theta \qquad z = \rho\cos\phi$$

That point goes out over MQTT and into ROS, where the follower can use it.

## What worked and what didn't

It worked end to end: beacon to position estimate to a ROS topic, at a useful update rate. In open spaces with little interference, the direction was often good enough to follow.

Indoors it was much worse. Signals bounce off walls, so the strongest path isn't always the direct one, and the angle jumps around. RSSI isn't a distance sensor either: one step or a turn of the body can swing it a lot. And with a single receiver there's no triangulation, only an angle and a rough range. In our trials the Bluetooth estimate was too noisy to be the main follower, so the final demos leaned on the camera follower, with Bluetooth as the backup.

## The paper

The full system was written up as **"CHASER: Robust Human Following on a Legged Robot Using Vision and Bluetooth"** and presented at the [2026 IEEE/ASME International Conference on Advanced Intelligent Mechatronics (AIM 2026)](https://www.aim2026.com) in Genova, Italy, July 7 to 10, 2026. In the paper, the Bluetooth module gives the heading that turns the robot back toward its operator when the camera loses them. On Spot, the combined system cut tracking interruptions by 70% compared with vision alone.

> Julian Raheema, Connor Gag, **Tyler Flar**, Helena Bender, Matthew Zheng, Kurt Talke, Ryan Kastner, and Henrik I. Christensen. "CHASER: Robust Human Following on a Legged Robot Using Vision and Bluetooth." *2026 IEEE/ASME International Conference on Advanced Intelligent Mechatronics (AIM)*, Genova, Italy, July 2026. [Paper](https://hichristensen.com/publication/2026-chaser/)
