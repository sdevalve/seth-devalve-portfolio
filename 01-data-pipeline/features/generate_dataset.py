"""
generate_dataset.py
Reads from the MySQL nfl_pipeline database and produces a training-ready dataset
for downstream ML models.
"""

import math
import os

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OUTPUT_PATH = r"C:\Users\ASR10\PyPr\nfl_python_local\111B\nfl_python\nfl_data_pipeline\NFLTV_ML_11_rebuilt.csv"

_YEAR_MAP = {2010 + i: i for i in range(16)}  # season → 0-based index

# Player boolean rules: list of (tv_code, season_range) pairs per player
PLAYER_RULES = {
    "brady":   [("PATS", range(2010, 2020)), ("BUCS", range(2020, 2023))], ## dataset starts at 2010
    "rodgers": [("PCKRS", range(2010, 2022)), ("JETS", range(2023, 2025)), ("STLRS", range(2025, 2027))],
    "mahomes": [("CHIEF", range(2018, 2026))],
}

# ---------------------------------------------------------------------------
# DB engine
# ---------------------------------------------------------------------------

def build_engine():
    load_dotenv()
    url = (
        f"mysql+pymysql://{os.environ['DB_USER']}:{os.environ['DB_PASSWORD']}"
        f"@{os.environ['DB_HOST']}:{os.environ['DB_PORT']}/{os.environ['DB_NAME']}"
    )
    return create_engine(url)


# ---------------------------------------------------------------------------
# build_base_df
# ---------------------------------------------------------------------------
# This SQL query does several things at once:
#   1. Joins viewership --> two copies of teams (one for home, one for away) --> markets
#   2. Converts start_time from "H:MM AM/PM" format into a proper time, then shifts
#      it by the market's timezone_offset to get Eastern Coast time
#      (e.g. a 1:00 PM Pacific game = 4:00 PM Eastern)
#   3. Derives timeofday, hour_est, month, year from that Eastern time
#   4. Filters to Sunday games only

_BASE_SQL = text("""
SELECT
    v.season                                            AS Season,
    v.week                                              AS week,
    v.game_date                                         AS Date,
    v.day                                               AS Day,
    v.network                                           AS Affiliation,
    v.call_letters                                      AS CallLetters,
    v.episode_title                                     AS EpisodeTitle,
    m.market_name                                       AS Market,
    m.market_abrev                                      AS Market_abrev,
    v.hhldaa_000                                        AS `AA__000_`,
    v.rating                                            AS RTG,
    v.share                                             AS SHR,
    v.start_time                                        AS Start,
    v.end_time                                          AS End,
    v.title                                             AS Title_grouped_,
    v.universe                                          AS Universe,
    v.duration                                          AS Duration,
    v.broadcast_window                                  AS `window`,
    ht.tv_code                                          AS ht,
    at_team.tv_code                                     AS at,
    CONCAT(ht.city, ' ', ht.mascot)                     AS home_team,
    CONCAT(at_team.city, ' ', at_team.mascot)           AS away_team,
    ht.team_id                                          AS ht_id,
    at_team.team_id                                     AS at_id,
    ADDTIME(
        STR_TO_DATE(v.start_time, '%l:%i %p'),
        SEC_TO_TIME(m.timezone_offset * -3600)
    )                                                   AS EastCoastTime,
    HOUR(ADDTIME(
        STR_TO_DATE(v.start_time, '%l:%i %p'),
        SEC_TO_TIME(m.timezone_offset * -3600)
    ))                                                  AS hour_est,
    CASE
        WHEN ADDTIME(STR_TO_DATE(v.start_time, '%l:%i %p'),
                     SEC_TO_TIME(m.timezone_offset * -3600)) < '12:00:00' THEN 'morning'
        WHEN ADDTIME(STR_TO_DATE(v.start_time, '%l:%i %p'),
                     SEC_TO_TIME(m.timezone_offset * -3600)) < '15:00:00' THEN 'afternoon'
        WHEN ADDTIME(STR_TO_DATE(v.start_time, '%l:%i %p'),
                     SEC_TO_TIME(m.timezone_offset * -3600)) < '18:00:00' THEN 'midafternoon'
        ELSE 'evening'
    END                                                 AS timeofday,
    MONTH(v.game_date)                                  AS month,
    YEAR(v.game_date)                                   AS year,
    m.timezone_offset                                   AS market_tz_offset
FROM viewership v
JOIN teams ht       ON v.home_team_id = ht.team_id
JOIN teams at_team  ON v.away_team_id = at_team.team_id
JOIN markets m      ON v.market_id    = m.market_id
WHERE v.day = 'Sun'
ORDER BY v.game_date ASC
""")

# SQL explanation:
#   STR_TO_DATE(v.start_time, '%l:%i %p')  — parses "1:00 PM" into a TIME value
#   ADDTIME(..., SEC_TO_TIME(offset * -3600)) — adds/subtracts hours to shift to ET
#     (market offset is hours from ET, e.g. Pacific = -3, so we negate to add +3h)
#   HOUR(...) — extracts just the hour integer (0-23)
#   MONTH/YEAR(v.game_date) — calendar month and year of the game


def build_base_df(engine):
    with engine.connect() as conn:
        df = pd.read_sql(_BASE_SQL, conn)

    # EastCoastTime comes back as a timedelta from MySQL; convert to HH:MM string
    def _fmt_timedelta(td):
        if pd.isnull(td):
            return None
        total_seconds = int(td.total_seconds())
        h, remainder = divmod(abs(total_seconds), 3600)
        m = remainder // 60
        return f"{h:02d}:{m:02d}:00"

    df["EastCoastTime"] = df["EastCoastTime"].apply(_fmt_timedelta)

    # Normalise broadcast_window: the string "empty" was stored when there was no value
    df["window"] = df["window"].replace("empty", None)

    df = df.sort_values("Date").reset_index(drop=True)
    return df


