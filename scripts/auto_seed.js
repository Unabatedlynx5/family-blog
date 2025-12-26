import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const EMAIL = 'test@user.com';
const PASSWORD = 'qwertyuiop';
const NAME = 'Test User';

async function seed() {
  try {
    console.log(`Checking/Seeding local admin user (${EMAIL})...`);
    
    // Check if user exists to avoid re-hashing and re-running wrangler every time if not needed
    // This makes startup faster after the first time
    const checkCmd = `npx wrangler d1 execute family_blog_db --local --command "SELECT count(*) as count FROM users WHERE email='${EMAIL}'" --json`;
    const output = execSync(checkCmd, { encoding: 'utf-8' });
    const result = JSON.parse(output);
    
    if (result[0] && result[0].results && result[0].results[0].count > 0) {
      console.log('Admin user already exists.');
      return;
    }

    const hash = bcrypt.hashSync(PASSWORD, 10);
    // Escape $ so the shell won't expand bcrypt hash when we pass the SQL
    const safeHash = hash.replace(/\$/g, '\\\$');
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    const sql = `INSERT INTO users (id, email, password_hash, name, is_active, created_at, created_by_admin) VALUES ('${id}', '${EMAIL}', '${safeHash}', '${NAME}', 1, ${now}, 1);`;
    
    execSync(`npx wrangler d1 execute family_blog_db --local --command "${sql}"`, { stdio: 'inherit' });
    console.log('Admin user created successfully.');
    
  } catch (e) {
    console.error('Seeding warning:', e.message);
    // We don't exit with error because we want the dev server to start anyway
  }
}

seed();
