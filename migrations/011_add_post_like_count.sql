-- Migration: Add like_count to posts table
ALTER TABLE posts ADD COLUMN like_count INTEGER DEFAULT 0;
