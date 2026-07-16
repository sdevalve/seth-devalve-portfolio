import argparse
import os
import re

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# --- File paths ---------------------------------------------------------------

VIEWERSHIP_CSV = r"...\NFLTV_ML_10.csv"

# --- Hardcoded alias data -----------------------------------------------------
# Every string that appears in any source file to identify a team, mapped to
# the team's abbreviation. The script resolves abbreviations → team_id at
# runtime via a SELECT on the teams table.
# Format: (abbreviation, alias_string)

TEAM_ALIAS_ROWS = [
    # Arizona Cardinals
    ('ARI', 'ARI'), ('ARI', 'Arizona'), ('ARI', 'Cardinals'), ('ARI', 'CARDS'),
    ('ARI', 'Arizona Cardinals'),
    # Atlanta Falcons
    ('ATL', 'ATL'), ('ATL', 'Atlanta'), ('ATL', 'Falcons'), ('ATL', 'FALCN'),
    ('ATL', 'Atlanta Falcons'),
    # Baltimore Ravens
    ('BAL', 'BAL'), ('BAL', 'Baltimore'), ('BAL', 'Ravens'), ('BAL', 'RAVEN'),
    ('BAL', 'Baltimore Ravens'),
    # Buffalo Bills - 'Bills' dropped; BILLS is the tv_code used in EpisodeTitle
    ('BUF', 'BUF'), ('BUF', 'Buffalo'), ('BUF', 'BILLS'),
    ('BUF', 'Buffalo Bills'),
    # Carolina Panthers
    ('CAR', 'CAR'), ('CAR', 'Carolina'), ('CAR', 'Panthers'), ('CAR', 'PNTHR'),
    ('CAR', 'Carolina Panthers'),
    # Chicago Bears - 'Bears' dropped; BEARS is the tv_code used in EpisodeTitle
    ('CHI', 'CHI'), ('CHI', 'Chicago'), ('CHI', 'BEARS'),
    ('CHI', 'Chicago Bears'),
    # Cincinnati Bengals
    ('CIN', 'CIN'), ('CIN', 'Cincinnati'), ('CIN', 'Bengals'), ('CIN', 'BENGL'),
    ('CIN', 'Cincinnati Bengals'),
    # Cleveland Browns
    ('CLE', 'CLE'), ('CLE', 'Cleveland'), ('CLE', 'Browns'), ('CLE', 'BRWNS'),
    ('CLE', 'Cleveland Browns'),
    # Dallas Cowboys
    ('DAL', 'DAL'), ('DAL', 'Dallas'), ('DAL', 'Cowboys'), ('DAL', 'COWBY'),
    ('DAL', 'Dallas Cowboys'),
    # Denver Broncos
    ('DEN', 'DEN'), ('DEN', 'Denver'), ('DEN', 'Broncos'), ('DEN', 'BRNCO'),
    ('DEN', 'Denver Broncos'),
    # Detroit Lions - 'Lions' dropped; LIONS is the tv_code used in EpisodeTitle
    ('DET', 'DET'), ('DET', 'Detroit'), ('DET', 'LIONS'),
    ('DET', 'Detroit Lions'),
    # Green Bay Packers
    ('GB',  'GB'),  ('GB',  'Green Bay'), ('GB',  'Packers'), ('GB',  'PCKRS'),
    ('GB',  'Green Bay Packers'),
    # Houston Texans
    ('HOU', 'HOU'), ('HOU', 'Houston'), ('HOU', 'Texans'), ('HOU', 'TEXAN'),
    ('HOU', 'Houston Texans'),
    # Indianapolis Colts - 'Colts' dropped; COLTS is the tv_code used in EpisodeTitle
    ('IND', 'IND'), ('IND', 'Indianapolis'), ('IND', 'COLTS'),
    ('IND', 'Indianapolis Colts'),
    # Jacksonville Jaguars
    ('JAX', 'JAX'), ('JAX', 'Jacksonville'), ('JAX', 'Jaguars'), ('JAX', 'JAGRS'),
    ('JAX', 'Jacksonville Jaguars'),
    # Kansas City Chiefs
    ('KC',  'KC'),  ('KC',  'Kansas City'), ('KC',  'Chiefs'), ('KC',  'CHIEF'),
    ('KC',  'Kansas City Chiefs'),
    # Los Angeles Chargers (+ historical San Diego)
    ('LAC', 'LAC'), ('LAC', 'Chargers'), ('LAC', 'CHRGR'),
    ('LAC', 'Los Angeles Chargers'),
    ('LAC', 'San Diego Chargers'), ('LAC', 'San Diego'),
    # Los Angeles Rams (+ historical St. Louis) - 'Rams' dropped; RAMS is the tv_code
    ('LAR', 'LAR'), ('LAR', 'RAMS'),
    ('LAR', 'Los Angeles Rams'),
    ('LAR', 'St. Louis Rams'), ('LAR', 'St Louis Rams'),
    ('LAR', 'St. Louis'), ('LAR', 'ST LOUIS'),
    # Las Vegas Raiders (+ historical Oakland)
    ('LV',  'LV'),  ('LV',  'Las Vegas'), ('LV',  'Raiders'), ('LV',  'RAIDR'),
    ('LV',  'Las Vegas Raiders'),
    ('LV',  'Oakland Raiders'), ('LV',  'Oakland'),
    # Miami Dolphins
    ('MIA', 'MIA'), ('MIA', 'Miami'), ('MIA', 'Dolphins'), ('MIA', 'DLPHN'),
    ('MIA', 'Miami Dolphins'),
    # Minnesota Vikings
    ('MIN', 'MIN'), ('MIN', 'Minnesota'), ('MIN', 'Vikings'), ('MIN', 'VIKNG'),
    ('MIN', 'Minnesota Vikings'),
    # New England Patriots
    ('NE',  'NE'),  ('NE',  'New England'), ('NE',  'Patriots'), ('NE',  'PATS'),
    ('NE',  'New England Patriots'),
    # New Orleans Saints
    ('NO',  'NO'),  ('NO',  'New Orleans'), ('NO',  'Saints'), ('NO',  'SAINT'),
    ('NO',  'New Orleans Saints'),
    # New York Giants (no bare 'New York' — ambiguous with Jets)
    ('NYG', 'NYG'), ('NYG', 'Giants'), ('NYG', 'GIANT'),
    ('NYG', 'New York Giants'), ('NYG', 'NY Giants'),
    # New York Jets - 'Jets' dropped; JETS is the tv_code used in EpisodeTitle
    ('NYJ', 'NYJ'), ('NYJ', 'JETS'),
    ('NYJ', 'New York Jets'), ('NYJ', 'NY Jets'),
    # Philadelphia Eagles
    ('PHI', 'PHI'), ('PHI', 'Philadelphia'), ('PHI', 'Eagles'), ('PHI', 'EAGLE'),
    ('PHI', 'Philadelphia Eagles'),
    # Pittsburgh Steelers
    ('PIT', 'PIT'), ('PIT', 'Pittsburgh'), ('PIT', 'Steelers'), ('PIT', 'STLRS'),
    ('PIT', 'Pittsburgh Steelers'),
    # Seattle Seahawks
    ('SEA', 'SEA'), ('SEA', 'Seattle'), ('SEA', 'Seahawks'), ('SEA', 'SEAHK'),
    ('SEA', 'Seattle Seahawks'),
    # San Francisco 49ers
    ('SF',  'SF'),  ('SF',  'San Francisco'), ('SF',  'Niners'), ('SF',  '49RS'),
    ('SF',  'San Francisco 49ers'), ('SF',  'San Francisco Niners'), ('SF',  '49ers'),
    # Tampa Bay Buccaneers
    ('TB',  'TB'),  ('TB',  'Tampa Bay'), ('TB',  'Buccaneers'), ('TB',  'BUCS'),
    ('TB',  'Tampa Bay Buccaneers'),
    # Tennessee Titans
    ('TEN', 'TEN'), ('TEN', 'Tennessee'), ('TEN', 'Titans'), ('TEN', 'TITAN'),
    ('TEN', 'Tennessee Titans'),
    # Washington Commanders (+ historical names)
    ('WSH', 'WSH'), ('WSH', 'Washington'), ('WSH', 'Commanders'), ('WSH', 'CMNDR'),
    ('WSH', 'Washington Commanders'),
    ('WSH', 'Washington Redskins'), ('WSH', 'Redskins'),
    ('WSH', 'Washington Football Team'), ('WSH', 'Football Team'),
]

