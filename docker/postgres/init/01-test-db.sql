-- Runs once, when the volume is first created.
-- A separate database for `npm test`, so tests never touch dev data.
CREATE DATABASE gamesmith_test OWNER gamesmith;