# ---------------------------------------------------------------------------
# add_preseason_odds
# ---------------------------------------------------------------------------
# We join preseason_odds twice — once matching on home team, once on away team.
# The pandas merge is equivalent to SQL:
#   LEFT JOIN preseason_odds po_ht ON po_ht.team_id = df.ht_id AND po_ht.season = df.Season
#   LEFT JOIN preseason_odds po_at ON po_at.team_id = df.at_id AND po_at.season = df.Season

def add_preseason_odds(df, engine):
    with engine.connect() as conn:
        odds = pd.read_sql("SELECT * FROM preseason_odds", conn)

    # Rename DB column win_total → wintotal to match plan naming
    odds = odds.rename(columns={"win_total": "wintotal"})

    odds_cols = [
        "playoff_make_odds", "playoff_make_prob", "playoff_miss_odds", "playoff_miss_prob",
        "wintotal", "division_odds", "division_prob", "conference_odds", "conference_prob",
        "superbowl_odds", "superbowl_prob",
    ]

    # Merge for home team: match df.ht_id + df.Season --> odds.team_id + odds.season
    ht_odds = odds[["team_id", "season"] + odds_cols].copy()
    ht_odds.columns = ["ht_id", "Season"] + [f"ht_{c}" for c in odds_cols]
    df = df.merge(ht_odds, on=["ht_id", "Season"], how="left")

    # Merge for away team
    at_odds = odds[["team_id", "season"] + odds_cols].copy()
    at_odds.columns = ["at_id", "Season"] + [f"at_{c}" for c in odds_cols]
    df = df.merge(at_odds, on=["at_id", "Season"], how="left")

    # Derived preseason features
    # ht_expected_wins / at_expected_wins are aliases of wintotal
    df["ht_expected_wins"]         = df["ht_wintotal"]
    df["at_expected_wins"]         = df["at_wintotal"]
    df["sum_expected_wins"]        = df["ht_wintotal"] + df["at_wintotal"]
    # sumwins_m_difwins = 2 * min(ht_wins, at_wins) - measures game competitiveness
    df["sumwins_m_difwins"]        = (df["sum_expected_wins"] - (df["ht_wintotal"] - df["at_wintotal"]).abs())
    df["sumwins_m_difwins_d_week"] = df["sumwins_m_difwins"] / df["week"]
    df["ht_exp_wins_d_week"]       = df["ht_wintotal"] / df["week"]
    df["at_exp_wins_d_week"]       = df["at_wintotal"] / df["week"]
    df["diff_wins"]                = (df["ht_wintotal"] - df["at_wintotal"]).abs()
    # sumwins2_diffwins2 = sum^2 - diff^2 = 4 * ht_wins * at_wins
    df["sumwins2_diffwins2"]       = (df["sum_expected_wins"]**2 - df["diff_wins"]**2)
    df["diff_playoff_make_prob"]   = df["ht_playoff_make_prob"]  - df["at_playoff_make_prob"]
    df["diff_playoff_miss_prob"]   = df["ht_playoff_miss_prob"]  - df["at_playoff_miss_prob"]
    df["diff_division_prob"]       = df["ht_division_prob"]      - df["at_division_prob"]
    df["diff_conference_prob"]     = df["ht_conference_prob"]    - df["at_conference_prob"]
    df["diff_superbowl_prob"]      = df["ht_superbowl_prob"]     - df["at_superbowl_prob"]

    return df


# ---------------------------------------------------------------------------
# add_playoff_rematch
# ---------------------------------------------------------------------------
# A playoff rematch is when the same two teams that played in the prior season's
# playoffs meet again in the current regular season.
#
# For each viewership row we check playoff_matchups where:
#   season = this game's season - 1   (prior season playoffs)
#   AND the two teams appear in either order (home/away can be swapped)
#
# We load all playoff matchups and do the check in pandas — equivalent to:
#   LEFT JOIN playoff_matchups pm
#     ON pm.season = v.season - 1
#    AND ((pm.home_team_id = v.home_team_id AND pm.away_team_id = v.away_team_id)
#      OR (pm.home_team_id = v.away_team_id AND pm.away_team_id = v.home_team_id))

def add_playoff_rematch(df, engine):
    with engine.connect() as conn:
        pm = pd.read_sql(
            "SELECT season, home_team_id, away_team_id FROM playoff_matchups", conn
        )

    # Build a set of frozensets {(season, team_a, team_b)} for O(1) lookup
    pm_set = set()
    for _, row in pm.iterrows():
        pm_set.add((row["season"], frozenset([row["home_team_id"], row["away_team_id"]])))

    def _is_rematch(row):
        prior_season = row["Season"] - 1
        pair = frozenset([row["ht_id"], row["at_id"]])
        return 1 if (prior_season, pair) in pm_set else 0

    df["playoff_rematch"] = df.apply(_is_rematch, axis=1)
    return df


# ---------------------------------------------------------------------------
# add_geographic_features
# ---------------------------------------------------------------------------

