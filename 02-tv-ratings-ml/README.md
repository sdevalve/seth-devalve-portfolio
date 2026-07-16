# Predicting Intra-Market NFL TV Ratings

A four-model study of the same continuous regression problem: **given everything
knowable before kickoff, predict a game's TV rating within each local media market.**
The goal is not a single model but a _principled comparison_. It builds up from a
from-scratch neural network to gradient boosting to a regularized linear baseline,
holding preprocessing constant so the accuracy numbers are apples-to-apples.

> **TL;DR for reviewers:** Four independent modeling frameworks, one leak-free
> preprocessing pipeline, all evaluated on the raw ratings scale. They converge to
> **R² ≈ 0.91** via 4-fold time-series cross validation, including a linear model that nearly matches gradient boosting.
> The interesting result is _why_ they converge, not which one wins by 0.003.

---

## The problem

- **Target:** `AA__000_`, a game's rating in a given local market (continuous, ~3 to 1865).
- **Unit of observation:** one (game × market) pair. A single Sunday game produces ~56
  rows, one per media market, because the same game draws very differently in Dallas vs.
  Buffalo.
- **Why it's hard:** the target is right-skewed, and the signal is a mix of _team quality_,
  _market-team affinity_ (does this market care about this team?), _broadcast slot_, and
  _concurrency_ (what else is on at the same time). Team and market are high-cardinality
  categoricals, which is what makes the modeling choices interesting.
- **Split:** temporal. Train on earlier seasons, validate on the most recent, so the
  evaluation reflects genuine forecasting, not interpolation.

The dataset is produced by the companion **[data pipeline](../01-data-pipeline/)**
(Story 1 in this portfolio); this project consumes its output.

---

## Read the notebooks in this order

Each notebook is self-contained and fully narrated. The order is pedagogical, from
maximum transparency (hand-derived math) to maximum performance to a humbling baseline.

| #   | Notebook                                                                               | What it demonstrates                                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[MLP_tv_ratings.ipynb](MLP_tv_ratings.ipynb)**                                       | A multilayer perceptron in **pure NumPy**: forward/backprop, He initialization, Adam step-size optimization, and hidden-layer dropout all derived and implemented from scratch. Categoricals handled via one-hot encoding. Establishes the foundations everything else builds on.                                                                                   |
| 2   | **[MLP_embeddings_tv_ratings.ipynb](MLP_embeddings_tv_ratings.ipynb)**                 | The same MLP, but high-cardinality categoricals become **learned embeddings** with a **bilinear team×market interaction** term. Includes embedding-space analysis (cosine similarity, PCA, learned interaction heatmap). Shows how to represent entities without exploding dimensionality, and how similar accuracy is achieved with far fewer modeling parameters. |
| 3   | **[LightGBM_tv_ratings.ipynb](LightGBM_tv_ratings.ipynb)**                             | Gradient-boosted trees with **native categorical handling** and a **500-trial Optuna** hyperparameter search (two-phase: wide then refined). SHAP interpretation, per-subset error analysis, artifact persistence. The performance ceiling for this problem.                                                                                                        |
| 4   | **[LinearModel_raw_target_tv_ratings.ipynb](LinearModel_raw_target_tv_ratings.ipynb)** | A regularized **Ridge** model with a disciplined feature-selection pipeline: Lasso stability selection, mRMR ranking, bias-variance tradeoff, and a curated feature set, all over polynomial-expanded features. The point: a well-engineered linear model lands within **0.003 R²** of LightGBM.                                                                    |

---

## Results

All four models are trained and evaluated on the **raw ratings scale**. The _R² (log scale)_
column is a secondary diagnostic (raw-target predictions rescored in log space); see the
methodology note below on why no presented model uses a log-transformed target.

