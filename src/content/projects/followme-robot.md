---
title: "FollowMe Robot"
summary: "A Boston Dynamics Spot robot that follows a user."
image: /assets/images/projects/followme-robot/cover.png
date: 2025-04-12
date_range: "Apr 2025 – Jun 2025"
---

**FollowMe** was a project for NIWC (Naval Information Warfare Center) to turn a Boston Dynamics Spot into a “human follower” that can be controlled from (and eventually track) a smartwatch. The full system had three pillars: smartwatch command/control, computer vision tracking, and Bluetooth direction finding.

![FollowMe Robot](/assets/images/projects/followme-robot/system-annotated.png)

I will mainly go over my part: building and stress-testing a **Bluetooth-based follower** that tries to estimate where the user is (relative to Spot) using BLE radio measurements—especially useful when the user is **out of the camera’s view**.

---

## The Bluetooth idea (in one paragraph)

If the user (or their smartwatch) periodically transmits BLE packets with a **Constant Tone Extension (CTE)**, a receiver with an **antenna array** can sample IQ data across its antennas and estimate the signal’s **Angle of Arrival (AoA)**. If we combine that angle with an approximate range estimate from RSSI (signal strength), we can synthesize a **3D position** of the beacon and feed it into the robot’s follower controller.

That’s the dream. The reality is: **real environments are brutal** (multipath, interference, reflections, body-blocking), and with only one locator you don’t get true triangulation—so filtering and sanity checks matter *a lot*.

---

## Hardware + tools I worked with

### Receiver (on the robot)
- Silicon Labs **BG22 Bluetooth Dual Polarized Antenna Array Pro Kit** (a 4×4 dual-polarized URA)

![Silicon Labs BG22 Antenna Array](/assets/images/projects/followme-robot/antenna-array.jpg)

### Tag / beacon (carried by the user)
- During development we used an **EFR32BG22 Thunderboard** as a controllable BLE tag (easier firmware access)
- Long-term goal: use the **Samsung Galaxy Watch Ultra** as the beacon so the user carries less hardware

### Dev stack

- **Simplicity Studio** + Silicon Labs direction-finding SDK / RTL library
- **C** for pulling data off the board
- **Python** for processing + ROS plumbing
- **ROS1 Noetic** on Ubuntu 20.04 for messaging and integration

---

## Pipeline: IQ → angle, RSSI → range, fuse → position

![Bluetooth FollowMe Pipeline](/assets/images/projects/followme-robot/bt-pipeline.png)

### 1) AoA from IQ samples

Each BLE packet’s CTE gives phase-coherent IQ samples. Across an antenna array, phase differences encode the incoming wave direction. The estimator (Silicon Labs RTL / MUSIC-style approach) outputs:
- azimuth: θ
- elevation: φ

I then applied a lightweight smoother to reduce one-frame spikes:

$$\hat{\alpha}_k = (1 - \beta)\hat{\alpha}_{k-1} + \beta \alpha_k$$

(We used a fairly aggressive $\beta = 0.65$ during bring-up just to make it usable in real-time.)

### 2) Range from RSSI (log-distance path loss)

RSSI-based ranging is inherently squishy, but it’s the simplest way to get a distance proxy:

$$\rho=10\frac{A-r}{10\eta}$$

To keep it from going totally off the rails, I added an **outlier rejection** (e.g., ignore sudden RSSI jumps larger than a set threshold) and averaged across antenna elements to reduce fading noise.

### 3) Spherical → Cartesian

Once you have ($\rho$, $\theta$, $\phi$), convert into a position estimate in the locator frame:

$$x = \rho\sin\phi\cos\theta$$
$$y = \rho\sin\phi\sin\theta$$
$$z = \rho\cos\phi$$

That $(x,y,z)$ becomes the “target point” for the follower controller (or for visualization on the robot’s map).

## What worked vs what didn’t

### What worked

- We could reliably get real-time AoA updates at decent frequency
- The end-to-end chain “beacon → estimate → ROS topic” worked, and was ready to plug into a controller
- In clean RF environments, the direction signal was often “correct enough” to be meaningful

### What didn’t (and why we didn’t fully ship Bluetooth-following)

- **Multipath** indoors can make the “strongest path” not the direct path, so the angle estimate jitters or locks onto reflections
- **RSSI ranging is not a tape measure**—two steps and a body turn can change it dramatically
- With a single locator, you’re fundamentally limited: you’re estimating position from (angle + shaky range) instead of triangulating from multiple receivers
- In our trials, the Bluetooth position estimates were **too noisy/inaccurate to trust as the primary follower**, so the project leaned harder on the vision-based follower for the final integrated demos