# --- Hardcoded division data --------------------------------------------------
# Format: (abbreviation, division, conference)
# No season_from needed — no team changed divisions in 2010-2024.

DIVISION_ROWS = [
    # AFC East
    ('BUF', 'AFC East', 'AFC'), ('MIA', 'AFC East', 'AFC'),
    ('NE',  'AFC East', 'AFC'), ('NYJ', 'AFC East', 'AFC'),
    # AFC North
    ('BAL', 'AFC North', 'AFC'), ('CIN', 'AFC North', 'AFC'),
    ('CLE', 'AFC North', 'AFC'), ('PIT', 'AFC North', 'AFC'),
    # AFC South
    ('HOU', 'AFC South', 'AFC'), ('IND', 'AFC South', 'AFC'),
    ('JAX', 'AFC South', 'AFC'), ('TEN', 'AFC South', 'AFC'),
    # AFC West
    ('DEN', 'AFC West', 'AFC'), ('KC',  'AFC West', 'AFC'),
    ('LAC', 'AFC West', 'AFC'), ('LV',  'AFC West', 'AFC'),
    # NFC East
    ('DAL', 'NFC East', 'NFC'), ('NYG', 'NFC East', 'NFC'),
    ('PHI', 'NFC East', 'NFC'), ('WSH', 'NFC East', 'NFC'),
    # NFC North
    ('CHI', 'NFC North', 'NFC'), ('DET', 'NFC North', 'NFC'),
    ('GB',  'NFC North', 'NFC'), ('MIN', 'NFC North', 'NFC'),
    # NFC South
    ('ATL', 'NFC South', 'NFC'), ('CAR', 'NFC South', 'NFC'),
    ('NO',  'NFC South', 'NFC'), ('TB',  'NFC South', 'NFC'),
    # NFC West
    ('ARI', 'NFC West', 'NFC'), ('LAR', 'NFC West', 'NFC'),
    ('SEA', 'NFC West', 'NFC'), ('SF',  'NFC West', 'NFC'),
]

