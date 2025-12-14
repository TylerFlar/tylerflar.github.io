---
title: "Music Genre Prediction"
summary: "Predicting music genres from audio features using machine learning."
image: /assets/images/projects/music-genre-prediction-cover.png
date: 2024-09-12
date_range: "Sep 2024 – Dec 2024"
---

This project builds and evaluates machine learning models that predict a song’s **genre** from Spotify-style audio features (e.g., danceability, energy, acousticness). The workflow follows a full ML pipeline: dataset identification → exploratory data analysis (EDA) → baseline → model iteration + tuning → ensemble comparison.

- **Dataset**: 15,150 tracks, 18 columns, **19 genres**. No missing values; duplicates were removed before modeling.
- **Main challenge**: **Class imbalance** (e.g., Pop much larger than smaller genres like World/Gospel), addressed during training with SMOTETomek.
- **Feature notes from EDA**: strong correlation between **Energy and Loudness**, so **Loudness was dropped** in the main modeling notebook to reduce multicollinearity; skewed features (`Speechiness`, `Acousticness`, `Instrumentalness`, `Liveness`) were log-transformed and then standardized.
- **Baseline**: DummyClassifier accuracy ≈ 0.06
- **Best single model**: **Tuned Random Forest** accuracy ≈ **0.373**
- **Best overall model**: **Soft-voting ensemble** (Random Forest + XGBoost + Extra Trees + QDA) accuracy ≈ **0.376**
- **Model takeaway**: Tree-based methods (RF / XGBoost / ExtraTrees / CatBoost) performed best; ensembling gave a small additional lift.

---

## Full study (notebooks)

The complete EDA, modeling decisions, and evaluation details are available in the project notebooks. Contact me for access to the full analysis.