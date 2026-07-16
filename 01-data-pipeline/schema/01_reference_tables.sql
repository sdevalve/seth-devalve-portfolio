CREATE TABLE teams (
    team_id         INT           AUTO_INCREMENT PRIMARY KEY,
    abbreviation    VARCHAR(4)    NOT NULL,
    city            VARCHAR(50)   NOT NULL,
    mascot          VARCHAR(50)   NOT NULL,
    tv_code         VARCHAR(10)   NOT NULL,
    UNIQUE (abbreviation),
    UNIQUE (mascot),
    UNIQUE (tv_code)
);

CREATE TABLE team_aliases (
    alias_id   INT            AUTO_INCREMENT PRIMARY KEY,
    team_id    INT            NOT NULL,
    alias      VARCHAR(100)   NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(team_id),
    UNIQUE (alias)
);

CREATE TABLE team_locations (
    location_id     INT             AUTO_INCREMENT PRIMARY KEY,
    team_id         INT             NOT NULL,
    season_from     INT             NOT NULL,
    season_to       INT,
    latitude        DECIMAL(9,6)    NOT NULL,
    longitude       DECIMAL(9,6)    NOT NULL,
    timezone_offset INT             NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(team_id),
    UNIQUE (team_id, season_from)
);

CREATE TABLE markets (
    market_id       INT             AUTO_INCREMENT PRIMARY KEY,
    market_abrev    VARCHAR(10)     NOT NULL,
    market_name     VARCHAR(100),
    primary_team_id INT,
    timezone_offset INT     NOT NULL    DEFAULT 0,
    FOREIGN KEY (primary_team_id) REFERENCES teams(team_id),
    UNIQUE(market_abrev)
);

CREATE TABLE divisions (
    division_id  INT          AUTO_INCREMENT PRIMARY KEY,
    team_id      INT          NOT NULL,
    division     VARCHAR(20)  NOT NULL,
    conference   VARCHAR(5)   NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(team_id),
    UNIQUE (team_id)
);

