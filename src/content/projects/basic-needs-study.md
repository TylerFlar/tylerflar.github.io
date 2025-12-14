---
title: "Basic Needs Center Study"
summary: "Assessing the impact of UCSD's Basic Needs Center on student food insecurity."
image: /assets/images/projects/basic-needs-study-cover.png
date: 2024-01-12
date_range: "Jan 2024 – Mar 2024"
---

We combined **UCOP Basic Needs Dashboard data (multi-year)** with a **custom UCSD student survey (n=116)** to study whether **service awareness and utilization** align with **food insecurity rates**, and how patterns differ by demographic groups.  

**Main takeaway:** awareness is often high, but **usage is much lower**, and **awareness alone shows weak correlation** with food insecurity—suggesting additional barriers like access, eligibility, stigma, and adequacy of support.

---

## Research Question
**Primary:** How does utilization of UCSD’s Basic Needs Center (BN) services affect food insecurity levels among students?

**Subquestions**
- What is the impact of engaging with the **CalFresh office** on approval rates?
- How does **CalFresh approval** influence reliance on **FRN** and **TFP**?
- How do **FRN / TFP / CalFresh usage rates** correlate with food insecurity rates?

---

## Data
### Dataset 1 — UCOP Basic Needs Dashboard (UC-wide)
- **Observations:** ~50k  
- **Variables:** 5  
- **Coverage:** Multiple survey years (e.g., 2016, 2018, 2020, 2022)  
- **Use:** Food insecurity rates by campus + identity groups over time

### Dataset 2 — COGS 108 Student Basic Needs Survey
- **Observations:** 116 (unfortunately a small n due to survey distribution challenges) 
- **Variables:** 22  
- **Use:** Demographics + awareness/usage of BN services + CalFresh application outcomes

---

## Methods
### 1) Cleaning & Harmonization
- Standardized UCOP categories across years (e.g., older binary categories vs. newer *low/very low*).
- Cleaned survey columns for analysis-ready naming.
- Collapsed multi-select demographics into consistent buckets (e.g., “Multiple”, “No Response”).

### 2) Exploratory Data Analysis (EDA)
- Service awareness vs. usage distributions (BN Hub, TFP, FRN, CalFresh Team).
- Demographic breakdowns (race/ethnicity, gender, year, additional identities).
- Heatmaps (normalized contingency tables) for demographic vs service response patterns.

### 3) Combined Comparison + Correlation
- Used 2022 UCOP as the closest comparison point to our survey year.
- Mapped identity labels between datasets and compared:
  - **% food insecure** (UCOP) vs **% aware/used services** (survey)
- Computed Pearson correlations between food insecurity and awareness (per service).

---

## Key Findings
### Awareness ≠ Utilization
Across services, many students reported:  
**“I’ve heard of this service, but never used it.”**  
Usage remained consistently lower than awareness.

### Usage varies by demographic group
- Usage patterns differed by race/ethnicity, gender identity, and class standing.
- Some subgroups showed particularly low awareness/usage, suggesting outreach gaps and/or service barriers.

The full analysis, including visualizations and statistical summaries, is available in the [notebook](https://github.com/COGS108/Group082_WI24/blob/master/FinalProject_Group082_WI24.ipynb).