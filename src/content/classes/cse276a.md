---
title: Introduction to Robotics
code: CSE 276A
date: 2025-09-25
term: Fall 2025
level: graduate
---

This class provides an introduction to the fundamentals of robotics, covering topics such as kinematic models, motion planning, control systems, and robot perception. 

The class had us work on a skid-steer robot platform, implementing various algorithms to enable autonomous navigation using the onboard camera and IMU sensors. The environment used for development and testing was **ROS2 (Robot Operating System)** running on Ubuntu.

![Robot platform](/assets/images/classes/cse276a-robot.jpg)

Unfortunately, due to the class being largely graded on observations and footage, I cannot share much of the work publicly. However, the main projects included:

1. Implement and run a **kinematics-based waypoint–following** controller on the **Rover/Rubik PI** using a provided waypoint file.
2. Turn an open-loop controller into a **vision-based closed-loop controller** using landmarks to improve localization while driving a specified waypoint path.
3. Implement an **EKF-based SLAM system** that builds a landmark map and robot trajectory in a 10×10 ft environment from an unknown start pose.
4. In a landmarked 10×10 ft environment with a central obstacle, design and justify two path planners where one prioritizes safety and one minimizes time/distance.
5. Perform environment mapping using a SLAM approach in a random obstacle field.