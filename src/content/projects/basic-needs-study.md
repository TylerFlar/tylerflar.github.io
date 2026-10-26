---
title: "Basic Needs Center Study"
summary: "Comparing food insecurity at UC San Diego with whether students know about and use the campus food services, for a COGS 108 project."
image: /assets/images/projects/basic-needs-study/cover.png
date: 2024-03-20
cv: project/basic-needs
category: class
role: "Did the data cleanup, the survey charts and the abstract (four-person COGS 108 project)"
---

For COGS 108 (Data Science in Practice) in Winter 2024, our group of four asked whether UC San Diego's Basic Needs services reach the students who need them. We compared two sources:

- the UC Office of the President's Basic Needs Dashboard, with UCSD undergraduates' food-insecurity rates by group for 2016, 2018, 2020 and 2022
- our own survey of about 120 UCSD students, asking whether they'd heard of and used the Basic Needs Hub, the Triton Food Pantry, the Food Recovery Network and the CalFresh team

## What I did

I wrote the research questions and background for our proposal. I combined the four years of dashboard tables into one dataset and cleaned the survey responses. Then I made the survey charts: how many students had heard of and used each service, and heatmaps of each service against students' race and other identities. I also wrote the abstract.

Trevor Tran started the dashboard cleaning code. Kailey Wilkens did the final analysis that compared the 2022 dashboard with our survey. Jevan Chahal and Zhaoyu Dou did early exploration and the survey's demographics.

## What we found

For every service, the most common answer was "I've heard of this service, but never used it." The cover shows it for the Basic Needs Hub: in every identity group, most students knew about it and few had used it.

Kailey's comparison found weak links between a group's food-insecurity rate and how many in that group had heard of each service, with Pearson correlations from 0.07 (Triton Food Pantry) to 0.44 (CalFresh). With only a handful of groups and no significance tests, that doesn't say much either way. Our write-up pointed at other barriers, like eligibility and stigma, but our survey couldn't test them.

The notebook lives in the course's private GitHub organization, and the survey has sensitive answers, so it isn't linked here.
