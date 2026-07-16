"""Shared utilities for NFL optimization notebooks."""
import os
import pandas as pd
import numpy as np
from math import radians, sin, cos, sqrt, atan2


def team_convert(team, type):
    """Convert team name between abbreviation, city, mascot, tv-code formats."""
    if type == 'abbreviation':  col = 0
    elif type == 'city':        col = 1
    elif type == 'mascot':      col = 2
    elif type == 'tv':          col = 3
    else: raise ValueError(f"Invalid type '{type}'")

    data = [
        ['ARI','Arizona','Cardinals','CARDS'],    ['ATL','Atlanta','Falcons','FALCN'],
        ['BAL','Baltimore','Ravens','RAVEN'],      ['BUF','Buffalo','Bills','BILLS'],
        ['CAR','Carolina','Panthers','PNTHR'],     ['CHI','Chicago','Bears','BEARS'],
        ['CIN','Cincinnati','Bengals','BENGL'],    ['CLE','Cleveland','Browns','BRWNS'],
        ['DAL','Dallas','Cowboys','COWBY'],        ['DEN','Denver','Broncos','BRNCO'],
        ['DET','Detroit','Lions','LIONS'],         ['GB','Green Bay','Packers','PCKRS'],
        ['HOU','Houston','Texans','TEXAN'],        ['IND','Indianapolis','Colts','COLTS'],
        ['JAX','Jacksonville','Jaguars','JAGRS'],  ['KC','Kansas City','Chiefs','CHIEF'],
        ['LAC','Los Angeles','Chargers','CHRGR'],  ['LAR','Los Angeles','Rams','RAMS'],
        ['LV','Las Vegas','Raiders','RAIDR'],      ['MIA','Miami','Dolphins','DLPHN'],
        ['MIN','Minnesota','Vikings','VIKNG'],     ['NE','New England','Patriots','PATS'],
        ['NO','New Orleans','Saints','SAINT'],     ['NYG','New York','Giants','GIANT'],
        ['NYJ','New York','Jets','JETS'],          ['PHI','Philadelphia','Eagles','EAGLE'],
        ['PIT','Pittsburgh','Steelers','STLRS'],   ['SEA','Seattle','Seahawks','SEAHK'],
        ['SF','San Francisco','Niners','49RS'],    ['TB','Tampa Bay','Buccaneers','BUCS'],
        ['TEN','Tennessee','Titans','TITAN'],      ['WSH','Washington','Redskins','CMNDR'],
    ]
    data2 = [row[:] for row in data]
    data2[31][2] = 'Commanders'
    data_use = data2 if team == 'Commanders' else data
    for row_count, row in enumerate(data_use):
        if any(team.lower() == item.lower() for item in row):
            return data[row_count][col]
    raise ValueError(f"Team '{team}' not found.")


def parse_optimized_schedule_csv(path: str) -> dict:
    """Return {week: set of (away_abbr, home_abbr)} from optimized schedule CSV or XLSX.

    Row 1 = week headers (skipped). Row 2+ = team rows.
    Column A = mascot name. Columns B-S = weeks 1-18.
    Cell format: '@ OPP' (row team away), 'OPP' or 'OPP.' (row team home), 'BYE' = skip.
    """
    if path.lower().endswith(('.xlsx', '.xls')):
        df = pd.read_excel(path, skiprows=1, header=None)
    else:
        df = pd.read_csv(path, skiprows=1, header=None)
    schedule: dict = {}
    for _, row in df.iterrows():
        row_team = team_convert(str(row.iloc[0]).strip().rstrip('._; '), 'abbreviation')
        for week_col in range(1, len(row)):
            cell = str(row.iloc[week_col]).strip()
            if not cell or cell.upper() == 'BYE' or cell.lower() == 'nan':
                continue
            is_away = cell.startswith('@ ')
            opp_name = cell[2:].strip().rstrip('._; ') if is_away else cell.rstrip('._; ')
            opp_abbr = team_convert(opp_name, 'abbreviation')
            game = (row_team, opp_abbr) if is_away else (opp_abbr, row_team)
            schedule.setdefault(week_col, set()).add(game)
    return schedule


def load_canonical_matchups(engine, season: int) -> list:
    """Return [(away_abbr, home_abbr), ...] for all regular-season games.

    Note: 2022 returns 271 games (BUF-CIN Week 17 was cancelled after Damar Hamlin's
    cardiac arrest and was never replayed; BUF and CIN each officially played 16 games).
    All other seasons: 256 (2010-2020) or 272 (2021+).
    """
    query = """
        SELECT t_away.abbreviation AS away, t_home.abbreviation AS home
        FROM games g
        JOIN teams t_home ON g.home_team_id = t_home.team_id
        JOIN teams t_away ON g.away_team_id = t_away.team_id
        WHERE g.season = %(season)s
        ORDER BY g.week, g.game_id
    """
    df = pd.read_sql(query, engine, params={'season': season})
    return list(zip(df['away'], df['home']))


def load_season_games(engine, season: int) -> pd.DataFrame:
    """Return actual game results for a season.

    Columns: week, away_abbr, home_abbr, home_won (1=home won, 0=away won).
    """
    query = """
        SELECT g.week,
               t_away.abbreviation AS away_abbr,
               t_home.abbreviation AS home_abbr,
               CASE WHEN g.home_score > g.away_score THEN 1 ELSE 0 END AS home_won
        FROM games g
        JOIN teams t_home ON g.home_team_id = t_home.team_id
        JOIN teams t_away ON g.away_team_id = t_away.team_id
        WHERE g.season = %(season)s
        ORDER BY g.week, g.game_id
    """
    return pd.read_sql(query, engine, params={'season': season})


