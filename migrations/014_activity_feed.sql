CREATE TABLE upload_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE photos (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_photos_event_id ON photos(event_id);
CREATE INDEX idx_upload_events_created_at ON upload_events(created_at DESC);
