import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyMigrations(db) {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`Applying migration ${file}...`);
    
    // Workaround for Miniflare 3 / getPlatformProxy db.exec issue
    // Split statements by semicolon and execute individually
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      try {
        await db.prepare(statement).run();
      } catch (e) {
        console.error(`Failed to apply statement in ${file}:`, statement);
        console.error(e);
        throw e;
      }
    }
  }
}

export async function cleanDatabase(db) {
  // Disable foreign keys to allow deleting in any order
  // Note: PRAGMA foreign_keys = OFF might not work in all D1 environments, so we also try to order deletions.
  try {
    await db.prepare('PRAGMA foreign_keys = OFF').run();
  } catch (e) {
    // Ignore if PRAGMA fails
  }

  const { results } = await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_cf_KV' AND name != 'd1_migrations' AND name != '_cf_METADATA'").all();
  
  let tables = results.map(r => r.name);
  
  // Delete child tables first, parents last.
  // 'users' is the main parent.
  const usersIndex = tables.indexOf('users');
  if (usersIndex > -1) {
    tables.splice(usersIndex, 1);
    tables.push('users'); // Move users to the end
  }

  for (const name of tables) {
    try {
      await db.prepare(`DELETE FROM "${name}"`).run();
    } catch (e) {
      console.error(`Failed to clean table ${name}:`, e);
      throw e;
    }
  }

  try {
    await db.prepare('PRAGMA foreign_keys = ON').run();
  } catch (e) {
    // Ignore
  }
}
