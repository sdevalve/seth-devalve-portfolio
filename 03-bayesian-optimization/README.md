# Bayesian Season Simulation and Playoff-Contention Optimization

This story connects **statistics** and **operations research**. It builds a probabilistic
simulator of an NFL season, validates that its uncertainty is calibrated against 15 years
of history, and then feeds that simulator into a mixed-integer program that measures how
schedule design affects playoff races.

> **TL;DR for reviewers:** A frequentist game-outcome model produces miscalibrated season
> simulations. A Bayesian hierarchical upgrade fixes the calibration, verified against
> historical win-distribution histograms. Its output (a matrix of 100 simulated seasons)
> then drives a playoff-elimination MILP showing that an optimized schedule keeps measurably
> more teams in contention late in the year.

---

## The arc, in three notebooks

Read them in this order. All three notebooks live in this folder.

| #   | Notebook                                                                                         | What it demonstrates                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[bayesian_hierarchical_season_simulator.ipynb](bayesian_hierarchical_season_simulator.ipynb)** | Builds the **U-matrix**: a `(272 matchups × 100 draws)` array of simulated season outcomes. Shows a frequentist logistic model, demonstrates its simulations are miscalibrated, then rebuilds it as a **PyMC Bayesian hierarchical model** whose simulations match historical expectations. This notebook also covers decision threshold tuning for classification problems and reveals season-wide and team-specific home field advantage.                          |
| 2   | **[playoff_contention_historical.ipynb](playoff_contention_historical.ipynb)**                   | Runs a **playoff-elimination MILP** over every historical season from 2010 to 2024 to establish the historical shape of playoff races: how many teams are still mathematically alive in each of the final weeks.                                                                                                                                                                                                                                                     |
| 3   | **[playoff_contention_simulated.ipynb](playoff_contention_simulated.ipynb)**                     | Runs the same MILP against all 100 Bayesian draws on an **optimized schedule**, then overlays the result on the historical baseline to quantify the lift in late-season contention. The optimization model used to create the optimized schedule is proprietary and not revealed in this repo, however we do publish the MILP formulation for mathematical playoff elimination, which is utilized in this repo for calculating # of playoff contenders on each week. |

---

## Part 1: why Bayesian, concretely

Many optimization and game-theory workflows need a **stochastic** representation of a
system: not one predicted outcome, but a distribution of plausible ones. Here the system is
an NFL regular season and the representation is the U-matrix, where each column is one
simulated season, each row is a designated matchup, and each cell is that matchup's simulated win or loss.

To populate it you need per-matchup win probabilities. The natural first move is a
frequentist classifier (an L2 logistic regression over engineered team-strength features,
selected with a two-stage Lasso then iterative-L2 procedure). It predicts individual games
reasonably well. But when you simulate 100 seasons from it and histogram the
season-win totals, the distribution comes out **too peaked**: every team clusters near
8 to 9 wins. Real NFL history has fatter tails, with more 13-win and 3-win teams than
independent per-game probabilities can produce.

The fix is a **Bayesian hierarchical model** fit with PyMC (NUTS, 4 chains, 5000 draws).
The key structural choice is a team-season effect `e_tk` with a posterior standard
deviation `sigma_e_tk` that is itself drawn per simulated season. That injects
**correlated within-season team strength**: in a given simulated year a team is
consistently a bit better or worse than its point estimate, exactly the mechanism that
produces hot and cold seasons. Histogram the Bayesian simulations and they match the
historical plateau. That agreement is the whole point: only a calibrated simulator can be
trusted inside a downstream optimizer.

Convergence is reported honestly (R-hat, bulk and tail ESS), and the model's learned home
-field effects and team-season variance are visualized.

---

## Part 2: the playoff-contention MILP

The motivating hypothesis ties back to the [TV-ratings project](../02-tv-ratings-ml/README.md): more
franchises alive in the playoff race means more engaged fan bases which results in higher viewership.
So the question becomes, can schedule design keep more teams in contention deeper into the
season?

A team is **mathematically eliminated** in a given week if no completion of the remaining
schedule lets it reach the playoffs. Deciding that is a feasibility problem, formulated as a
mixed-integer program: allocate the wins of all remaining games so as to minimize the
number of wins the target team's division needs to send someone to the playoffs, subject to
division-winner and wild-card constraints. If the team cannot reach that threshold even
under the most favorable feasible completion, it is out. The formulation is reproduced in LaTeX inside the notebooks and is
solved with **PuLP + CBC**.

- **Historical notebook** runs this per week for 2010 to 2024 and plots the mean contention
  curve with its spread: the empirical shape of a playoff race.
- **Simulated notebook** runs it across all 100 Bayesian draws on an optimized schedule and
  overlays the result, isolating the schedule's causal effect on contention because the
  outcome distribution is held fixed by the U-matrix.

---

## Supporting code and source material

- [`utils.py`](utils.py): shared warehouse access, canonical matchup loading, schedule
  parsing, and team-name conversion.
- [`lp_solver.py`](lp_solver.py): the `elimination_lp()` MIP.
- `U_2021.csv` and `matchup_labels_2021.txt`: the U-matrix (272 matchups by 100 draws) and
  its row labels, produced by the Bayesian notebook and consumed by the simulated-schedule
  notebook.

---

## Running it

The simulator draws game results and preseason odds from the private
[data warehouse](../01-data-pipeline/), and the simulated-schedule notebook consumes a
proprietary optimized schedule, so the full arc is not runnable from the public repository.
All three notebooks are committed with outputs intact and are meant to be read end to end.
Model fitting uses PyMC and ArviZ; the MILP uses PuLP with the CBC solver.
