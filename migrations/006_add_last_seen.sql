-- Add last_seen timestamp to users for presence indicators
ALTER TABLE users ADD COLUMN last_seen INTEGER;