# --- Hardcoded location data --------------------------------------------------
# Format: (abbreviation, season_from, season_to (or None), latitude, longitude, timezone_offset)
# season_to = None means the team is still at this location.
# timezone_offset = hours from UTC (standard time, not adjusted for DST).

TEAM_LOCATION_ROWS = [
    ('ARI', 2003, None, 33.5276, -112.2626, -7),   # State Farm Stadium, Glendale AZ
    ('ATL', 2003, 2016, 33.7580, -84.4010,  -5),   # Georgia Dome
    ('ATL', 2017, None, 33.7555, -84.4010,  -5),   # Mercedes-Benz Stadium
    ('BAL', 2003, None, 39.2780, -76.6227,  -5),   # M&T Bank Stadium
    ('BUF', 2003, None, 42.7738, -78.7870,  -5),   # Highmark Stadium
    ('CAR', 2003, None, 35.2258, -80.8528,  -5),   # Bank of America Stadium
    ('CHI', 2003, None, 41.8623, -87.6167,  -6),   # Soldier Field
    ('CIN', 2003, None, 39.0955, -84.5160,  -5),   # Paycor Stadium
    ('CLE', 2003, None, 41.5061, -81.6995,  -5),   # FirstEnergy Stadium
    ('DAL', 2003, 2008, 32.8997, -97.0614,  -6),   # Texas Stadium
    ('DAL', 2009, None, 32.7473, -97.0945,  -6),   # AT&T Stadium
    ('DEN', 2003, None, 39.7439, -105.0200, -7),   # Empower Field
    ('DET', 2003, None, 42.3400, -83.0456,  -5),   # Ford Field
    ('GB',  2003, None, 44.5013, -88.0622,  -6),   # Lambeau Field
    ('HOU', 2003, None, 29.6847, -95.4107,  -6),   # NRG Stadium
    ('IND', 2003, 2007, 39.7600, -86.1639,  -5),   # RCA Dome
    ('IND', 2008, None, 39.7601, -86.1639,  -5),   # Lucas Oil Stadium
    ('JAX', 2003, None, 30.3239, -81.6373,  -5),   # EverBank Stadium
    ('KC',  2003, None, 39.0489, -94.4839,  -6),   # Arrowhead Stadium
    ('LAC', 2003, 2016, 32.7831, -117.1197, -8),   # Qualcomm Stadium, San Diego
    ('LAC', 2017, 2019, 33.8646, -118.2611, -8),   # Dignity Health Sports Park, Carson
    ('LAC', 2020, None, 33.9535, -118.3391, -8),   # SoFi Stadium
    ('LAR', 2003, 2015, 38.6328, -90.1878,  -6),   # Edward Jones Dome, St. Louis
    ('LAR', 2016, 2019, 34.0141, -118.2879, -8),   # LA Memorial Coliseum
    ('LAR', 2020, None, 33.9535, -118.3391, -8),   # SoFi Stadium
    ('LV',  2003, 2019, 37.7517, -122.2008, -8),   # Oakland Coliseum
    ('LV',  2020, None, 36.0909, -115.1833, -8),   # Allegiant Stadium, Las Vegas
    ('MIA', 2003, None, 25.9580, -80.2389,  -5),   # Hard Rock Stadium
    ('MIN', 2003, 2013, 44.9736, -93.2575,  -6),   # Metrodome
    ('MIN', 2014, 2015, 44.9741, -93.2228,  -6),   # TCF Bank Stadium (temporary)
    ('MIN', 2016, None, 44.9737, -93.2572,  -6),   # US Bank Stadium
    ('NE',  2003, None, 42.0909, -71.2643,  -5),   # Gillette Stadium
    ('NO',  2003, None, 29.9511, -90.0812,  -6),   # Caesars Superdome
    ('NYG', 2003, 2009, 40.8135, -74.0744,  -5),   # Giants Stadium
    ('NYG', 2010, None, 40.8135, -74.0744,  -5),   # MetLife Stadium
    ('NYJ', 2003, 2009, 40.8135, -74.0744,  -5),   # Giants Stadium
    ('NYJ', 2010, None, 40.8135, -74.0744,  -5),   # MetLife Stadium
    ('PHI', 2003, None, 39.9008, -75.1675,  -5),   # Lincoln Financial Field
    ('PIT', 2003, None, 40.4468, -80.0158,  -5),   # Acrisure Stadium
    ('SEA', 2003, None, 47.5952, -122.3316, -8),   # Lumen Field
    ('SF',  2003, 2013, 37.7136, -122.3864, -8),   # Candlestick Park
    ('SF',  2014, None, 37.4033, -121.9694, -8),   # Levi's Stadium
    ('TB',  2003, None, 27.9759, -82.5033,  -5),   # Raymond James Stadium
    ('TEN', 2003, None, 36.1665, -86.7713,  -6),   # Nissan Stadium
    ('WSH', 2003, None, 38.9077, -76.8645,  -5),   # FedExField
]