def _haversine_miles(lat1, lon1, lat2, lon2):
    """Great-circle distance in miles between two lat/lon points."""
    R = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def add_geographic_features(df, engine):
    with engine.connect() as conn:
        locs = pd.read_sql(
            "SELECT team_id, season_from, season_to, latitude, longitude, timezone_offset "
            "FROM team_locations",
            conn
        )

    # Pre-build a (team_id, season) → (lat, lon, tz) dict for O(1) lookup per row.
    # season_to = NULL means the team is still at that location, so we extend to 9999.
    loc_dict = {}
    for _, row in locs.iterrows():
        s_to = 9999 if pd.isnull(row["season_to"]) else int(row["season_to"])
        for s in range(int(row["season_from"]), s_to + 1):
            loc_dict[(int(row["team_id"]), s)] = (
                float(row["latitude"]),
                float(row["longitude"]),
                int(row["timezone_offset"]),
            )

    _MISS = (None, None, None)

    ht_lats = [loc_dict.get((tid, s), _MISS)[0] for tid, s in zip(df["ht_id"], df["Season"])]
    ht_lons = [loc_dict.get((tid, s), _MISS)[1] for tid, s in zip(df["ht_id"], df["Season"])]
    ht_tzs  = [loc_dict.get((tid, s), _MISS)[2] for tid, s in zip(df["ht_id"], df["Season"])]
    at_lats = [loc_dict.get((tid, s), _MISS)[0] for tid, s in zip(df["at_id"], df["Season"])]
    at_lons = [loc_dict.get((tid, s), _MISS)[1] for tid, s in zip(df["at_id"], df["Season"])]
    at_tzs  = [loc_dict.get((tid, s), _MISS)[2] for tid, s in zip(df["at_id"], df["Season"])]

    ht_lats = np.array(ht_lats, dtype=float)
    ht_lons = np.array(ht_lons, dtype=float)
    at_lats = np.array(at_lats, dtype=float)
    at_lons = np.array(at_lons, dtype=float)

    # diff_longitudes: absolute east/west spread — direction doesn't matter
    df["diff_longitudes"] = np.abs(ht_lons - at_lons)
    # diff_latitudes: signed — positive means away team traveled north
    df["diff_latitudes"]  = ht_lats - at_lats
    # Haversine distance in miles from away team's stadium to home team's
    df["awayteam_travel_distance"] = [
        _haversine_miles(alat, alon, hlat, hlon)
        if not (np.isnan(alat) or np.isnan(hlat)) else None
        for alat, alon, hlat, hlon in zip(at_lats, at_lons, ht_lats, ht_lons)
    ]
    # time_zones_crossed: absolute UTC offset difference between stadiums
    df["time_zones_crossed"] = [
        abs(htz - atz) if (htz is not None and atz is not None) else None
        for htz, atz in zip(ht_tzs, at_tzs)
    ]

    return df


# ---------------------------------------------------------------------------
# add_player_booleans
# ---------------------------------------------------------------------------
# No DB query — purely rule-based.
# Each flag is 1 whenever the listed team is playing (home or away) in the
# specified season range. The away team check handles nationally broadcast games
# where the marquee player's team is visiting.

def add_player_booleans(df):
    for player, rules in PLAYER_RULES.items():
        def _flag(row, rules=rules):
            teams_playing = {row["ht"], row["at"]}
            for tv_code, seasons in rules:
                if tv_code in teams_playing and row["Season"] in seasons:
                    return 1
            return 0
        df[player] = df.apply(_flag, axis=1)

    # Rodgers special case: JETS, season=2023, week=1 only (injured after play 1)
    mask = (df["Season"] == 2023) & (df["week"] == 1) & (
        (df["ht"] == "JETS") | (df["at"] == "JETS")
    )
    df.loc[mask, "rodgers"] = 1

    return df


# ---------------------------------------------------------------------------
# add_div_matchup
# ---------------------------------------------------------------------------
# A division matchup is when both teams are in the same division.
# The canonical name prevents double-counting: we always put the team with the
# lower alphabetical tv_code first (e.g. always "BILLS_PATS", never "PATS_BILLS").

def add_div_matchup(df, engine):
    with engine.connect() as conn:
        divs = pd.read_sql(
            "SELECT team_id, division, conference FROM divisions", conn
        )

    div_lookup   = divs.set_index("team_id")["division"].to_dict()
    conf_lookup  = divs.set_index("team_id")["conference"].to_dict()

    # Build a sorted reference list for canonical ordering
    all_tv_codes = sorted(df["ht"].unique().tolist() + df["at"].unique().tolist())
    # deduplicate while preserving sort
    seen = set()
    teams_list = []
    for t in all_tv_codes:
        if t not in seen:
            teams_list.append(t)
            seen.add(t)

    def _div_matchup(row):
        ht_div  = div_lookup.get(row["ht_id"])
        at_div  = div_lookup.get(row["at_id"])
        is_div  = (ht_div is not None and ht_div == at_div)

        if not is_div:
            return "Other"

        # Canonical ordering: alphabetically lower tv_code goes first
        ht_idx = teams_list.index(row["ht"]) if row["ht"] in teams_list else 9999
        at_idx = teams_list.index(row["at"]) if row["at"] in teams_list else 9999
        first, second = (row["at"], row["ht"]) if at_idx < ht_idx else (row["ht"], row["at"])
        return f"{first}_{second}"

    df["div_matchup"] = df.apply(_div_matchup, axis=1)

    # is_conference: same conference but different division (computed internally, not output)
    df["_is_conference"] = df.apply(
        lambda r: (
            conf_lookup.get(r["ht_id"]) == conf_lookup.get(r["at_id"])
            and div_lookup.get(r["ht_id"]) != div_lookup.get(r["at_id"])
        ),
        axis=1
    )
    return df


# ---------------------------------------------------------------------------
# compute_inseason_features
# ---------------------------------------------------------------------------
# This is the most complex section. We process every NFL game (not just Sunday
# viewership rows) chronologically, maintaining running state per team.
# After each game resolves, we write the CURRENT pre-game state as features
# for the next 1-2 games each team appears in (depending on if the next game is after
# the teams bye week).
#
# Key idea: features represent what we KNEW before the game, so we write them
# forward to future rows — not backward to the game that just happened.

def _adj_calc(swp, cwp, trend, compare_type):
    """
    Compute slope (m) and intercept (b) for the adjusted power ranking multiplier.
    swp = season win percentage, cwp = recent (4-game) win percentage
    trend = quality-adjusted trend score from adjusted_pr
    Returns (slope, intercept) that define a linear adjustment: adj = m*cwp + b
    """
    if swp > cwp and compare_type == "median":
        slope = -1 * 0.0727 * trend + (4 / 5)
    elif swp > cwp and compare_type == "self":
        slope = -1 * 0.1143 * trend + (4 / 5)
    elif swp <= cwp and compare_type == "median":
        slope = 0.0727 * trend + (4 / 5)
    elif swp <= cwp and compare_type == "self":
        slope = 0.1143 * trend + (4 / 5)
    else:
        slope = 4 / 5
    # b = 1 - m*swp  — anchors the line so adjustment = 1.0 exactly at swp
    b = 1 - slope * swp
    return slope, b


