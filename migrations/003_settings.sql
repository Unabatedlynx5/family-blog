CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  theme TEXT DEFAULT 'light',
  notifications_enabled INTEGER DEFAULT 1,
  language TEXT DEFAULT 'en',
  updated_at INTEGER
);
