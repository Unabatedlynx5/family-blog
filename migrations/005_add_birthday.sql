-- D1 migration: add birthday to users
ALTER TABLE users ADD COLUMN birthday TEXT;