def _adjusted_pr(
    winner, loser,
    all_game_rows,          # list of (week, winner_id, loser_id) for this season
    current_week,
    winner_id, loser_id,
    pr_score_winner, pr_score_loser,
    winner_games_played, loser_games_played,
    winner_swp, loser_swp,
    winner_npr_history,     # list of (week, npr) for winner
    loser_npr_history,      # list of (week, npr) for loser
    weekly_median_npr,      # dict: week → median NPR across all teams that week
    num_weeks=4,
):
    """
    Compute adjusted power rankings for winner and loser after a game.

    NPR is normalized power ranking

    The idea: over the last 4 games, reward teams for beating STRONG opponents
    (above-median NPR) and penalize them for losing to WEAK opponents (below
    median/self NPR). Ignore "expected" outcomes (good loss, good win) compared to (bad loss, bad win)

    Returns: (winner_adj_med, winner_adj_self, loser_adj_med, loser_adj_self,
              cwwp, clwp)
    """
    window_weeks = list(range(current_week - num_weeks, current_week))

    # Build per-team game records in the 4-week window
    def _window_games(tid):
        wins, losses = [], []
        for w, wid, lid, opp_npr_at_time in all_game_rows:
            if w not in window_weeks:
                continue
            if wid == tid:
                wins.append(opp_npr_at_time)   # opponent's NPR when they played
            elif lid == tid:
                losses.append(opp_npr_at_time)
        return wins, losses

    winner_wins_opp_nprs, winner_loss_opp_nprs = _window_games(winner_id)
    loser_wins_opp_nprs,  loser_loss_opp_nprs  = _window_games(loser_id)

    # 4-game win percentages
    ww = len(winner_wins_opp_nprs); wl = len(winner_loss_opp_nprs)
    lw = len(loser_wins_opp_nprs);  ll = len(loser_loss_opp_nprs)
    cwwp = ww / (ww + wl) if (ww + wl) > 0 else winner_swp
    clwp = lw / (lw + ll) if (lw + ll) > 0 else loser_swp

    def _trend(team_swp, team_cwp, wins_opp_nprs, loss_opp_nprs, self_nprs_during_wins, self_nprs_during_losses):
        # Weekly medians for games in the window (use current_week median as approximation)
        med = weekly_median_npr.get(current_week - 1, 0.0)

        # Good wins: beat a team whose NPR was above the median
        ww_diffs_med  = [opp - med for opp in wins_opp_nprs  if (opp - med) > 0]
        # Bad losses: lost to a team whose NPR was below our own NPR
        wl_diffs_med  = [opp - med for opp in loss_opp_nprs  if (opp - med) < 0]
        trend_median  = sum(ww_diffs_med) + sum(wl_diffs_med)

        ww_diffs_self = [opp - s   for opp, s in zip(wins_opp_nprs,  self_nprs_during_wins)  if (opp - s) > 0]
        wl_diffs_self = [opp - s   for opp, s in zip(loss_opp_nprs, self_nprs_during_losses) if (opp - s) < 0]
        trend_self    = sum(ww_diffs_self) + sum(wl_diffs_self)

        return trend_median, trend_self

    # We approximate self-NPR during each window game as the team's current NPR
    # (this matches the MATLAB implementation's use of the running NPR vector)
    w_npr_now = pr_score_winner / winner_games_played if winner_games_played > 0 else 0.0
    l_npr_now = pr_score_loser  / loser_games_played  if loser_games_played  > 0 else 0.0

    w_trend_med, w_trend_self = _trend(
        winner_swp, cwwp,
        winner_wins_opp_nprs, winner_loss_opp_nprs,
        [w_npr_now] * len(winner_wins_opp_nprs),
        [w_npr_now] * len(winner_loss_opp_nprs),
    )
    l_trend_med, l_trend_self = _trend(
        loser_swp, clwp,
        loser_wins_opp_nprs, loser_loss_opp_nprs,
        [l_npr_now] * len(loser_wins_opp_nprs),
        [l_npr_now] * len(loser_loss_opp_nprs),
    )

    def _adj_pr(npr, games_played, swp, cwp, trend_med, trend_self):
        m_med, b_med  = _adj_calc(swp, cwp, trend_med,  "median")
        m_self, b_self = _adj_calc(swp, cwp, trend_self, "self")
        base = (npr / games_played) if games_played > 0 else 0.0
        adj_med  = base * (m_med  * cwp + b_med)
        adj_self = base * (m_self * cwp + b_self)
        return adj_med, adj_self

    w_adj_med, w_adj_self = _adj_pr(
        pr_score_winner, winner_games_played, winner_swp, cwwp, w_trend_med, w_trend_self
    )
    l_adj_med, l_adj_self = _adj_pr(
        pr_score_loser, loser_games_played, loser_swp, clwp, l_trend_med, l_trend_self
    )

    return w_adj_med, w_adj_self, l_adj_med, l_adj_self, cwwp, clwp


