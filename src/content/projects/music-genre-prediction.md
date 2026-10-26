---
title: "Music Genre Prediction"
summary: "Guessing a song's genre, out of 19, from its Spotify audio features, for a two-person CSE 158R project."
image: /assets/images/projects/music-genre-prediction/cover.png
date: 2024-12-02
cv: project/music-genre
category: class
role: "Did the analysis, the baseline and the models (two-person CSE 158R project)"
links:
    - { label: Code, href: "https://github.com/TylerFlar/music-genre-prediction" }
---

The second assignment in CSE 158R (Web Mining and Recommender Systems) in Fall 2024 was open-ended. A partner and I tried to predict a song's genre from its Spotify audio features: danceability, energy, acousticness and the rest. My partner tried a logistic regression. The exploratory analysis, the baseline, the models and the write-up were mine.

## Data

The dataset is 15,150 classic hits from Kaggle across 19 genres. Removing 279 duplicate artist and track pairs left 14,871 songs, which I split 80/20 with the genre mix kept the same on both sides.

- **Uneven classes.** Pop dwarfs genres like World and Gospel, so I balanced the training set with SMOTETomek, which synthesizes examples of the small genres and removes ambiguous pairs at the borders.
- **Features.** Energy and loudness were strongly correlated, so I dropped loudness. Four features were heavily skewed (speechiness, acousticness, instrumentalness and liveness), so I log-transformed them, then standardized everything. That left 12 features.

## Results

I trained each model on the training set, tuned the promising ones with grid search, and scored them on the 2,975 held-out songs:

| Model | Test accuracy |
| --- | --- |
| Baseline (guesses by class frequency) | 0.064 |
| QDA | 0.252 |
| k-nearest neighbors | 0.253 |
| Logistic regression | 0.268 |
| MLP, tuned | 0.302 |
| SVM | 0.324 |
| Extra trees | 0.349 |
| XGBoost | 0.351 |
| CatBoost, tuned | 0.352 |
| Random forest, tuned | 0.373 |
| Soft-voting ensemble (random forest, XGBoost, extra trees, QDA) | 0.376 |

The cover is the ensemble's confusion matrix. Most mistakes land in pop and country, the two biggest classes, and genres that share a sound get mixed up, like rock and alternative rock, or folk and country.

## What didn't work

Nineteen genres from a dozen audio features is a hard problem. 0.37 is almost six times the baseline, and it's still wrong about two times in three.

I also picked the ensemble by trying combinations of models against the test set, so its 0.376 is a little optimistic. The tuned random forest's 0.373 is the fairer number.
