"""
ingest_season.py
Load all five fact tables for one NFL season (or all seasons via --all).

Usage:
    python ingest/ingest_season.py <year> [--force]
    python ingest/ingest_season.py --all  [--force]

Without --force the script aborts if that season already exists in `games`.
With --force it deletes all rows for the season across every fact table and
re-inserts from scratch.

Ingest order is constrained by the cross-table lookup in ingest_viewership:
  1. games               no cross-table dependency
  2. preseason_odds      no cross-table dependency
  3. prime_viewership    no cross-table dependency
  4. playoff_matchups    no cross-table dependency
  5. viewership          LAST; resolves home/away by looking up the games table
"""

import argparse
import os
import re
import warnings

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# --- Source file paths --------------------------------------------------
# All data files are excluded from git (.gitignore covers *.xlsx and *.csv).

GAMES_XLS = r"...\NFL_historical_outcomes.xlsx"
PRIME_XLS = r"...\non_sunday_primetimes.xlsx"
ODDS_DIR  = r"...\preseason_odds"
PLAYOFF_XLS = r"...\NFLplayoff_matchups.xlsx"
VIEWERSHIP_CSV = r"...\NFLTV_ML_10.csv"

# Seasons to iterate when --all is used.
# Hardcoded so missing source files for individual years only emit warnings
# rather than causing false errors from dynamic detection.
ALL_SEASONS = list(range(2010, 2025))

# the playoff file uses string labels for playoff rounds instead of week numbers.
# We map them to sequential integers after week 18.
PLAYOFF_WEEK = {
    'WildCard':  19,
    'Division':  20,
    'ConfChamp': 21,
    'SuperBowl': 22,
}

# Columns we need from the viewership CSV.  The file has ~2,000 columns; reading
# only these speeds up the pd.read_csv call substantially.
_VIEW_COLS = {
    'Season', 'week', 'Date', 'Day',
    'Market', 'Market_abrev', 'abrev',
    'Affiliation', 'Title_grouped_', 'CallLetters', 'EpisodeTitle',
    'window', 'Start', 'End',
    'AA__000_', 'SHR', 'RTG', 'Duration', 'Universe',
}

# --- Shared utilities --------------------------------------------------------

def get_engine():
    # Load .env so credentials never appear in source code.
    load_dotenv()
    url = (
        f"mysql+pymysql://{os.environ['DB_USER']}:{os.environ['DB_PASSWORD']}"
        f"@{os.environ['DB_HOST']}:{os.environ['DB_PORT']}/{os.environ['DB_NAME']}"
    )
    return create_engine(url)


def resolve_team_id(conn, name):
    """Look up team_id by alias string.  The table's utf8mb4_unicode_ci collation
    makes the match case-insensitive automatically.  Raises ValueError on miss.
    A missing alias is always a data error that must be fixed explicitly."""
    row = conn.execute(
        text("SELECT team_id FROM team_aliases WHERE alias = :alias"),  
        {"alias": str(name).strip()}
    ).fetchone()  
    if row is None:
        raise ValueError(
            f"No team alias found for '{name}'. "
            "Add it to TEAM_ALIAS_ROWS in load_reference_data.py and re-run that script."
        )
    return row[0]


def implied_probability(odds):
    """Convert American odds to implied probability.
    Negative odds (favorite): abs(odds) / (abs(odds) + 100)
    Positive odds (underdog):  100 / (odds + 100)
    Returns None if odds is None or NaN."""
    if odds is None or pd.isna(odds):
        return None
    odds = float(odds)
    if odds < 0:
        return round(abs(odds) / (abs(odds) + 100), 4)
    return round(100 / (odds + 100), 4)


def parse_week(val):
    """Return an integer week number.  playoof file uses string labels ('WildCard' etc.)
    for playoff rounds; map those to weeks 19-22."""
    s = str(val).strip()
    if s.isdigit():
        return int(s)
    return PLAYOFF_WEEK.get(s)  # None if unrecognised


