"""Reusable data preparation utilities for NFL TV ratings modeling."""
import numpy as np
import pandas as pd


## helper function used during feature engineering
def isdivision(matchup):
    divisions = {
        'AFC North': ['BENGL', 'STLRS', 'BRWNS', 'RAVEN'],
        'AFC South': ['TITAN', 'COLTS', 'TEXAN', 'JAGRS'],
        'AFC East':  ['BILLS', 'PATS',  'DLPHN', 'JETS'],
        'AFC West':  ['CHIEF', 'RAIDR', 'CHRGR', 'BRNCO'],
        'NFC North': ['PCKRS', 'VIKNG', 'BEARS', 'LIONS'],
        'NFC South': ['BUCS',  'SAINT', 'FALCN', 'PNTHR'],
        'NFC East':  ['COWBY', 'EAGLE', 'CMNDR', 'GIANT'],
        'NFC West':  ['RAMS',  '49RS',  'CARDS', 'SEAHK']
    }

    def find_div(team):
        for div, tms in divisions.items():
            if team in tms:
                return div
        return None

    if isinstance(matchup, str):
        div = find_div(matchup)
        if not div:
            raise ValueError(f"Team '{matchup}' not found.")
        return div, 1, divisions[div]

    elif isinstance(matchup, list) and len(matchup) == 2:
        d1, d2 = find_div(matchup[0]), find_div(matchup[1])
        yn = 1 if d1 == d2 else 0
        return (d1 if yn else f'{d1}, {d2}'), yn, divisions.get(d1, 0)

    raise ValueError('Provide a str or list of two team names.')


# helper function used for categorical encoding, necessary for proper handling of categorical features in neural networks
# used in the next jupyter cell
def encode_categorical(df, col):
    """
    Integer-encode a categorical column and insert the result immediately
    to the right of the original column in the dataframe.

    Encoding is consistent: the same category always maps to the same integer
    (pd.factorize sorts by first appearance; apply to the full dataframe before
    any train/val split so codes are stable across both sets).

    Parameters
    ----------
    df  : pd.DataFrame  (modified in place)
    col : str           name of the column to encode

    Returns
    -------
    df      : pd.DataFrame  with the new '{col}_code' column inserted
    mapping : dict          {integer_code: original_category_value}
                            use this to interpret embedding rows later
    """
    codes, uniques = pd.factorize(df[col])
    mapping = {i: val for i, val in enumerate(uniques)}

    insert_pos = df.columns.get_loc(col) + 1
    df.insert(insert_pos, f'{col}_code', codes)

    return df, mapping


def build_normalized_market_draw(df, target_col):
    # Normalized market draw: home/away team's prior-year market avg relative to that market's baseline
    # Leak-free: season shift ensures only prior-year data is used
    market_season_avg = (
        df.groupby(['Market_abrev', 'Season'])[target_col]
          .mean().reset_index()
          .rename(columns={target_col: 'market_avg_rating'})
    )
    market_season_avg['Season'] += 1  # shift: row for Season S gives prior-year avg for Season S+1

    df = df.merge(market_season_avg, on=['Market_abrev', 'Season'], how='left')
    df['normalized_ht_market_draw'] = df['prev_market_ht_year_avg'] / df['market_avg_rating']
    df['normalized_at_market_draw'] = df['prev_market_at_year_avg'] / df['market_avg_rating']

    print("normalized_ht_market_draw:")
    print(df['normalized_ht_market_draw'].describe())
    print(f"NaN count: {df['normalized_ht_market_draw'].isna().sum()} (expected for Season 1 and pre-2014 rows)")

    return df


def build_concurrent_features(df):
    game_cols = ['Season', 'week', 'timeofday', 'at', 'ht', 'sumwins_m_difwins']

    # collapse dataset on market dimension (raw df has one row per game x market combination)
    unique_games = df[game_cols].drop_duplicates(subset=['Season', 'week', 'timeofday', 'at', 'ht'])

    # slot totals - one row per broadcast slot. collapse unique_games by season, week, timeofday and aggregate statistics for that slot
    slot = unique_games.groupby(['Season', 'week', 'timeofday']).agg(
        slot_total  = ('sumwins_m_difwins', 'sum'),
        slot_count  = ('sumwins_m_difwins', 'count'),
        slot_above19= ('sumwins_m_difwins', lambda x: (x > 19).sum())
    ).reset_index()

    # join slot back onto unique_games on the keys that identify the slot, so that there is one row per game again, but now with the slot-level aggregate columns appended
    g = unique_games.merge(slot, on=['Season', 'week', 'timeofday'])

    # subtract own team's contribution to concurrent statistics
    g['total_concurrent_popularity'] = g['slot_total'] - g['sumwins_m_difwins']
    g['concurrent_count'] = g['slot_count'] - 1
    g['average_concurrent_popularity'] = np.where(
        g['total_concurrent_popularity'] == 0, 0,
        g['total_concurrent_popularity'] / g['concurrent_count'].clip(lower=1)
    )
    # above_19_flag: are any *other* games > 19?
    own_above = (g['sumwins_m_difwins'] > 19).astype(int)
    g['above_19_flag'] = ((g['slot_above19'] - own_above) > 0).astype(int)

    # merge back, every market row for same game gets the same values
    df = df.merge(
        g[['Season','week','timeofday','at','ht',
           'total_concurrent_popularity','concurrent_count',
           'average_concurrent_popularity','above_19_flag']],
        on=['Season','week','timeofday','at','ht'], how='left'
    )

    # reposition after the merge
    for col in ['total_concurrent_popularity', 'concurrent_count',
                'average_concurrent_popularity', 'above_19_flag']:
        series = df.pop(col)
        insert_pos = df.columns.get_loc('div_matchup') + 1
        df.insert(insert_pos, col, series)

    return df
