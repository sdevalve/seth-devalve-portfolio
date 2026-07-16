-- Create the database.
-- IF NOT EXISTS makes this safe to re-run, no error if it already exists.
-- utf8mb4 is the correct character set for modern MySQL (supports all Unicode).
-- The collation controls how string comparisons work; unicode_ci is case-insensitive.
CREATE DATABASE IF NOT EXISTS nfl_pipeline
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Create a dedicated user for this project instead of using root.
-- 'localhost' means this user can only connect from the same machine.
-- Replace 'your_password' with something real.
CREATE USER IF NOT EXISTS 'seth'@'localhost' IDENTIFIED BY '-------';

-- Grant all privileges on every table in nfl_pipeline to this user.
-- The '.*' means 'all tables within this database'.
GRANT ALL PRIVILEGES ON nfl_pipeline.* TO 'seth'@'localhost';

-- Tell MySQL to reload its privilege cache so the GRANT takes effect immediately.
FLUSH PRIVILEGES;

-- Set nfl_pipeline as the active database for all subsequent commands.
USE nfl_pipeline;