# --- Hardcoded market data -----------------------------------------------------
# Format: (market_abrev, market_name, primary_team_tv_code (or None), timezone_offset from EST)
# primary_team_tv_code: tv_code from the teams table for the local NFL franchise.
#   None means this market has no local NFL team.
# timezone_offset: hours from Eastern time to local time (e.g. Pacific = -3).

MARKET_ROWS = [
    ('Albuqu', 'Albuquerque-Santa Fe',           'COWBY', -2),
    ('Atlant', 'Atlanta',                        'FALCN',  0),
    ('Austin', 'Austin',                         'COWBY',  -1),
    ('Baltim', 'Baltimore',                      'RAVEN',  0),
    ('Birmin', 'Birmingham (Ann and Tusc)',      'PNTHR', -1),
    ('Boston', 'Boston (Manchester)',            'PATS',   0),
    ('Buffal', 'Buffalo',                        'BILLS',  0),
    ('Charlo', 'Charlotte',                      'PNTHR',  0),
    ('Chicag', 'Chicago',                        'BEARS', -1),
    ('Cincin', 'Cincinnati',                     'BENGL',  0),
    ('Clevel', 'Cleveland-Akron (Canton)',       'BRWNS',  0),
    ('Columb', 'Columbus, OH',                   'BRWNS',  0),
    ('Dallas', 'Dallas-Ft. Worth',               'COWBY', -1),
    ('Dayton', 'Dayton',                         'BENGL',  0),
    ('Denver', 'Denver',                         'BRNCO', -2),
    ('Detroi', 'Detroit',                        'LIONS',  0),
    ('FtMy',  'Ft. Myers-Naples',                'DLPHN',  0),
    ('Greens', 'Greensboro-H.Point-W.Salem',     'PNTHR',  0),
    ('Greenv', 'Greenvll-Spart-Ashevll-And',     'PNTHR',  0),
    ('Hartfo', 'Hartford & New Haven',           'PATS',   0),
    ('Housto', 'Houston',                        'TEXAN', -1),
    ('Indian', 'Indianapolis',                   'COLTS',  0),
    ('Jackso', 'Jacksonville',                   'JAGRS',  0),
    ('Kansas', 'Kansas City',                    'CHIEF', -1),
    ('Knoxvi', 'Knoxville',                      'TITAN',  0),
    ('LasVe',  'Las Vegas',                      'RAIDR', -3),
    ('LosAn',  'Los Angeles',                    'RAMS',  -3),
    ('Louisv', 'Louisville',                     'RAVEN',   0),
    ('Memphi', 'Memphis',                        'TITAN',  -1),
    ('Miami',  'Miami-Ft. Lauderdale',           'DLPHN',  0),
    ('Milwau', 'Milwaukee',                      'PCKRS', -1),
    ('Minnea', 'Minneapolis-St. Paul',           'VIKNG', -1),
    ('Nashvi', 'Nashville',                      'TITAN', -1),
    ('NewOr',  'New Orleans',                    'SAINT', -1),
    ('NewYo',  'New York',                       'GIANT',  0),
    ('Norfol', 'Norfolk-Portsmth-Newpt Nws',     'CMNDR',   0),
    ('Oklaho', 'Oklahoma City',                  'COWBY',  -1),
    ('Orland', 'Orlando-Daytona Bch-Melbrn',     'BUCS',   0),
    ('Philad', 'Philadelphia',                   'EAGLE',  0),
    ('Phoeni', 'Phoenix (Prescott)',             'CARDS', -3),
    ('Pittsb', 'Pittsburgh',                     'STLRS',  0),
    ('Portla', 'Portland, OR',                   'SEAHK',   -3),
    ('Provid', 'Providence-New Bedford',         'PATS',     0),
    ('Raleig', 'Raleigh-Durham (Fayetvlle)',     'PNTHR',    0),
    ('Richmo', 'Richmond-Petersburg',            'CMNDR',  0),
    ('Sacram', 'Sacramnto-Stkton-Modesto',       '49RS',  -3),
    ('SaltL',  'Salt Lake City',                 'CHIEF',  -2),
    ('SanAn',  'San Antonio',                    'COWBY',   -1),
    ('SanDi',  'San Diego',                      'CHRGR',  -3),
    ('SanFr',  'San Francisco-Oak-San Jose',     '49RS',  -3),
    ('Seattl', 'Seattle-Tacoma',                 'SEAHK', -3),
    ('StLo',   'St. Louis',                      'RAMS',   -1),
    ('Tampa',  'Tampa-St. Pete (Sarasota)',       'BUCS',   0),
    ('Tulsa',  'Tulsa',                          'COWBY',   -1),
    ('Washin', 'Washington, DC (Hagrstwn)',       'CMNDR',  0),
    ('WestP',  'West Palm Beach-Ft. Pierce',     'DLPHN',   0),
]