def compute_inseason_features(df, engine):
    """
    Two-pass approach to avoid the single-row-per-game write bug:

    Pass 1 — build week_state[(season, week, team_id)]: records each team's
    cumulative pre-game stats for every week of every season.  Because teams
    play at most once per week, this triple uniquely identifies the pre-game
    state for ALL market rows that share the same (season, week, team) game.

    Pass 2 — vectorized assign: look up week_state for ht_id and at_id on
    every viewership row and write all ten feature columns at once.
    """
    with engine.connect() as conn:
        games = pd.read_sql(
            "SELECT game_id, season, week, game_date, home_team_id, away_team_id, "
            "home_score, away_score FROM games ORDER BY season, week, game_date",
            conn
        )

    for col in ["ht_wins", "at_wins", "ht_swp", "at_swp",
                "ht_cwp", "at_cwp",
                "ht_adjpr2_med", "ht_adjpr2_self",
                "at_adjpr2_med", "at_adjpr2_self"]:
        df[col] = np.nan

    TREND_START_WEEK = 5

    # week_state key: (season, week, team_id)
    # value: dict with wins, swp, cwp, adjpr2_med, adjpr2_self
    week_state = {}

    for season in sorted(games["season"].unique()):
        sg = games[games["season"] == season].copy()
        all_team_ids = set(sg["home_team_id"]) | set(sg["away_team_id"])

        # cur[team_id] holds the running post-game state (becomes the pre-game
        # state for the following week).
        cur = {
            tid: {
                "wins": 0, "losses": 0, "road_wins": 0,
                "pr_score": 0.0, "pr_opp": [],
                "swp": 0.0, "cwp": 0.0,
                "adjpr2_med": 0.0, "adjpr2_self": 0.0,
            }
            for tid in all_team_ids
        }

        # All resolved games this season: (week, winner_id, loser_id, loser_npr)
        resolved = []

        for week in sorted(sg["week"].unique()):
            week_games = sg[sg["week"] == week]

            # ── Pass 1a: snapshot PRE-GAME state for this week ──────────────
            # This snapshot is the post-game state from all prior weeks, which
            # is exactly what we want as features for games played this week.
            for tid in all_team_ids:
                c = cur[tid]
                week_state[(season, week, tid)] = {
                    "wins":        c["wins"],
                    "swp":         c["swp"],
                    "cwp":         c["cwp"],
                    "adjpr2_med":  c["adjpr2_med"],
                    "adjpr2_self": c["adjpr2_self"],
                }

            # ── Process each game in this week ──────────────────────────────
            for _, game in week_games.iterrows():
                ht_id = int(game["home_team_id"])
                at_id = int(game["away_team_id"])
                hs    = game["home_score"]
                as_   = game["away_score"]

                if pd.isnull(hs) or pd.isnull(as_):
                    continue  # unplayed future game — skip

                ht = cur[ht_id]; at = cur[at_id]
                ht_gp = ht["wins"] + ht["losses"]
                at_gp = at["wins"] + at["losses"]
                ht_swp = ht["swp"]; at_swp = at["swp"]
                ht_npr = ht["pr_score"] / ht_gp if ht_gp > 0 else 0.0
                at_npr = at["pr_score"] / at_gp if at_gp > 0 else 0.0

                winner_id = ht_id if hs >= as_ else at_id
                loser_id  = at_id if hs >= as_ else ht_id
                winner_swp = ht_swp if winner_id == ht_id else at_swp
                loser_swp  = at_swp if winner_id == ht_id else ht_swp
                w_gp = cur[winner_id]["wins"] + cur[winner_id]["losses"]
                l_gp = cur[loser_id]["wins"]  + cur[loser_id]["losses"]

                # Compute weekly median NPR (pre-update, for trend scoring)
                all_nprs = []
                for tid in all_team_ids:
                    gp = cur[tid]["wins"] + cur[tid]["losses"]
                    all_nprs.append(cur[tid]["pr_score"] / gp if gp > 0 else 0.0)
                weekly_median_now = {week: float(np.median(all_nprs))}

                # Compute adjusted PR for BOTH teams (used as next week's features)
                if week >= TREND_START_WEEK and w_gp >= 1 and l_gp >= 1:
                    w_adj_med, w_adj_self, l_adj_med, l_adj_self, cwwp, clwp = _adjusted_pr(
                        winner_id, loser_id,
                        resolved, week,
                        winner_id, loser_id,
                        cur[winner_id]["pr_score"], cur[loser_id]["pr_score"],
                        w_gp, l_gp,
                        winner_swp, loser_swp,
                        [], [],   # npr_history unused in simplified _trend
                        weekly_median_now,
                    )
                    cur[winner_id]["cwp"]        = cwwp
                    cur[loser_id]["cwp"]         = clwp
                    cur[winner_id]["adjpr2_med"]  = w_adj_med
                    cur[winner_id]["adjpr2_self"] = w_adj_self
                    cur[loser_id]["adjpr2_med"]   = l_adj_med
                    cur[loser_id]["adjpr2_self"]  = l_adj_self
                else:
                    # Early weeks: adjpr2 = NPR, cwp = swp
                    cur[ht_id]["cwp"] = ht_swp;   cur[at_id]["cwp"] = at_swp
                    cur[ht_id]["adjpr2_med"]  = ht_npr
                    cur[ht_id]["adjpr2_self"] = ht_npr
                    cur[at_id]["adjpr2_med"]  = at_npr
                    cur[at_id]["adjpr2_self"] = at_npr

                # Update wins / losses / road_wins
                cur[winner_id]["wins"]     += 1
                cur[loser_id]["losses"]    += 1
                if winner_id == at_id:
                    cur[at_id]["road_wins"] += 1

                # Update power ranking score for winner
                # score = wins + sum(beaten_opponents_wins)/2 + 0.25*road_wins
                loser_wins_now = cur[loser_id]["wins"]
                cur[winner_id]["pr_opp"].append(loser_wins_now)
                opp_sum = sum(cur[winner_id]["pr_opp"]) / 2
                cur[winner_id]["pr_score"] = (
                    cur[winner_id]["wins"]
                    + opp_sum
                    + 0.25 * cur[winner_id]["road_wins"]
                )

                # Update swp for both teams post-game
                for tid in [ht_id, at_id]:
                    gp = cur[tid]["wins"] + cur[tid]["losses"]
                    cur[tid]["swp"] = cur[tid]["wins"] / gp if gp > 0 else 0.0

                # Record for next game's adjusted_pr 4-week window
                l_gp_now    = cur[loser_id]["wins"] + cur[loser_id]["losses"]
                loser_npr_now = cur[loser_id]["pr_score"] / l_gp_now if l_gp_now > 0 else 0.0
                resolved.append((week, winner_id, loser_id, loser_npr_now))

    # ── Pass 2: vectorized write to all viewership rows ─────────────────────
    # Each viewership row's (Season, week, ht_id) and (Season, week, at_id)
    # map directly to entries in week_state.
    feat_cols = ["wins", "swp", "cwp", "adjpr2_med", "adjpr2_self"]
    for prefix, id_col in [("ht", "ht_id"), ("at", "at_id")]:
        for feat in feat_cols:
            out_col = f"{prefix}_{feat}" if feat != "wins" else f"{prefix}_wins"
            df[out_col] = df.apply(
                lambda r, p=prefix, f=feat, ic=id_col: (
                    week_state.get(
                        (r["Season"], r["week"], r[ic]), {}
                    ).get(f, np.nan)
                ),
                axis=1,
            )

    return df


