-- Add indexes for security and performance

-- Index for token lookups (prevents timing attacks)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash 
ON refresh_tokens(token_hash) 
WHERE revoked = 0;

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email) 
WHERE is_active = 1;

-- Index for password reset tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens 
ON password_reset_tokens(token_hash) 
WHERE used = 0;

-- Index for media by uploader
CREATE INDEX IF NOT EXISTS idx_media_uploader 
ON media(uploader_id, created_at DESC);

-- Index for posts by user
CREATE INDEX IF NOT EXISTS idx_posts_user 
ON posts(user_id, created_at DESC);

-- Index for chat messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_created 
ON chat_messages(created_at DESC);