# --- Database connection ------------------------------------------------------

def get_engine():
    load_dotenv()
    url = (
        f"mysql+pymysql://{os.environ['DB_USER']}:{os.environ['DB_PASSWORD']}"
        f"@{os.environ['DB_HOST']}:{os.environ['DB_PORT']}/{os.environ['DB_NAME']}"
    )
    return create_engine(url)

# --- Pre-flight check -----------------------------------------------------------

def preflight_check(conn, force):  # returns True if we should proceed with loading reference data
    count = conn.execute(text("SELECT COUNT(*) FROM team_aliases")).scalar()
    if count == 0:
        return True
    if not force:
        print(f"Reference data already loaded ({count} alias rows exist).")
        print("Run with --force to delete and reload.")
        return False
    print(f"--force: removing existing reference data ({count} alias rows)...")
    conn.execute(text("DELETE FROM divisions"))
    conn.execute(text("DELETE FROM markets"))
    conn.execute(text("DELETE FROM team_locations"))
    conn.execute(text("DELETE FROM team_aliases"))
    conn.commit()
    return True

# --- Alias lookup helper ------------------------------------------------------

def get_team_id(conn, abbreviation):  # returns team_id for a given team abbreviation
    row = conn.execute(
        text("SELECT team_id FROM teams WHERE abbreviation = :abbr"),
        {"abbr": abbreviation}
    ).fetchone()
    if row is None:
        raise ValueError(f"No team found with abbreviation '{abbreviation}'.")
    return row[0]

