---
title: "TritonBot (RoboCup Small Size League)"
summary: "Leading the subteam behind the software on each robot for UC San Diego's RoboCup soccer team, my first lead role."
image: /assets/images/projects/robocup-tritonbot/cover.png
date: 2023-06-12
cv: project/robocup
category: software
role: "TritonBot subteam lead, Tritons RCSC"
---

Tritons RCSC is UC San Diego's IEEE club for the RoboCup Small Size League, where teams of small wheeled robots play soccer, steered by an AI off the field that watches the game through overhead cameras. In the 2022–23 school year I led TritonBot, the subteam behind the software that runs on each robot. It was a small role, and the first time I'd led anything.

TritonBot sits between the AI and the robot's motor controller. It takes the AI's commands over UDP, turns velocities on the field into the robot's own frame, and passes them on, with feedback going back the other way.

## What I did

That year the club moved to a new repo, and my part was bringing the robot software into it.

- I ported the Python TritonBot modules from the previous year's code: the AI and simulator interfaces, the vision filter and the command processor that converts the AI's field velocities. They came over nearly unchanged, since the code was the previous team's.
- I set up the network config (the vision multicast group and the simulator and robot ports), checked in the generated Protobuf bindings, and fixed the run scripts so the AI and TritonBot start from the new layout.
- I outlined a USB interface to the robot's embedded board. It never got past a stub.

The cover is a CAD render of one of the club's robots.
