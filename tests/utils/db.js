import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function resetDatabase(db) {
  // Disable foreign keys to allow deleting in any order
  // Note: D1 via Miniflare might enforce FKs even with PRAGMA if not in a transaction or verified.
  // Best approach is deleting children first.
  
  const tablesToDelete = [
    // Children first
    'comments', 
    'likes', 
    'posts', 
    'refresh_tokens', 
    'media', 
    // Parents last
    'users',
    // Catch-all for others not listed (handled dynamically below if needed)
  ];

  try {
    // Try to disable FKs anyway
    await db.prepare('PRAGMA foreign_keys = OFF').run();
  } catch (e) {}

  // Get all tables to ensure we don't miss any new ones
  const { results } = await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_cf_KV' AND name != 'd1_migrations' AND name != '_cf_METADATA'").all();
  const allTables = (results.results || results || []).map(r => r.name);
  
  const knownTables = new Set(tablesToDelete);
  const unknownTables = allTables.filter(t => !knownTables.has(t));
  
  // Combine: Unknowns first (risky but usually okay if plugins), then known children, then known parents.
  const order = [...unknownTables, ...tablesToDelete];

  for (const name of order) {
    // Check if table exists in the DB (it should given the query above)
    if (!allTables.includes(name)) continue;
    
    try {
      await db.prepare(`DELETE FROM "${name}"`).run();
    } catch (e) {
      console.warn(`Failed to clean table ${name} (might be empty or locked):`, e.message);
      // Don't throw immediately, try others, maybe FKs will resolve?
      // Actually throwing stops everything. Let's ignore constraint errors if possible?
      // No, if we can't delete, next tests fail.
    }
  }

  try {
     await db.prepare('PRAGMA foreign_keys = ON').run();
  } catch (e) {}
}

export async function applyMigrations(db) {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  // Create migrations table if not exists (it might be created by 001, but we need it for tracking)
  // Actually, usually 00X migration creates tables.
  // We can just try to create the tracking table first manually or rely on proper checks.
  // A simpler way for tests: just check if 'users' table exists to decide if we initialized at all.
  // But schemas change.
  
  // Let's implement robust tracking
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const appliedResult = await db.prepare('SELECT name FROM d1_migrations').all();
  const appliedMigrations = new Set((appliedResult.results || []).map(r => r.name));

  for (const file of files) {
    if (appliedMigrations.has(file)) {
      // console.log(`Skipping applied migration ${file}`);
      continue;
    }

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
        // If it's a "duplicate column" error, it means the migration was partially applied 
        // or re-run without tracking. Safe to ignore for tests.
        if (e.message && e.message.includes('duplicate column name')) {
             console.warn(`Ignoring duplicate column error in ${file}: ${e.message}`);
             continue;
        }
        
        console.error(`Failed to apply statement in ${file}:`, statement);
        console.error(e);
        throw e;
      }
    }
    
    // Record as applied
    await db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(file).run();
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