# ---------------------------------------------------------------------------
# add_lag_features
# ---------------------------------------------------------------------------
# Lag features use PRIOR-year data to avoid look-ahead leakage.
# Seasons 2010-2013 get NaN because we need at least 4 prior years for
# trend computation (the todate/4-year slope calculations start at y=4).

def _process_sunday_data(df_sun, markets_list, teams_list):
    """
    Build multi-dimensional arrays of historical viewership averages and trends.
    Returns arrays indexed by [year_idx, team_or_tod_idx, market_idx].
    """
    market_years = sorted(df_sun["Season"].unique().astype(int).tolist())

    df_work = df_sun.copy()
    df_work["at_lower"] = df_work["at"].str.lower()
    df_work["ht_lower"] = df_work["ht"].str.lower()
    teams_lower  = [t.lower() for t in teams_list]
    markets_lower = [m.lower() for m in markets_list]

    tod_order = ["afternoon", "midafternoon", "evening"]
    df_work["timeofday_cat"] = pd.Categorical(
        df_work["timeofday"].str.lower(), categories=tod_order, ordered=True
    )

    # year_market_tod_avg shape: (years, markets, 3)
    # For each season/market/time-of-day, average of AA__000_ across all rows
    ymtod = (
        df_work.groupby(["Season", "Market_abrev", "timeofday_cat"], observed=True)["AA__000_"]
        .mean()
        .unstack("timeofday_cat", fill_value=0)
        .reindex(
            pd.MultiIndex.from_product([market_years, markets_list], names=["Season", "Market_abrev"])
        )
        .fillna(0)
    )
    year_market_tod_avg = ymtod.values.reshape(len(market_years), len(markets_list), 3)

    # Trend arrays for market/time-of-day
    n_y = len(market_years); n_m = len(markets_list)
    market_tod_trend_todate     = np.zeros((n_y, n_m, 3))
    market_tod_trend_4          = np.zeros((n_y, n_m, 3))
    market_tod_intercept_todate = np.zeros((n_y, n_m, 3))
    market_tod_intercept_4      = np.zeros((n_y, n_m, 3))

    # np.polyfit(x, y, 1) fits a line y = slope*x + intercept.
    # For "todate" we use all years up to (not including) y as x points.
    # For "4-year" we use just the 4 most recent prior years.
    for m_idx in range(n_m):
        for t_idx in range(3):
            for y_idx in range(4, n_y):
                y_vals_td = year_market_tod_avg[:y_idx, m_idx, t_idx]
                y_vals_4  = year_market_tod_avg[y_idx - 4:y_idx, m_idx, t_idx]
                s_td, i_td = np.polyfit(np.arange(1, y_idx + 1),       y_vals_td, 1)
                s_4,  i_4  = np.polyfit(np.arange(y_idx - 3, y_idx + 1), y_vals_4, 1)
                market_tod_trend_todate[y_idx, m_idx, t_idx]     = s_td
                market_tod_trend_4[y_idx, m_idx, t_idx]          = s_4
                market_tod_intercept_todate[y_idx, m_idx, t_idx] = i_td
                market_tod_intercept_4[y_idx, m_idx, t_idx]      = i_4

    # market_team_year_avg shape: (years, teams, markets)
    # Melt so each row appears twice (once for at, once for ht)
    melt = df_work.melt(
        id_vars=["Season", "Market_abrev", "AA__000_"],
        value_vars=["at_lower", "ht_lower"],
        value_name="Team",
    ).drop(columns="variable")
    melt["Team"] = pd.Categorical(melt["Team"], categories=teams_lower, ordered=True)
    melt["Market_abrev"] = pd.Categorical(melt["Market_abrev"], categories=markets_list, ordered=True)

    team_mkt_avg = (
        melt.groupby(["Season", "Team", "Market_abrev"], observed=True)["AA__000_"]
        .mean()
        .reset_index()
    )
    pivot = team_mkt_avg.pivot(index=["Season", "Market_abrev"], columns="Team", values="AA__000_")
    full_index = pd.MultiIndex.from_product([market_years, markets_list], names=["Season", "Market_abrev"])
    pivot = pivot.reindex(full_index)[teams_lower]

    market_team_year_avg = pivot.values.reshape(
        n_y, n_m, len(teams_list)
    ).transpose(0, 2, 1).copy()

    # Fill NaN cells (team never appeared in that market) with team's mean across seasons
    team_means = np.nanmean(market_team_year_avg, axis=0, keepdims=True)
    nan_mask   = np.isnan(market_team_year_avg)
    market_team_year_avg[nan_mask] = np.broadcast_to(team_means, market_team_year_avg.shape)[nan_mask]

    # Trend arrays for team/market
    n_t = len(teams_list)
    team_market_trend_todate      = np.zeros((n_y, n_t, n_m))
    team_market_trend_4           = np.zeros((n_y, n_t, n_m))
    team_market_intercept_todate  = np.zeros((n_y, n_t, n_m))
    team_market_intercept_4       = np.zeros((n_y, n_t, n_m))

    for m_idx in range(n_m):
        for t_idx in range(n_t):
            for y_idx in range(4, n_y):
                y_vals_td = market_team_year_avg[:y_idx, t_idx, m_idx]
                y_vals_4  = market_team_year_avg[y_idx - 4:y_idx, t_idx, m_idx]
                s_td, i_td = np.polyfit(np.arange(1, y_idx + 1),       y_vals_td, 1)
                s_4,  i_4  = np.polyfit(np.arange(y_idx - 3, y_idx + 1), y_vals_4, 1)
                team_market_trend_todate[y_idx, t_idx, m_idx]     = s_td
                team_market_trend_4[y_idx, t_idx, m_idx]          = s_4
                team_market_intercept_todate[y_idx, t_idx, m_idx] = i_td
                team_market_intercept_4[y_idx, t_idx, m_idx]      = i_4

    return (
        year_market_tod_avg, market_tod_trend_todate, market_tod_trend_4,
        market_tod_intercept_todate, market_tod_intercept_4,
        market_team_year_avg, team_market_trend_todate, team_market_trend_4,
        team_market_intercept_todate, team_market_intercept_4,
        market_years,
    )


