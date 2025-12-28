-- Add role column to users table
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';

-- Set the initial admin user (update this email if your admin email is different)
UPDATE users SET role = 'admin' WHERE email = 'admin@familyblog.com';
