-- NFL Games (one row per game)
CREATE TABLE games (
    game_id     INT     AUTO_INCREMENT PRIMARY KEY,
    season      INT     NOT NULL,
    week        INT     NOT NULL,
    game_date   DATE    NOT NULL,
    day         VARCHAR(10),
    home_team_id    INT  NOT NULL,
    away_team_id    INT  NOT NULL,
    home_score      INT,
    away_score      INT,
    FOREIGN KEY (home_team_id) REFERENCES teams(team_id),
    FOREIGN KEY (away_team_id) REFERENCES teams(team_id),
    UNIQUE(season, week, home_team_id, away_team_id)
);

-- Sunday afternoon viewership
CREATE TABLE viewership (
    viewership_id     INT     AUTO_INCREMENT PRIMARY KEY,
    season      INT     NOT NULL,
    week        INT     NOT NULL,
    game_date   DATE    NOT NULL,
    day         VARCHAR(10),
    home_team_id    INT     NOT NULL,
    away_team_id    INT     NOT NULL,
    market_id    INT     NOT NULL,
    network  VARCHAR(20),
    title        VARCHAR(100),
    call_letters    VARCHAR(20),
    episode_title   VARCHAR(50),
    broadcast_window   VARCHAR(50),
    start_time           VARCHAR(20),
    end_time             VARCHAR(20),
    hhldaa_000      DECIMAL(10,2),
    share           DECIMAL(10,2),
    rating           DECIMAL(10,2),
    duration        INT,
    universe        INT,
    FOREIGN KEY (home_team_id) REFERENCES teams(team_id),
    FOREIGN KEY (away_team_id) REFERENCES teams(team_id),
    FOREIGN KEY (market_id) REFERENCES markets(market_id),
    UNIQUE(season, week, home_team_id, away_team_id, market_id)
);

-- Preseason Odds
CREATE TABLE preseason_odds (
    odds_id     INT     AUTO_INCREMENT PRIMARY KEY,
    team_id     INT     NOT NULL,
    season      INT     NOT NULL,
    playoff_make_odds   DECIMAL(8,2),
    playoff_make_prob   DECIMAL(6,4),
    playoff_miss_odds   DECIMAL(8,2),
    playoff_miss_prob   DECIMAL(6,4),
    win_total           DECIMAL(4,1),
    division_odds       DECIMAL(8,2),
    division_prob       DECIMAL(6,4),
    conference_odds       DECIMAL(8,2),
    conference_prob       DECIMAL(6,4),
    superbowl_odds       DECIMAL(8,2),
    superbowl_prob       DECIMAL(6,4),
    FOREIGN KEY (team_id) REFERENCES teams(team_id),
    UNIQUE(team_id, season)
);

-- Prime Time Games
CREATE TABLE prime_viewership (
    primetime_id     INT     AUTO_INCREMENT PRIMARY KEY,
    season      INT     NOT NULL,
    week        INT     NOT NULL,
    telecast_date   DATE    NOT NULL,
    day         VARCHAR(10),
    home_team_id    INT     NOT NULL,
    away_team_id    INT     NOT NULL,
    network  VARCHAR(20),
    program     VARCHAR(100),
    episode   VARCHAR(200),
    broadcast_window   VARCHAR(50),
    start_time           VARCHAR(20),
    end_time             VARCHAR(20),
    hhld_aa          INT,
    hhld_aa_rating   DECIMAL(6,2),
    hhld_share      DECIMAL(6,2),
    p2_aa_rating    DECIMAL(6,2),
    p2_aa           INT,
    p2_share        DECIMAL(6,2),
    duration        INT,
    FOREIGN KEY (home_team_id) REFERENCES teams(team_id),
    FOREIGN KEY (away_team_id) REFERENCES teams(team_id),
    UNIQUE(season, home_team_id, away_team_id)
);

-- Playoff Matchups
CREATE TABLE playoff_matchups (
    playoff_id   INT     AUTO_INCREMENT PRIMARY KEY,
    season       INT    NOT NULL,
    home_team_id    INT     NOT NULL,
    away_team_id    INT     NOT NULL,
    playoff_date    DATE,
    timeofday       VARCHAR(20),
    game_type       VARCHAR(50),
    conference      VARCHAR(20),
    spread          DECIMAL(3,1),
    over_under      DECIMAL(3,1),
    winner_id       INT,
    score           VARCHAR(20),
    FOREIGN KEY (home_team_id) REFERENCES teams(team_id),
    FOREIGN KEY (away_team_id) REFERENCES teams(team_id),
    FOREIGN KEY (winner_id) REFERENCES teams(team_id),
    UNIQUE(season, home_team_id, away_team_id)
);