| Model            | R² (raw)   | R² (log scale) | RMSE      | Target | Evaluation                |
| ---------------- | ---------- | -------------- | --------- | ------ | ------------------------- |
| **LightGBM**     | **0.9152** | 0.8625         | 38.74     | raw    | 4-fold time-series CV OOF |
| Ridge Regression | 0.9128     | 0.8983         | 39.21     | raw    | 4-fold time-series CV OOF |
| MLP (one-hot)    | 0.9122     | 0.8488         | **37.91** | raw    | temporal holdout          |
| MLP (embeddings) | 0.9095     | 0.8583         | 38.50     | raw    | temporal holdout          |

**What to take from this:**

- **The models converge.** A ~0.006 R² spread across four very different function
  classes says the ceiling here is set by the _features and the noise_, not the
  estimator. Recognizing that is the difference between chasing leaderboard decimals and
  understanding a problem.
- **RMSE does not track R² ordering.** The one-hot MLP has the _lowest_ RMSE despite not
  the highest R², a reminder to look at more than one metric on a skewed target.
- **Apples-to-apples has a caveat.** LightGBM and Ridge use 4-fold out-of-fold CV; the
  MLPs use a single temporal holdout because of the training time that cross-validating a
  neural network costs on a standard CPU laptop. The OOF estimates average over more
  validation data and are the more conservative read.

---

## Repository layout

The files for this story:

```
02-tv-ratings-ml/
├── MLP_tv_ratings.ipynb                    ← notebook 1
├── MLP_embeddings_tv_ratings.ipynb         ← notebook 2
├── LightGBM_tv_ratings.ipynb               ← notebook 3
├── LinearModel_raw_target_tv_ratings.ipynb ← notebook 4
│
├── tv_ratings_preprocessing.py   shared: leak-free feature engineering
├── MLP_core.py                   shared: pure-NumPy MLP primitives (both MLP notebooks)
├── MLP_analysis.py               shared: permutation importance, actual-vs-predicted, subset R²
└── lightgbm_utils.py             shared: SHAP, feature importance, artifact persistence
```

The file structure deliberately keeps _reusable implementation_ in modules while keeping
_modeling decisions_ (feature lists, architectures, hyperparameters) inline in the
notebooks, where a reader can easily see and follow them.

---

## Methodology notes

- **Leak-free feature engineering.** Market-level features (e.g. a team's prior-year
  average draw in a market) are built with an explicit season shift so a row only ever
  sees prior-season information.
- **Consistent row universe.** All four notebooks apply the same filters (Sunday games,
  `Season > 2013`) so every model trains and validates on identical data.
- **Why none of the presented models transform the target.** A right-skewed target can
  bias a model toward its large residuals, producing a model that fits high-viewership
  games well while systematically overshooting low-viewership ones. The three model
  families are exposed to this differently. Neural networks are largely unaffected,
  because their nonlinearity lets them fit the skew directly. Gradient-boosted trees like
  LightGBM are mostly immune for the same reason, though their splitting and sampling
  strategies can still be pulled toward high-residual regions, especially in the early stage trees. A linear model's symmetric
  squared-error loss is the most exposed, so log-transforming the target before training
  (and inverting before evaluation) is a common remedy. That remedy is not free: it trades
  the high-value bias for a new bias toward low-value games. Rather than let theory decide,
  I trained sibling notebooks for both LightGBM and Ridge on log-transformed and raw
  targets, then plotted predictions to check for systematic over- or under-prediction. In
  this case neither the LightGBM nor the Ridge model systematically overshot
  low-viewership games, and both were more accurate when trained on the raw target, so the
  raw-target versions are the ones presented here.
- **Interpretation is a first-class deliverable**, not an afterthought: SHAP for
  LightGBM, learned-embedding geometry for the embedding MLP, permutation importance for
  both MLPs, and per-team, per-market, and per-network subset R² to find _where_ each
  model is strong vs weaker.

---

## Running it

These notebooks are trained on proprietary data and cannot be run outside its owning
environment. They are committed with all cell outputs intact so they can be read end to
end on GitHub as finished visual artifacts.
