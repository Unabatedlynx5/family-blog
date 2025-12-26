import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

const DB_PATH = process.env.D1_DB_PATH || './dev.db';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('Usage: node scripts/seed_admin.js email password');
    process.exit(1);
  }

  // This script is for local seeding only; in production create user via admin tooling against D1.
  const db = new Database(DB_PATH);
  const hash = bcrypt.hashSync(password, 10);
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at, created_by_admin) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, email, hash, 'Admin', 1, now, 1);
  console.log('✅ Admin user created:', email);
  console.log('📧 Email:', email);
  console.log('🔑 Password:', password);
  console.log('');
  console.log('You can now login at http://localhost:4321/login');
  db.close();
}

main();
