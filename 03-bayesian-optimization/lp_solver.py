"""Playoff elimination MIP - originally prototyped in eliminationLP_v2.m (Matlab)."""
import numpy as np
from pulp import LpProblem, LpMinimize, LpVariable, LpBinary, lpSum, value, PULP_CBC_CMD

# ---------------------------------------------------------------------------
# NFL team / division / conference constants (2022 structure)
# ---------------------------------------------------------------------------

AFC_NORTH = ['BAL', 'CIN', 'CLE', 'PIT']
AFC_SOUTH = ['HOU', 'IND', 'JAX', 'TEN']
AFC_EAST  = ['BUF', 'MIA', 'NE',  'NYJ']
AFC_WEST  = ['DEN', 'KC',  'LV',  'LAC']
NFC_NORTH = ['CHI', 'DET', 'GB',  'MIN']
NFC_SOUTH = ['ATL', 'CAR', 'NO',  'TB']
NFC_EAST  = ['DAL', 'NYG', 'PHI', 'WSH']
NFC_WEST  = ['ARI', 'LAR', 'SF',  'SEA']

AFC = AFC_NORTH + AFC_SOUTH + AFC_EAST + AFC_WEST
NFC = NFC_NORTH + NFC_SOUTH + NFC_EAST + NFC_WEST

ALL_DIVISIONS = [AFC_NORTH, AFC_SOUTH, AFC_EAST, AFC_WEST,
                 NFC_NORTH, NFC_SOUTH, NFC_EAST, NFC_WEST]
DIVISION_CONFERENCES = ['AFC'] * 4 + ['NFC'] * 4

CONFERENCE_MAP = {t: 'AFC' for t in AFC} | {t: 'NFC' for t in NFC}

_AFC_SET = set(AFC)
_NFC_SET = set(NFC)


# ---------------------------------------------------------------------------
# MIP function
# ---------------------------------------------------------------------------

def elimination_lp(
    beta_val: int,
    division: list,
    records: dict,
    matchups: list,
    gij: np.ndarray,
    conference: list,
) -> list:
    """Return list of team abbreviations in `division` that are mathematically
    eliminated from playoff contention.

    MIP formulation (constraints 2.18-2.28). See OPTIMIZATION_PLAN.md §6.

    Parameters
    ----------
    beta_val  : wild card spots per conference (fixed at 3)
    division  : 4 team abbreviations in this division
    records   : {abbr: [wins, losses]} for all 32 teams
    matchups  : [(away_abbr, home_abbr)] all season games (canonical order)
    gij       : int array len=len(matchups), 1 = game not yet played
    conference: 16 team abbreviations in this conference
    """
    M = 17  # big-M = total regular season games per team

    wic = {t: records[t][0] for t in conference}  # current wins per conference team

    # --- filter to remaining games involving >= 1 conference team ----------
    conf_set = set(conference)
    conf_matchups = [
        (away, home)
        for (away, home), g in zip(matchups, gij)
        if g == 1 and (away in conf_set or home in conf_set)
    ]
    n = len(conf_matchups)

    # --- determine conference divisions (needed for constraint 2.21) -------
    conf_label = 'AFC' if division[0] in _AFC_SET else 'NFC'
    conf_divisions = [
        d for d, c in zip(ALL_DIVISIONS, DIVISION_CONFERENCES) if c == conf_label
    ]

    # --- decision variables ------------------------------------------------
    # x1[i]: wins allocated to the away team in conf_matchup i
    # x2[i]: wins allocated to the home team in conf_matchup i
    prob = LpProblem(f"elim_{division[0]}", LpMinimize)
    x1 = [LpVariable(f"x1_{i}", lowBound=0) for i in range(n)]
    x2 = [LpVariable(f"x2_{i}", lowBound=0) for i in range(n)]

    alpha = {t: LpVariable(f"a_{t}", cat=LpBinary) for t in conference}
    delta = LpVariable("delta", cat=LpBinary)
    u_D = LpVariable("u_D", lowBound=0, cat='Integer')
    u_W = LpVariable("u_W", lowBound=0, cat='Integer')
    u   = LpVariable("u",   lowBound=0, cat='Integer')

    # --- objective (2.18) -------------------------------------------------
    prob += u

    # --- 2.19: x1[i] + x2[i] = 1 for each remaining conf matchup ---------
    for i in range(n):
        prob += x1[i] + x2[i] == 1

    # helper: team k's projected additional wins from remaining conf games
    def extra_wins(k):
        return lpSum(
            [x1[i] for i, (away, _) in enumerate(conf_matchups) if away == k] +
            [x2[i] for i, (_, home) in enumerate(conf_matchups) if home == k]
        )

    # --- 2.20: u_D >= w_i + sum_j(x_ij) for all i in D_k ----------------
    for team in division:
        prob += u_D >= wic[team] + extra_wins(team)

    # --- 2.21: sum_{i in D_k}(alpha_i) >= 1 for all k in conference ------
    for div in conf_divisions:
        prob += lpSum(alpha[t] for t in div) >= 1

    # --- 2.22: sum_{i in C}(alpha_i) = beta + 3 --------------------------
    prob += lpSum(alpha[t] for t in conference) == beta_val + 3

    # --- 2.23: w_i + sum_j(x_ij) <= u_W + M*alpha_i for all i in C ------
    for team in conference:
        prob += wic[team] + extra_wins(team) <= u_W + M * alpha[team]

    # --- 2.24: u + M*delta >= u_D -----------------------------------------
    prob += u + M * delta >= u_D

    # --- 2.25: u + M*(1 - delta) >= u_W -----------------------------------
    prob += u + M * (1 - delta) >= u_W

    # --- solve ------------------------------------------------------------
    prob.solve(PULP_CBC_CMD(msg=0))

    fval = round(value(u))

    # --- elimination check ------------------------------------------------
    # Count each team's remaining games directly from gij rather than using
    # M - (wins+losses), which is wrong for 16-game seasons (2010-2020).
    eliminated = []
    for team in division:
        games_remaining = sum(gij[i] for i, (away, home) in enumerate(matchups)
                              if away == team or home == team)
        if (wic[team] + games_remaining) < fval:
            eliminated.append(team)
    return eliminated
