-- Migration: Change post likes to JSON array
ALTER TABLE posts ADD COLUMN likes TEXT DEFAULT '[]';
-- We will ignore the old like_count column or drop it if supported.
-- D1 supports DROP COLUMN.
ALTER TABLE posts DROP COLUMN like_count;