# --- Insert functions -----------------------------------------------------------

def insert_team_aliases(conn):  # inserts team aliases into the team_aliases table
    print("Inserting team aliases...")
    for abbr, alias in TEAM_ALIAS_ROWS:
        team_id = get_team_id(conn, abbr)
        conn.execute(
            text("INSERT INTO team_aliases (team_id, alias) VALUES (:team_id, :alias)"),
            {"team_id": team_id, "alias": alias}
        )
    conn.commit()
    print(f"  {len(TEAM_ALIAS_ROWS)} aliases inserted.")


def insert_team_locations(conn):  # inserts team locations into the team_locations table
    print("Inserting team locations...")
    for abbr, season_from, season_to, lat, lon, tz in TEAM_LOCATION_ROWS:
        team_id = get_team_id(conn, abbr)
        conn.execute(
            text("""
                INSERT INTO team_locations
                    (team_id, season_from, season_to, latitude, longitude, timezone_offset)
                VALUES
                    (:team_id, :season_from, :season_to, :lat, :lon, :tz)
            """),
            {
                "team_id": team_id, "season_from": season_from,
                "season_to": season_to, "lat": lat, "lon": lon, "tz": tz,
            }
        )
    conn.commit()
    print(f"  {len(TEAM_LOCATION_ROWS)} location rows inserted.")


def derive_market_abrev(market_name):  # derives a market abbreviation from the market name by taking the first 6 letters and removing non-alphabetic characters
    return re.sub(r'[^a-zA-Z]', '', market_name[:6])