def build_game_df(engine, seasons=None) -> pd.DataFrame:
    """Build the game-level DataFrame consumed by the Bayesian notebook.

    Parameters
    ----------
    engine : SQLAlchemy engine connected to nfl_pipeline DB
    seasons : list of ints to filter, or None for all seasons
    """
    season_filter = ""
    params: dict = {}
    if seasons is not None:
        placeholders = ','.join(f':s{i}' for i in range(len(seasons)))
        season_filter = f"AND g.season IN ({placeholders})"
        params = {f's{i}': s for i, s in enumerate(seasons)}

    query = f"""
        SELECT
            g.game_id, g.season, g.week, g.game_date AS Date,
            t_home.abbreviation AS home_team,
            t_away.abbreviation AS away_team,
            g.home_score, g.away_score,
            d_home.division      AS home_division,
            d_home.conference    AS home_conference,
            d_away.division      AS away_division,
            d_away.conference    AS away_conference,
            loc_home.latitude        AS ht_lat, loc_home.longitude AS ht_lon,
            loc_home.timezone_offset AS ht_tz,
            loc_away.latitude        AS at_lat, loc_away.longitude AS at_lon,
            loc_away.timezone_offset AS at_tz,
            po_home.playoff_make_odds  AS ht_playoff_make_odds,
            po_home.playoff_make_prob  AS ht_playoff_make_prob,
            po_home.playoff_miss_odds  AS ht_playoff_miss_odds,
            po_home.playoff_miss_prob  AS ht_playoff_miss_prob,
            po_home.win_total          AS ht_wintotal,
            po_home.division_odds      AS ht_division_odds,
            po_home.division_prob      AS ht_division_prob,
            po_home.conference_odds    AS ht_conference_odds,
            po_home.conference_prob    AS ht_conference_prob,
            po_home.superbowl_odds     AS ht_superbowl_odds,
            po_home.superbowl_prob     AS ht_superbowl_prob,
            po_away.playoff_make_odds  AS at_playoff_make_odds,
            po_away.playoff_make_prob  AS at_playoff_make_prob,
            po_away.playoff_miss_odds  AS at_playoff_miss_odds,
            po_away.playoff_miss_prob  AS at_playoff_miss_prob,
            po_away.win_total          AS at_wintotal,
            po_away.division_odds      AS at_division_odds,
            po_away.division_prob      AS at_division_prob,
            po_away.conference_odds    AS at_conference_odds,
            po_away.conference_prob    AS at_conference_prob,
            po_away.superbowl_odds     AS at_superbowl_odds,
            po_away.superbowl_prob     AS at_superbowl_prob
        FROM games g
        JOIN teams  t_home ON g.home_team_id = t_home.team_id
        JOIN teams  t_away ON g.away_team_id = t_away.team_id
        JOIN divisions d_home ON t_home.team_id = d_home.team_id
        JOIN divisions d_away ON t_away.team_id = d_away.team_id
        LEFT JOIN team_locations loc_home
               ON t_home.team_id = loc_home.team_id
              AND g.season >= loc_home.season_from
              AND (loc_home.season_to IS NULL OR g.season <= loc_home.season_to)
        LEFT JOIN team_locations loc_away
               ON t_away.team_id = loc_away.team_id
              AND g.season >= loc_away.season_from
              AND (loc_away.season_to IS NULL OR g.season <= loc_away.season_to)
        LEFT JOIN preseason_odds po_home
               ON t_home.team_id = po_home.team_id AND g.season = po_home.season
        LEFT JOIN preseason_odds po_away
               ON t_away.team_id = po_away.team_id AND g.season = po_away.season
        WHERE 1=1 {season_filter}
        ORDER BY g.game_date, g.game_id
    """
    df = pd.read_sql(query, engine, params=params)

    # Derived columns
    df['home_team_won'] = (df['home_score'] > df['away_score']).astype(int)
    df['Winner_tie'] = np.where(df['home_team_won'] == 1, df['home_team'], df['away_team'])
    df['Loser_tie']  = np.where(df['home_team_won'] == 1, df['away_team'], df['home_team'])
    df['PtsW'] = np.where(df['home_team_won'] == 1, df['home_score'], df['away_score'])
    df['PtsL'] = np.where(df['home_team_won'] == 1, df['away_score'], df['home_score'])
    df['is_division_game']  = (df['home_division'] == df['away_division']).astype(int)
    df['is_conference_game'] = (df['home_conference'] == df['away_conference']).astype(int)

    # Distance / geography
    def _haversine(lat1, lon1, lat2, lon2):
        R = 3958.8  # miles
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
        return R * 2 * atan2(sqrt(a), sqrt(1 - a))

    df['opponent_distance_traveled'] = df.apply(
        lambda r: _haversine(r['at_lat'], r['at_lon'], r['ht_lat'], r['ht_lon'])
        if pd.notna(r['at_lat']) else np.nan, axis=1
    )
    df['diff_latitudes']   = df['ht_lat'] - df['at_lat']
    df['diff_longitudes']  = (df['ht_lon'] - df['at_lon']).abs()
    df['time_zones_crossed'] = (df['ht_tz'] - df['at_tz']).abs().astype('Int64')

    # Differentials
    for metric in ['playoff_make_prob', 'playoff_miss_prob',
                   'division_prob', 'conference_prob', 'superbowl_prob']:
        df[f'diff_{metric}'] = df[f'ht_{metric}'] - df[f'at_{metric}']
    df['diff_wintotals'] = df['ht_wintotal'] - df['at_wintotal']

    return df


