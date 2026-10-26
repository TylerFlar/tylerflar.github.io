---
title: "Lycanworks"
summary: "My one-person studio that sells avatar bases for VRChat, with my own release tooling and storefront."
date: 2025-09-30
cv: project/lycanworks
category: software
role: "Founded it and run it alone"
links:
    - { label: Store, href: "https://lycanworks.com" }
---

Lycanworks is my one-person VRChat avatar studio. It started in September 2025 as a website for art commissions, and in 2026 it became a studio that sells avatar bases: ready-made 3D characters that VRChat players customize and wear as themselves.

Its first base, Juniper Cerva, a doe, went on sale on Gumroad in September 2026. It's delisted for now while I make a new version.

## Juniper Cerva

- A Unity package with a PC build at 41,123 triangles and a Quest build at 14,277, plus a lighter fallback.
- Face tracking through Adjerry91's VRCFT templates, and all 15 visemes for lip sync.
- Seven pelt presets: Fawn, Whitetail, Mule, Melanistic, Leucistic, Strawberry and Azure.

## Release tooling

Every release goes through a Python pipeline I wrote, 7 modules and about 1,250 lines:

- It builds clean copies of the Blender and Substance 3D Painter files through their Python APIs, with Blender running headless.
- It scrubs local paths out of everything it ships.
- A leak scan opens every shipped file properly, in seven formats (.blend, .spp, .fbx, .png, .psd, .unitypackage and text), and looks for local paths, my user name, working names and VRChat avatar IDs. The build stops on any hit.

I also scripted the studio's Discord server, building its roles, channels, forums and AutoMod rules from a written plan through Discord's API, and wrote a script that cuts Instagram carousels out of renders with OpenCV.

## The website

[lycanworks.com](https://lycanworks.com) is an Astro site. Each product is a YAML file checked against a schema at build time, so a bad field stops the build. A product can be available, coming soon, delisted or retired, with buy links to Gumroad and other stores, and Gumroad's checkout script only loads once you reach for a buy button. It deploys to GitHub Pages from GitHub Actions.