def derive_market_abrev(market_name):
    """Fallback abbreviation: first 6 chars of market_name, letters only."""
    return re.sub(r'[^a-zA-Z]', '', market_name[:6])


def to_minutes(val):
    """Normalise duration to integer minutes.
    Excel may return pd.Timedelta objects for time-formatted cells."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, pd.Timedelta):
        return int(val.total_seconds() / 60)
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


# --- Pre-flight check -----------------------------------------------------------

def preflight_check(conn, season, force):
    """Return True if it is safe to proceed with insertion.
    If the season already exists:
      - without --force: print a message and return False (caller skips season)
      - with --force: delete all rows for that season across every fact table,
        then return True so insertion proceeds fresh."""
    count = conn.execute(
        text("SELECT COUNT(*) FROM games WHERE season = :s"),
        {"s": season}
    ).scalar()
    if count == 0:
        return True
    if not force:
        print(f"  Season {season} already loaded ({count} games). Use --force to delete and reload.")
        return False
    # Delete in an order that respects no cross-fact-table FK constraints.
    # (viewership references teams and markets, but not other fact tables.)
    print(f"  --force: deleting season {season} data across all fact tables...")
    for table in ('viewership', 'prime_viewership', 'playoff_matchups',
                  'preseason_odds', 'games'):
        conn.execute(text(f"DELETE FROM {table} WHERE season = :s"), {"s": season})
    conn.commit()
    return True


# --- 1. games -------------------------------------------------------------

def ingest_games(conn, season):
    """Load NFL_historical_outcomes.xlsx into the games table.

    Sheet structure (Pro Football Reference export):
      - One sheet per calendar year, named by that year (e.g. '2023').
      - All rows in sheet '2023' belong to the 2023 season, including any
        final regular-season games played in early January 2024.
      - Playoff games live in NFLplayoff_matchups.xlsx and are handled by
        ingest_playoff_matchups; they are not in this file.
      - Columns: Week, Day, Date, Time, Winner/tie, (unnamed = '@' or blank),
        Loser/tie, PtsW, PtsL, ...
      - PFR occasionally repeats the header row as a data row, we drop those.
    """
    try:
        df = pd.read_excel(GAMES_XLS, sheet_name=str(season), header=0, dtype=str)
    except Exception:
        warnings.warn(
            f"Season {season}: sheet '{season}' not found in {GAMES_XLS}. "
            "Skipping games."
        )
        return

    # PFR exports repeat the column-header row as a data row — drop those.
    df = df[df['Week'].notna() & (df['Week'] != 'Week')].copy()

    # Rows with unparseable dates are blank filler rows — drop them.
    df['_date'] = pd.to_datetime(df['Date'], errors='coerce')
    df = df.dropna(subset=['_date'])

    if df.empty:
        print(f"  games: 0 rows (no data found in sheet '{season}').")
        return

    inserted = 0
    for _, row in df.iterrows():
        # The unnamed column 5 is '@' when the Winner played away (i.e. the
        # Loser is the home team).  Empty string means the Winner is home.
        at_flag = str(row.get('Unnamed: 5', '')).strip()
        if at_flag == '@':
            home_name  = str(row['Loser/tie']).strip()
            away_name  = str(row['Winner/tie']).strip()
            # PtsL is the home team's score; PtsW is the away team's score.
            home_score = int(row['PtsL']) if str(row.get('PtsL', '')).isdigit() else None
            away_score = int(row['PtsW']) if str(row.get('PtsW', '')).isdigit() else None
        else:
            home_name  = str(row['Winner/tie']).strip()
            away_name  = str(row['Loser/tie']).strip()
            home_score = int(row['PtsW']) if str(row.get('PtsW', '')).isdigit() else None
            away_score = int(row['PtsL']) if str(row.get('PtsL', '')).isdigit() else None

        home_id = resolve_team_id(conn, home_name)
        away_id = resolve_team_id(conn, away_name)
        week    = parse_week(row['Week'])

        conn.execute(
            text("""
                INSERT INTO games
                    (season, week, game_date, day,
                     home_team_id, away_team_id, home_score, away_score)
                VALUES
                    (:season, :week, :game_date, :day,
                     :home_id, :away_id, :home_score, :away_score)
            """),
            {
                "season":     season,
                "week":       week,
                "game_date":  row['_date'].date(),
                "day":        str(row.get('Day', '')).strip() or None,
                "home_id":    home_id,
                "away_id":    away_id,
                "home_score": home_score,
                "away_score": away_score,
            }
        )
        inserted += 1

    conn.commit()
    print(f"  games: {inserted} rows inserted.")


# --- 2. preseason_odds ------------------------------------------------------

def _read_odds_date_sheet(xl_path, sheet_name, season):
    """Read a date-column odds sheet (division / conference / superbowl).

    Translates MATLAB's column-finding logic:
      1. Scan col 0 for the first blank/NaN cell — that row is the date header.
      2. In that row find the last column whose value contains '9/' or 'Sep'
         (covers formats like '9/7/2023', 'Sep 7', 'September 7', etc.) or is
         a pd.Timestamp with month == 9.
      3. Team data rows are every row after the date header where col 0 is
         non-blank (division-group label rows — e.g. 'AFC East Division' — are
         included as data rows but resolve_team_id will raise on them, so we
         skip blank/nan names during the dict build instead of pre-filtering).

    Returns {team_name_string: odds_value} or {} on any failure.
    """
    df = pd.read_excel(xl_path, sheet_name=sheet_name, header=0)
    name_col = df.columns[0]

    # Step 1 — find first blank in col 0 (the date header row)
    date_row_idx = None
    for idx, val in df[name_col].items():
        if pd.isna(val) or str(val).strip() in ('', 'nan'):
            date_row_idx = idx
            break

    if date_row_idx is None:
        warnings.warn(
            f"Season {season}: '{sheet_name}' — no blank row in col 0; "
            "cannot locate date header row. Skipping."
        )
        return {}

    # Step 2:  find last September column in that row.
    # Pandas reads Excel date cells as datetime.datetime objects (not pd.Timestamp),
    # so we use hasattr('month') to cover both types.
    date_row = df.loc[date_row_idx]
    sept_col = None
    for col_name, val in date_row.items():
        is_sept = False
        if hasattr(val, 'month') and val.month == 9:
            is_sept = True
        elif not pd.isna(val):
            s = str(val)
            if re.search(r'9/', s) or re.search(r'[Ss]ep', s):
                is_sept = True
        if is_sept:
            sept_col = col_name  # keep overwriting → last match wins (MATLAB: column(end))

    if sept_col is None:
        warnings.warn(
            f"Season {season}: '{sheet_name}' — no September date found in "
            "date header row. Skipping."
        )
        return {}

    # Step 3:  collect team rows after the date header row.
    # Skip blank rows (NaN or NaT, both are null in pandas) and division/conference
    # group labels (e.g. 'AFC North Division', 'NFC Conference').
    result = {}
    for idx, row in df[df.index > date_row_idx].iterrows():
        raw = row[name_col]
        if pd.isna(raw):       # catches both float NaN and pd.NaT
            continue
        name = str(raw).strip()
        if not name:
            continue
        if 'Division' in name or 'Conference' in name:
            continue
        if name.lower() in ('team', 'as of...', 'result'):
            continue
        result[name] = row.get(sept_col)
    return result


def ingest_preseason_odds(conn, season):
    """Load <season>.xlsx from ODDS_DIR into the preseason_odds table.

    The workbook has five sheets:
      playoffs    Make Odds / Miss Odds columns per team
      wintotals   Win Total column per team
      division    date-keyed odds; we want the September column
      conference  same
      superbowl   same

    For division/conference/superbowl, the September column is the preseason
    line before the NFL regular season kicks off.
    """
    odds_file = os.path.join(ODDS_DIR, f"{season}.xlsx")
    if not os.path.exists(odds_file):
        warnings.warn(
            f"Season {season}: odds file not found: {odds_file}. "
            "Skipping preseason_odds."
        )
        return

    xl = pd.ExcelFile(odds_file)

    # --- playoffs sheet ------------------------------------------------
    playoffs_data = {}   # name → {'make_odds': ..., 'miss_odds': ...}
    if 'playoffs' in xl.sheet_names:
        df_po = pd.read_excel(odds_file, sheet_name='playoffs', header=0)
        df_po.columns = [c.strip() for c in df_po.columns]
        for _, row in df_po.iterrows():
            name = str(row.iloc[0]).strip()
            if not name or name == 'nan':
                continue
            playoffs_data[name] = {
                'make_odds': row.get('Make Odds'),
                'miss_odds': row.get('Miss Odds'),
            }

    # --- wintotals sheet ------------------------------------------------
    wintotals_data = {}  # name → win_total float
    if 'wintotals' in xl.sheet_names:
        df_wt = pd.read_excel(odds_file, sheet_name='wintotals', header=0)
        df_wt.columns = [c.strip() for c in df_wt.columns]
        for _, row in df_wt.iterrows():
            name = str(row.iloc[0]).strip()
            if not name or name == 'nan':
                continue
            wintotals_data[name] = row.get('Win Total')

    # --- helper: read one date-column sheet and return {name: sept_odds} ---
    def read_sept_odds(sheet_name):
        if sheet_name not in xl.sheet_names:
            return {}
        return _read_odds_date_sheet(odds_file, sheet_name, season)

    division_data   = read_sept_odds('division')
    conference_data = read_sept_odds('conference')
    superbowl_data  = read_sept_odds('superbowl')

    # Drive iteration from playoffs_data + wintotals_data only — those sheets
    # have clean team-name rows. The date-column sheets (division/conference/
    # superbowl) can contain sub-header strings that survive the row filter;
    # use .get() on them instead of including them in the name set.
    all_names = set(playoffs_data.keys()) | set(wintotals_data.keys())

    inserted = 0
    for name in sorted(all_names):
        team_id   = resolve_team_id(conn, name)   # raises on miss: abort

        make_odds = playoffs_data.get(name, {}).get('make_odds')
        miss_odds = playoffs_data.get(name, {}).get('miss_odds')
        win_total = wintotals_data.get(name)
        div_odds  = division_data.get(name)
        conf_odds = conference_data.get(name)
        sb_odds   = superbowl_data.get(name)

        conn.execute(
            text("""
                INSERT INTO preseason_odds (
                    team_id, season,
                    playoff_make_odds, playoff_make_prob,
                    playoff_miss_odds, playoff_miss_prob,
                    win_total,
                    division_odds,   division_prob,
                    conference_odds, conference_prob,
                    superbowl_odds,  superbowl_prob
                ) VALUES (
                    :team_id, :season,
                    :make_odds, :make_prob,
                    :miss_odds, :miss_prob,
                    :win_total,
                    :div_odds,  :div_prob,
                    :conf_odds, :conf_prob,
                    :sb_odds,   :sb_prob
                )
            """),
            {
                "team_id":   team_id,
                "season":    season,
                "make_odds": make_odds,
                "make_prob": implied_probability(make_odds),
                "miss_odds": miss_odds,
                "miss_prob": implied_probability(miss_odds),
                "win_total": win_total,
                "div_odds":  div_odds,
                "div_prob":  implied_probability(div_odds),
                "conf_odds": conf_odds,
                "conf_prob": implied_probability(conf_odds),
                "sb_odds":   sb_odds,
                "sb_prob":   implied_probability(sb_odds),
            }
        )
        inserted += 1

    conn.commit()
    print(f"  preseason_odds: {inserted} rows inserted.")


# --- 3. prime_viewership ------------------------------------------------------

def _find_p2_aa_col(df):
    """Return the column name for P2+LVSD_US_AA.
    This column contains '+' which makes it awkward to access by dict-style
    lookup.  We find it by regex so callers can use the returned name safely."""
    for col in df.columns:
        if re.search(r'P2\+.*US_AA$', str(col), re.IGNORECASE):
            return col
    return None


def ingest_prime_viewership(conn, season):
    """Load non_sunday_primetimes.xlsx rows for `season` into prime_viewership.

    Episode format in the source: 'AWAY AT HOME' or 'AWAY @ HOME (notes)'.
    We split on ' AT ' or ' @ ' and strip any trailing parenthetical to get
    the team names, then resolve both to team_ids via the alias table.

    NOTE: primetime data is only available for seasons 2014–2023.  Years
    outside that range emit a warning and skip this table.
    """
    if not os.path.exists(PRIME_XLS):
        warnings.warn(
            f"Season {season}: primetime file not found: {PRIME_XLS}. "
            "Skipping prime_viewership."
        )
        return

    df = pd.read_excel(PRIME_XLS, header=0)

    if 'Season' not in df.columns:
        warnings.warn(
            f"Season {season}: 'Season' column missing in primetime file. "
            "Skipping prime_viewership."
        )
        return

    df = df[df['Season'] == season].copy()
    if df.empty:
        warnings.warn(
            f"Season {season}: no primetime rows found (data may not cover this year). "
            "Skipping prime_viewership."
        )
        return

    # Identify the P2+LVSD_US_AA column before row iteration.
    p2_aa_col = _find_p2_aa_col(df)

    def parse_episode(episode):
        """Split 'AWAY AT HOME (OT)' or 'AWAY@HOME (pct)' → ('AWAY', 'HOME').
        Handles both ' AT ' and '@' (with or without surrounding spaces)."""
        s = str(episode).strip()
        for sep in (' AT ', ' @ ', '@'):
            if sep in s:
                away, rest = s.split(sep, 1)
                home = rest.split('(')[0].strip()
                return away.strip(), home
        raise ValueError(f"Cannot parse Episode field: '{episode}'")

    inserted = 0
    for _, row in df.iterrows():
        try:
            away_name, home_name = parse_episode(row.get('Episode', ''))
        except ValueError as e:
            warnings.warn(str(e))
            continue

        home_id = resolve_team_id(conn, home_name)
        away_id = resolve_team_id(conn, away_name)

        # Week may be stored as float (e.g. 17.0) in Excel.
        week_raw = row.get('Week')
        week = int(float(week_raw)) if pd.notna(week_raw) else None

        p2_aa_val = row[p2_aa_col] if p2_aa_col and p2_aa_col in row.index else None

        window = str(row.get('Window', '')).strip()
        window = None if window.lower() in ('empty', 'nan', '') else window

        conn.execute(
            text("""
                INSERT INTO prime_viewership (
                    season, week, telecast_date, day,
                    home_team_id, away_team_id,
                    network, program, episode, broadcast_window,
                    start_time, end_time,
                    hhld_aa, hhld_aa_rating, hhld_share,
                    p2_aa_rating, p2_aa, p2_share,
                    duration
                ) VALUES (
                    :season, :week, :date, :day,
                    :home_id, :away_id,
                    :network, :program, :episode, :window,
                    :start_time, :end_time,
                    :hhld_aa, :hhld_aa_rating, :hhld_share,
                    :p2_aa_rating, :p2_aa, :p2_share,
                    :duration
                )
            """),
            {
                "season":   season,
                "week":     week,
                "date":     pd.to_datetime(row['Telecast Date']).date() if pd.notna(row.get('Telecast Date')) else None,
                "day":      str(row.get('Day', '')).strip() or None,
                "home_id":  home_id,
                "away_id":  away_id,
                "network":  str(row.get('Originator', '')).strip() or None,
                "program":  str(row.get('Program',    '')).strip() or None,
                "episode":  str(row.get('Episode',    '')).strip() or None,
                "window":   window,
                "start_time": str(row.get('Telecast Start Time', '')).strip() or None,
                "end_time":   str(row.get('Telecast End Time',   '')).strip() or None,
                "hhld_aa":        int(float(row['HHLD_LVSD_US_AA']))       if pd.notna(row.get('HHLD_LVSD_US_AA'))       else None,
                "hhld_aa_rating": float(row['HHLD_LVSD_US_AA_Rating'])     if pd.notna(row.get('HHLD_LVSD_US_AA_Rating')) else None,
                "hhld_share":     float(row['HHLD_LVSD_US_Share'])         if pd.notna(row.get('HHLD_LVSD_US_Share'))     else None,
                "p2_aa_rating":   float(row['P2PLVSD_US_AA_Rating'])       if pd.notna(row.get('P2PLVSD_US_AA_Rating'))   else None,
                "p2_aa":          int(float(p2_aa_val))                    if p2_aa_val is not None and pd.notna(p2_aa_val) else None,
                "p2_share":       float(row['P2PLVSD_US_Share'])           if pd.notna(row.get('P2PLVSD_US_Share'))       else None,
                "duration":       to_minutes(row.get('Duration')),
            }
        )
        inserted += 1

    conn.commit()
    print(f"  prime_viewership: {inserted} rows inserted.")


# --- 4. playoff_matchups ------------------------------------------------------

def ingest_playoff_matchups(conn, season):
    """Load NFLplayoff_matchups.xlsx (Sheet1) rows for `season`."""
    if not os.path.exists(PLAYOFF_XLS):
        warnings.warn(
            f"Season {season}: playoff matchups file not found: {PLAYOFF_XLS}. "
            "Skipping playoff_matchups."
        )
        return

    df = pd.read_excel(PLAYOFF_XLS, sheet_name='Sheet1', header=0)

    if 'Year' not in df.columns:
        warnings.warn(
            f"Season {season}: 'Year' column missing in playoff matchups file. "
            "Skipping playoff_matchups."
        )
        return

    df = df[df['Year'] == season].copy()
    if df.empty:
        warnings.warn(
            f"Season {season}: no playoff matchup rows found. "
            "Skipping playoff_matchups."
        )
        return

    inserted = 0
    for _, row in df.iterrows():
        home_id = resolve_team_id(conn, str(row['Home Team']).strip())
        away_id = resolve_team_id(conn, str(row['Away Team']).strip())

        winner_id = None
        if pd.notna(row.get('Winner')):
            winner_id = resolve_team_id(conn, str(row['Winner']).strip())

        spread   = float(row['Spread'])    if pd.notna(row.get('Spread'))     else None
        ou       = float(row['Over/Under']) if pd.notna(row.get('Over/Under')) else None

        conn.execute(
            text("""
                INSERT INTO playoff_matchups (
                    season, home_team_id, away_team_id,
                    playoff_date, timeofday, game_type, conference,
                    spread, over_under, winner_id, score
                ) VALUES (
                    :season, :home_id, :away_id,
                    :date, :timeofday, :game_type, :conference,
                    :spread, :ou, :winner_id, :score
                )
            """),
            {
                "season":    season,
                "home_id":   home_id,
                "away_id":   away_id,
                "date":      pd.to_datetime(row['Date']).date() if pd.notna(row.get('Date')) else None,
                "timeofday": str(row.get('timeofday', '')).strip() or None,
                "game_type": str(row.get('Gametype',  '')).strip() or None,
                "conference": str(row.get('Conference', '')).strip() or None,
                "spread":    spread,
                "ou":        ou,
                "winner_id": winner_id,
                "score":     str(row.get('Score', '')).strip() or None,
            }
        )
        inserted += 1

    conn.commit()
    print(f"  playoff_matchups: {inserted} rows inserted.")


# --- 5. viewership --------------------------------------------------------

def _build_games_lookup(conn, season):
    """Return a dict: (week, frozenset({home_id, away_id})) → (home_id, away_id).

    We include week in the key because division rivals play each other twice per
    season (e.g. Cowboys/Giants both in NFC East).  A bare frozenset({h, a}) key
    would let the second game silently overwrite the first in the dict, assigning
    the wrong home/away orientation to both viewership rows and hitting the UNIQUE
    constraint on the second insert.  Adding week makes every matchup entry
    unique even for same-division rematches."""
    rows = conn.execute(
        text("SELECT week, home_team_id, away_team_id FROM games WHERE season = :s"),
        {"s": season}
    ).fetchall()
    return {(w, frozenset({h, a})): (h, a) for w, h, a in rows}


def ingest_viewership(conn, season):
    """Load NFLTV_ML_10.csv rows for `season` into the viewership table.

    Key design points:
      - Only columns A–X are loaded (the rest are engineered ML features).
      - Filtered to Sunday games (Day == 'Sun') to match the ML notebooks.
      - Home/away is NOT taken from the 'at'/'ht' CSV columns (those are derived
        features); instead EpisodeTitle is split on '&' to get the two tv_codes
        and they are resolved against the games table for correct venue order.
      - 'window' column stores the string "empty" when no broadcast window
        exists; we convert that to SQL NULL.
    """
    if not os.path.exists(VIEWERSHIP_CSV):
        warnings.warn(
            f"Season {season}: viewership CSV not found: {VIEWERSHIP_CSV}. "
            "Skipping viewership."
        )
        return

    try:
        df = pd.read_csv(
            VIEWERSHIP_CSV,
            usecols=lambda c: c in _VIEW_COLS,
            low_memory=False,
        )
    except Exception as e:
        warnings.warn(f"Season {season}: could not read viewership CSV: {e}. Skipping viewership.")
        return

    df = df[df['Season'] == season].copy()
    if df.empty:
        warnings.warn(f"Season {season}: no viewership rows found. Skipping.")
        return

    # Project convention: train only on Sunday regular-season games.
    df = df[df['Day'].str.strip().str.lower() == 'sun'].copy()
    if df.empty:
        warnings.warn(f"Season {season}: no Sunday viewership rows found. Skipping.")
        return

    # Build a one-time lookup for home/away resolution.
    games_lookup = _build_games_lookup(conn, season)

    # Cache market_id lookups to avoid a DB round-trip per row.
    market_cache: dict = {}

    def get_market_id(abrev):
        if abrev not in market_cache:
            row = conn.execute(
                text("SELECT market_id FROM markets WHERE market_abrev = :a"),
                {"a": abrev}
            ).fetchone()
            if row is None:
                raise ValueError(
                    f"Market abbreviation '{abrev}' not found in markets table. "
                    "Check that load_reference_data.py ran successfully."
                )
            market_cache[abrev] = row[0]
        return market_cache[abrev]

    def safe_float(val):
        try:
            return float(val) if pd.notna(val) else None
        except (TypeError, ValueError):
            return None

    inserted = 0
    skipped  = 0

    for _, row in df.iterrows():
        # --- market abbreviation ------------------------------------------------
        # Prefer Market_abrev, fall back to abrev, then derive from Market name.
        abrev = str(row.get('Market_abrev', '')).strip()
        if not abrev or abrev == 'nan':
            abrev = str(row.get('abrev', '')).strip()
        if not abrev or abrev == 'nan':
            abrev = derive_market_abrev(str(row['Market']))
        market_id = get_market_id(abrev)

        # --- home/away from EpisodeTitle ------------------------------------------------
        # EpisodeTitle format: 'BRNCO&JAGRS' — two tv_codes joined by '&'.
        # We resolve each to a team_id, then look up (week, frozenset) in the
        # games table to get the canonical home/away for that specific game.
        # Using week in the key handles division rivals who play each other twice.
        episode = str(row.get('EpisodeTitle', '')).strip()
        if '&' not in episode:
            skipped += 1
            continue
        left, right = [p.strip() for p in episode.split('&', 1)]

        id_left  = resolve_team_id(conn, left)    # raises on miss → abort
        id_right = resolve_team_id(conn, right)

        row_week = int(float(row['week'])) if pd.notna(row.get('week')) else None
        key = (row_week, frozenset({id_left, id_right}))
        if key not in games_lookup:
            raise ValueError(
                f"Season {season} week {row_week}: game '{left} & {right}' not found "
                "in games table. Ensure ingest_games completed for this season."
            )
        home_id, away_id = games_lookup[key]

        # --- broadcast_window ------------------------------------------------
        window = str(row.get('window', '')).strip()
        window = None if window.lower() in ('empty', 'nan', '') else window

        conn.execute(
            text("""
                INSERT INTO viewership (
                    season, week, game_date, day,
                    home_team_id, away_team_id, market_id,
                    network, title, call_letters, episode_title,
                    broadcast_window, start_time, end_time,
                    hhldaa_000, share, rating, duration, universe
                ) VALUES (
                    :season, :week, :game_date, :day,
                    :home_id, :away_id, :market_id,
                    :network, :title, :call_letters, :episode_title,
                    :window, :start_time, :end_time,
                    :hhld, :share, :rating, :duration, :universe
                )
            """),
            {
                "season":       season,
                "week":         int(float(row['week'])) if pd.notna(row.get('week')) else None,
                "game_date":    pd.to_datetime(row['Date']).date() if pd.notna(row.get('Date')) else None,
                "day":          str(row.get('Day', '')).strip() or None,
                "home_id":      home_id,
                "away_id":      away_id,
                "market_id":    market_id,
                "network":      str(row.get('Affiliation',    '')).strip() or None,
                "title":        str(row.get('Title_grouped_', '')).strip() or None,
                "call_letters": str(row.get('CallLetters',    '')).strip() or None,
                "episode_title": episode,
                "window":       window,
                "start_time":   str(row.get('Start', '')).strip() or None,
                "end_time":     str(row.get('End',   '')).strip() or None,
                "hhld":         safe_float(row.get('AA__000_')),
                "share":        safe_float(row.get('SHR')),
                "rating":       safe_float(row.get('RTG')),
                "duration":     to_minutes(row.get('Duration')),
                "universe":     int(float(row['Universe'])) if pd.notna(row.get('Universe')) else None,
            }
        )
        inserted += 1

    conn.commit()
    print(f"  viewership: {inserted} rows inserted"
          + (f" ({skipped} skipped — no '&' in EpisodeTitle)." if skipped else "."))


# --- Orchestrator --------------------------------------------------------

def ingest_season(conn, season, force):
    """Run all five ingest functions for one season in FK-safe order."""
    print(f"\n=== Season {season} ===")
    if not preflight_check(conn, season, force):
        return
    ingest_games(conn, season)
    ingest_preseason_odds(conn, season)
    ingest_prime_viewership(conn, season)
    ingest_playoff_matchups(conn, season)
    ingest_viewership(conn, season)


# --- Entry point --------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Load NFL fact tables for one season or all seasons.\n"
            f"All-seasons range: {ALL_SEASONS[0]}–{ALL_SEASONS[-1]}."
        )
    )
    # year and --all are mutually exclusive; one is required.
    parser.add_argument(
        'year', nargs='?', type=int,
        help="Calendar year of the NFL season to ingest (e.g. 2023)."
    )
    parser.add_argument(
        '--all', action='store_true',
        help=f"Ingest all seasons ({ALL_SEASONS[0]}–{ALL_SEASONS[-1]})."
    )
    parser.add_argument(
        '--force', action='store_true',
        help="Delete existing rows for the season(s) before re-inserting."
    )
    args = parser.parse_args()

    if not args.all and args.year is None:
        parser.error("Specify a year (e.g. 2023) or pass --all.")

    engine = get_engine()
    with engine.connect() as conn:
        if args.all:
            for season in ALL_SEASONS:
                ingest_season(conn, season, args.force)
        else:
            ingest_season(conn, args.year, args.force)

    print("\nDone.")


if __name__ == "__main__":
    main()
