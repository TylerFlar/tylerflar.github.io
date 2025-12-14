---
title: Web Mining and Recommender Systems
code: CSE 158R
date: 2024-09-26  
term:  Fall 2024  
level: undergraduate  
---

This course focused on practical recommender systems and web mining, with Python-based implementations over real interaction data (user–book logs, ratings, etc.).

---

## Project 1: Book Recommendation from Implicit & Explicit Feedback

**Goal:**  
Given a large set of `(user, book, rating)` interactions, build two models:

1. A **rating predictor** `r̂(u, b)` that estimates how a user would rate a book.
2. A **read predictor** `p̂_read(u, b)` that guesses whether a user would read a given book at all.

All predictions were written out to CSV files to be graded and evaluated on hidden test sets.

### Part 1 – Rating Prediction with User & Item Biases

For ratings, I implemented a classic **bias-based** model:


$$\hat{r}(u, b) = \alpha + \beta_u + \beta_b$$

where:

- $\alpha$: global mean rating  
- $\beta_u$: user-specific bias (some users rate high, some low)  
- $\beta_b$: item-specific bias (some books are generally liked more than others)

From the training data:

- I aggregated all ratings to compute $\alpha$.
- I kept:
  - `user_ratings[user] = [r₁, r₂, ...]`
  - `book_ratings[book] = [r₁, r₂, ...]`
  - `user_read_books[user] = {book₁, book₂, ...}`

Then I iteratively refined the biases with L2 regularization to avoid overfitting users/books with few ratings. Conceptually:

```python
# Pseudocode – not the exact assignment code
alpha = global_mean_rating
user_bias = defaultdict(float)
book_bias = defaultdict(float)

for _ in range(max_iters):
    # update user biases
    for u in users:
        # average residual over books user u rated
        residuals = [
            r - alpha - book_bias[b]
            for (b, r) in ratings_per_user[u]
        ]
        user_bias[u] = f_user(residuals)  # regularized update

    # update book biases
    for b in books:
        residuals = [
            r - alpha - user_bias[u]
            for (u, r) in ratings_per_book[b]
        ]
        book_bias[b] = f_book(residuals)  # regularized update
```

Key ideas (without giving away the exact formulas):
- Each update step tries to explain what’s **left over** after accounting for $\alpha$ and the other set of biases.
- Regularization terms shrink biases toward zero, especially when there’s little data for a user or book.
- I stopped iterating once the average change in biases was small (a simple convergence check).

For prediction on new `(user, book)` pairs, I combined everything and clamped ratings to the allowed range (e.g., 1–5):
```python
pred = alpha + user_bias.get(u, 0.0) + book_bias.get(b, 0.0)
pred = min(max(pred, 1.0), 5.0)
```

This model is simple, fast, and surprisingly strong as a baseline, especially on large, sparse recommendation datasets. The RMSE on the hidden test set was around **1.5**, placing me **top 3%** in the class.

### Part 2 – Read Prediction with User & Item Read Biases

The second task was to predict whether a user would read a given book (binary: 0/1). There were no explicit read labels beyond the observed interactions, so this is an implicit feedback problem.

I built a rule-based model combining:

**1. Book popularity**
- Count how often each book appears in the training interactions.
- Convert counts to a simple popularity score, such as:
  $$\text{pop}(b)=\frac{\text{\# interactions on } b}{\text{total interactions}}$$
**2. User reading activity**
- For each user, count how many distinct books they’ve read.
- Use this to distinguish between “light” and “heavy” readers.
**3. Familiarity**
- If a user has already interacted with a book before, that’s a strong signal for prediction.

Using these, I defined thresholds and bands (e.g., “highly popular”, “moderately popular”) based on percentiles of the popularity distribution. The prediction rule, in words:
- Predict **“would read”** if:
  - the book is in the top **popularity band**, **or**
  - the book is at least moderately popular **and** the user is a sufficiently active reader, **or**
  - the user has read that book before (familiar title).
- Otherwise, predict **“would not read”**.

In pseudocode:
```python
# Pseudocode – high-level logic
def predict_read(user, book):
    pop = book_popularity.get(book, 0.0)
    seen_before = book in user_read_books[user]
    user_reads = len(user_read_books[user])

    if pop >= high_pop_threshold:
        return 1
    if pop >= mid_pop_threshold and user_reads >= active_user_threshold:
        return 1
    if seen_before:
        return 1
    return 0
```
This keeps the model interpretable and avoids overfitting while still reacting to:
- global trends (which books everyone reads),
- user-specific behavior (how much they read),
- and direct overlap with their reading history.

The accuracy on the hidden test set was around **76%**, placing me in the **top 24%** of the class.

---

## Project 2: Open-Ended Recommender System Exploration

For the second assignment, we could choose any recommendation approach and dataset. The project can be read about in more detail [here](/projects/music-genre-prediction/).