def _create_lag_features(
    at, ht, market, tod_str, season,
    markets_list, teams_lower, year_map,
    year_market_tod_avg, market_tod_trend_todate, market_tod_trend_4,
    market_tod_intercept_todate, market_tod_intercept_4,
    market_team_year_avg, team_market_trend_todate, team_market_trend_4,
    team_market_intercept_todate, team_market_intercept_4,
):
    """
    Return the 15 lag scalars for one viewership row.
    All arrays are indexed by the PRIOR year (y-1) to prevent look-ahead leakage.
    """
    tod_map = {"afternoon": 0, "midafternoon": 1, "evening": 2}
    tod = tod_map.get(tod_str.lower() if tod_str else "", 0)

    y = year_map.get(season)
    if y is None or y < 4:
        return (np.nan,) * 15

    i    = markets_list.index(market)
    at_l = at.lower(); ht_l = ht.lower()
    at_idx = teams_lower.index(at_l) if at_l in teams_lower else None
    ht_idx = teams_lower.index(ht_l) if ht_l in teams_lower else None

    prev = y - 1  # index into prior season's arrays

    # Market/time-of-day lags
    prev_market_tod_avg             = year_market_tod_avg[prev, i, tod]
    prev_market_tod_trend_todate    = market_tod_trend_todate[prev, i, tod]
    prev_market_tod_trend_4         = market_tod_trend_4[prev, i, tod]
    prev_market_tod_todate_pred     = (
        prev_market_tod_trend_todate * (y + 1) + market_tod_intercept_todate[prev, i, tod]
    )
    prev_market_tod_4_pred          = (
        prev_market_tod_trend_4 * 5 + market_tod_intercept_4[prev, i, tod]
    )

    # Team/market lags
    if at_idx is None or ht_idx is None:
        return (np.nan,) * 15

    prev_market_at_avg              = market_team_year_avg[prev, at_idx, i]
    prev_market_ht_avg              = market_team_year_avg[prev, ht_idx, i]
    prev_at_trend_todate            = team_market_trend_todate[prev, at_idx, i]
    prev_ht_trend_todate            = team_market_trend_todate[prev, ht_idx, i]
    prev_at_trend_4                 = team_market_trend_4[prev, at_idx, i]
    prev_ht_trend_4                 = team_market_trend_4[prev, ht_idx, i]

    prev_ht_todate_pred             = (
        team_market_trend_todate[prev, ht_idx, i] * (y + 1)
        + team_market_intercept_todate[prev, ht_idx, i]
    )
    prev_ht_4_pred                  = (
        team_market_trend_4[prev, ht_idx, i] * 5
        + team_market_intercept_4[prev, ht_idx, i]
    )
    prev_at_todate_pred             = (
        team_market_trend_todate[prev, at_idx, i] * (y + 1)
        + team_market_intercept_todate[prev, at_idx, i]
    )
    prev_at_4_pred                  = (
        team_market_trend_4[prev, at_idx, i] * 5
        + team_market_intercept_4[prev, at_idx, i]
    )

    return (
        prev_market_at_avg, prev_market_ht_avg,
        prev_at_trend_todate, prev_ht_trend_todate,
        prev_at_trend_4, prev_ht_trend_4,
        prev_market_tod_avg, prev_market_tod_trend_todate, prev_market_tod_trend_4,
        prev_ht_todate_pred, prev_ht_4_pred,
        prev_at_todate_pred, prev_at_4_pred,
        prev_market_tod_todate_pred, prev_market_tod_4_pred,
    )


def add_lag_features(df, engine):
    with engine.connect() as conn:
        markets_df = pd.read_sql("SELECT market_abrev FROM markets ORDER BY market_abrev", conn)
        teams_df   = pd.read_sql("SELECT tv_code FROM teams ORDER BY tv_code", conn)

    markets_list = markets_df["market_abrev"].tolist()
    teams_list   = teams_df["tv_code"].tolist()
    teams_lower  = [t.lower() for t in teams_list]

    arrays = _process_sunday_data(df, markets_list, teams_list)
    (
        year_market_tod_avg, market_tod_trend_todate, market_tod_trend_4,
        market_tod_intercept_todate, market_tod_intercept_4,
        market_team_year_avg, team_market_trend_todate, team_market_trend_4,
        team_market_intercept_todate, team_market_intercept_4,
        market_years,
    ) = arrays

    year_map = {yr: idx for idx, yr in enumerate(market_years)}

    lag_col_names = [
        "prev_market_at_year_avg", "prev_market_ht_year_avg",
        "prev_year_at_market_trend_todate", "prev_year_ht_market_trend_todate",
        "prev_year_at_market_trend_4", "prev_year_ht_market_trend_4",
        "prev_year_market_tod_avg", "prev_market_tod_trend_todate", "prev_market_tod_trend_4",
        "ht_market_todate_prediction", "ht_market_4_prediction",
        "at_market_todate_prediction", "at_market_4_prediction",
        "market_tod_todate_prediction", "market_tod_4_prediction",
    ]

    results = []
    for _, row in df.iterrows():
        vals = _create_lag_features(
            row["at"], row["ht"], row["Market_abrev"],
            row["timeofday"], int(row["Season"]),
            markets_list, teams_lower, year_map,
            year_market_tod_avg, market_tod_trend_todate, market_tod_trend_4,
            market_tod_intercept_todate, market_tod_intercept_4,
            market_team_year_avg, team_market_trend_todate, team_market_trend_4,
            team_market_intercept_todate, team_market_intercept_4,
        )
        results.append(vals)

    lag_df = pd.DataFrame(results, columns=lag_col_names, index=df.index)
    df = pd.concat([df, lag_df], axis=1)
    return df


