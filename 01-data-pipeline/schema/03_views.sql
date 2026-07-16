-- v_games
CREATE VIEW v_games AS
	SELECT
		g.game_id,
		g.season,
		g.week,
		g.game_date,
		g.day,
		home.abbreviation as home_team,
		away.abbreviation as away_team,
		g.home_score,
		g.away_score
	FROM games g
	JOIN teams home ON g.home_team_id = home.team_id
	JOIN teams away ON g.away_team_id = away.team_id

-- v_viewership
CREATE VIEW v_viewership AS
	SELECT
		v.viewership_id,
		v.season,
		v.week,
		v.game_date,
		v.network,
		v.broadcast_window,
		home.abbreviation as home_team,
		away.abbreviation as away_team,
		m.market_abrev,
		v.start_time,
		v.end_time,
		v.hhldaa_000,
		v.rating,
		v.share
	FROM viewership v
	JOIN teams home ON v.home_team_id = home.team_id
	JOIN teams away ON v.away_team_id = away.team_id
	JOIN markets m ON v.market_id = m.market_id

-- v_preseason_odds
CREATE VIEW v_preseason_odds AS
	SELECT
		po.odds_id,
		po.season,
		t.abbreviation,
        t.city,
        t.mascot,
		po.win_total,
		po.playoff_make_prob,
		po.playoff_miss_prob,
		po.division_prob,
		po.conference_prob,
		po.superbowl_prob
	FROM preseason_odds po
	JOIN teams t ON po.team_id = t.team_id

-- v_prime_viewership
CREATE VIEW v_prime_viewership AS
	SELECT
		pv.primetime_id,
		pv.season,
		pv.week,
		pv.telecast_date,
        pv.day,
		pv.network,
        pv.broadcast_window,
		away.abbreviation as away_team,
		home.abbreviation as home_team,
        pv.hhld_aa,
        pv.hhld_aa_rating,
        pv.hhld_share,
        pv.p2_aa,
        pv.p2_aa_rating,
        pv.p2_share,
		pv.start_time,
		pv.end_time,
		pv.duration
	FROM prime_viewership pv
	JOIN teams home ON pv.home_team_id = home.team_id
	JOIN teams away ON pv.away_team_id = away.team_id

-- v_playoff_matchups
CREATE VIEW v_playoff_matchups AS
	SELECT
		pm.playoff_id,
		pm.season,
		pm.playoff_date,
        pm.timeofday,
		pm.game_type,
        pm.conference,
		away.abbreviation as away_team,
		home.abbreviation as home_team,
        winner.abbreviation as winner
	FROM playoff_matchups pm
	JOIN teams home ON pm.home_team_id = home.team_id
	JOIN teams away ON pm.away_team_id = away.team_id
    LEFT JOIN teams winner ON pm.winner_id = winner.team_id

