-- Migration: Add likes table

CREATE TABLE IF NOT EXISTS likes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'comment', 'post', 'chat_message'
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, target_id, target_type)
);

CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_id, target_type);