# ---------------------------------------------------------------------------
# build_ohe
# ---------------------------------------------------------------------------
# Two OHE blocks:
#
# 1. Primary/Secondary (112 cols = 56 markets × 2):
#    Within each (Season, week, Market_abrev, timeofday) slot, the game with
#    the highest viewership is "primary", the second highest is "secondary".
#    These flags signal to the NN which game is the dominant broadcast in that
#    market time-slot.
#
# 2. Team×Market (1,792 cols = 56 markets × 32 teams):
#    For each row, two columns are set to 1: {Market_abrev}_{ht} and
#    {Market_abrev}_{at}. All other 1,790 values = 0.
#    These encode which teams are visible in which market — a key signal for
#    local market effects.

def build_ohe(df):
    n = len(df)
    markets_sorted = sorted(df["Market_abrev"].unique())
    teams_sorted   = sorted(set(df["ht"].unique()) | set(df["at"].unique()))

    # ── Primary / Secondary ──────────────────────────────────────────────────
    # Accumulate assignments in plain dicts (col → np.ndarray of int8),
    # then concat once at the end to avoid fragmentation warnings.

    prim_data = {f"{m}_primary":   np.zeros(n, dtype=np.int8) for m in markets_sorted}
    sec_data  = {f"{m}_secondary": np.zeros(n, dtype=np.int8) for m in markets_sorted}

    # Positional index map for fast iloc-style assignment
    idx_pos = {real_idx: pos for pos, real_idx in enumerate(df.index)}

    grp_keys = ["Season", "week", "Market_abrev", "timeofday"]
    for _, grp in df.groupby(grp_keys, sort=False):
        market = grp["Market_abrev"].iloc[0]
        prim_col = f"{market}_primary"
        sec_col  = f"{market}_secondary"
        ranked = grp["AA__000_"].rank(method="first", ascending=False)

        if ranked.size == 1:
            prim_data[prim_col][idx_pos[grp.index[0]]] = 1
        elif ranked.size == 2:
            prim_data[prim_col][idx_pos[grp.index[ranked.values == 1][0]]] = 1
            sec_data[sec_col][idx_pos[grp.index[ranked.values == 2][0]]]   = 1
        else:
            # 3+ rows: find standalone by unique start_time, assign secondary;
            # then apply primary/secondary logic to the remaining pair
            start_counts   = grp["Start"].value_counts()
            standalone_pos = [idx_pos[i] for i in grp.index
                              if start_counts[grp.at[i, "Start"]] == 1]
            if standalone_pos:
                sec_data[sec_col][standalone_pos[0]] = 1
                remaining_idx = [i for i in grp.index
                                 if start_counts[grp.at[i, "Start"]] > 1]
                if len(remaining_idx) >= 2:
                    sub = grp.loc[remaining_idx, "AA__000_"].rank(
                        method="first", ascending=False
                    )
                    prim_data[prim_col][idx_pos[remaining_idx[sub.values.argmin()]]] = 1
                    sec_data[sec_col][idx_pos[remaining_idx[sub.values.argmax()]]]   = 1
            else:
                prim_data[prim_col][idx_pos[grp.index[ranked.values == 1][0]]] = 1
                sec_data[sec_col][idx_pos[grp.index[ranked.values == 2][0]]]   = 1

    # ── Team × Market ────────────────────────────────────────────────────────
    # Each row lights up exactly 2 columns: {Market_abrev}_{ht} and {Market_abrev}_{at}.
    tm_data = {
        f"{m}_{t}": np.zeros(n, dtype=np.int8)
        for m in markets_sorted for t in teams_sorted
    }

    for pos, (m, ht, at) in enumerate(
        zip(df["Market_abrev"], df["ht"], df["at"])
    ):
        tm_data[f"{m}_{ht}"][pos] = 1
        tm_data[f"{m}_{at}"][pos] = 1

    # ── Single concat — avoids N individual column insertions ────────────────
    ohe_df = pd.DataFrame(
        {**prim_data, **sec_data, **tm_data},
        index=df.index,
    )
    df = pd.concat([df, ohe_df], axis=1)
    return df


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    print("Building engine...")
    engine = build_engine()

    print("Building base DataFrame...")
    df = build_base_df(engine)
    print(f"  Base: {len(df)} rows")

    print("Adding preseason odds...")
    df = add_preseason_odds(df, engine)

    print("Adding playoff rematch flag...")
    df = add_playoff_rematch(df, engine)

    print("Adding geographic features...")
    df = add_geographic_features(df, engine)

    print("Adding player booleans...")
    df = add_player_booleans(df)

    print("Adding division matchup...")
    df = add_div_matchup(df, engine)

    print("Computing in-season features (this may take a few minutes)...")
    df = compute_inseason_features(df, engine)

    print("Adding lag features...")
    df = add_lag_features(df, engine)

    print("Building OHE columns...")
    df = build_ohe(df)

    # Drop internal columns not in the output spec
    drop_cols = ["ht_id", "at_id", "market_tz_offset", "_is_conference"]
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    print(f"Writing {len(df)} rows x {len(df.columns)} cols to {OUTPUT_PATH}")
    df.to_csv(OUTPUT_PATH, index=False)
    print("Done.")


if __name__ == "__main__":
    main()
