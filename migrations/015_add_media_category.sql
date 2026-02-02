ALTER TABLE media ADD COLUMN category TEXT DEFAULT 'general';
ALTER TABLE media ADD COLUMN content_date INTEGER;
CREATE INDEX idx_media_category ON media(category);
