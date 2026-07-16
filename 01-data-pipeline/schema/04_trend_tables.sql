-- year_market_tod_avg
CREATE TABLE year_market_tod_avg (
    season		INT 	NOT NULL,
    market_id	INT 	NOT NULL,
    timeofday   VARCHAR(20) NOT NULL,   
	avg_hhldaa_000 	DECIMAL(10,3),
    PRIMARY KEY (season, market_id, timeofday),
    FOREIGN KEY (market_id) REFERENCES markets(market_id)
);

INSERT INTO year_market_tod_avg (season, market_id, timeofday, avg_hhldaa_000)
SELECT 
    season, 
    market_id, 
	CASE
		WHEN east_coast_time < '12:00:00' THEN 'morning'
		WHEN east_coast_time < '15:00:00' THEN 'afternoon'
		WHEN east_coast_time < '18:00:00' THEN 'midafternoon'
		ELSE 'evening'
	END AS timeofday,
    AVG(hhldaa_000);


-- team_market_season_avg  
CREATE TABLE team_market_season_avg (
    season		INT 	NOT NULL,
    team_id		INT 	NOT NULL,
    market_id	INT 	NOT NULL,
	avg_hhldaa_000 	DECIMAL(10,3) 	NOT NULL,
    PRIMARY KEY (season, team_id, market_id),
	FOREIGN KEY (team_id) REFERENCES teams(team_id),
    FOREIGN KEY (market_id) REFERENCES markets(market_id)
);

INSERT INTO team_market_season_avg (season, team_id, market_id, avg_hhldaa_000)
SELECT season, team_id, market_id, AVG(hhldaa_000)
FROM (
	SELECT season, home_team_id AS team_id, market_id, hhldaa_000 FROM viewership
	UNION ALL
	SELECT season, away_team_id AS team_id, market_id, hhldaa_000 FROM viewership
) combined
GROUP BY season, team_id, market_id;