def insert_divisions(conn):  # inserts divisions into the divisions table
    print("Inserting divisions...")
    for abbr, division, conference in DIVISION_ROWS:
        team_id = get_team_id(conn, abbr)
        conn.execute(
            text("""
                INSERT INTO divisions (team_id, division, conference)
                VALUES (:team_id, :division, :conference)
            """),
            {"team_id": team_id, "division": division, "conference": conference}
        )
    conn.commit()
    print(f"  {len(DIVISION_ROWS)} division rows inserted.")


def insert_markets(conn):  # inserts markets into the markets table by reading from a CSV file and matching with hardcoded market data
    print("Loading markets from CSV...")
    df = pd.read_csv(
        VIEWERSHIP_CSV,
        usecols=['Market', 'Market_abrev', 'abrev'],
        low_memory=False
    )  # read the CSV file and select only the relevant columns

    unique_markets = (
        df[['Market', 'Market_abrev', 'abrev']]
        .drop_duplicates(subset='Market')
        .reset_index(drop=True)
    )  # get unique markets based on the 'Market' column

    market_lookup = {row[0]: row for row in MARKET_ROWS}  # create a lookup dictionary for market abbreviations to their corresponding data

    print(f"Inserting {len(unique_markets)} markets...")
    for _, row in unique_markets.iterrows():  # iterate over each unique market row
        abrev = row['Market_abrev']  # get the market abbreviation from the CSV row
        if pd.isna(abrev) or str(abrev).strip() == '':  # if the abbreviation is missing or empty, derive it from the market name
            abrev = derive_market_abrev(row['Market'])
        abrev = str(abrev).strip()

        if abrev not in market_lookup:  # if the abbreviation is not found in the hardcoded market data, raise an error
            raise ValueError(
                f"Market abbreviation '{abrev}' (from Market='{row['Market']}') "
                f"not found in MARKET_ROWS. Add it to the hardcoded list."
            )

        _, market_name, tv_code, tz_offset = market_lookup[abrev]

        primary_team_id = None
        if tv_code is not None:  # if a tv_code is provided, look up the corresponding team_id from the teams table
            result = conn.execute(
                text("SELECT team_id FROM teams WHERE tv_code = :tv_code"),
                {"tv_code": tv_code}
            ).fetchone()  # fetch the team_id for the given tv_code
            if result is None:  
                raise ValueError(f"tv_code '{tv_code}' not found in teams table.")
            primary_team_id = result[0]

        conn.execute(
            text("""
                INSERT INTO markets (market_abrev, market_name, primary_team_id, timezone_offset)
                VALUES (:abrev, :name, :team_id, :tz)
            """),
            {
                "abrev": abrev,
                "name": row['Market'],
                "team_id": primary_team_id,
                "tz": tz_offset,
            }
        )  # insert the market data into the markets table

    conn.commit()  # commit the transaction to save all changes to the database
    print(f"  {len(unique_markets)} markets inserted.")

# --- Entry point -----------------------------------------------------------

def main():  # main function to handle command-line arguments and orchestrate the loading of reference data
    parser = argparse.ArgumentParser(
        description="One-time load of team_aliases, team_locations, and markets."
    )  # create an argument parser for command-line options
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing reference data and reload from scratch.",
    )  # add a --force argument to allow deletion of existing reference data
    args = parser.parse_args()  # parse the command-line arguments

    engine = get_engine()  # get a SQLAlchemy engine for database connection

    with engine.connect() as conn:  # establish a connection to the database
        if not preflight_check(conn, args.force):  # perform a preflight check to see if we should proceed with loading reference data
            return
        insert_team_aliases(conn)    # insert team aliases into the database
        insert_team_locations(conn)  # insert team locations into the database
        insert_markets(conn)         # insert markets into the database
        insert_divisions(conn)       # insert divisions into the database

    print("Reference data load complete.")


if __name__ == "__main__": 
    main()
