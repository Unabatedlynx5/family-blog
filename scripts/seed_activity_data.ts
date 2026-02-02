import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

// Configuration
const DB_NAME = 'family_blog_db';

async function seed() {
  try {
    console.log('Fetching admin user...');
    const userRes = JSON.parse(execSync(`npx wrangler d1 execute ${DB_NAME} --local --command "SELECT id FROM users LIMIT 1" --json`, { encoding: 'utf-8' }));
    const userId = userRes[0]?.results[0]?.id;

    if (!userId) {
      console.error('No users found. Run npm run seed:admin first.');
      process.exit(1);
    }

    console.log(`Seeding activity for user ${userId}...`);

    const now = Math.floor(Date.now() / 1000);
    const event1Id = randomUUID();
    const event2Id = randomUUID();

    // Event 1: 3 Landscape, 2 Portrait
    // Event 2: 4 Portrait

    const queries = [
        `INSERT INTO upload_events (id, user_id, created_at) VALUES ('${event1Id}', '${userId}', ${now - 3600});`,
        `INSERT INTO upload_events (id, user_id, created_at) VALUES ('${event2Id}', '${userId}', ${now - 7200});`,
        
        // Photos for Event 1
        `INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES ('${randomUUID()}', '${event1Id}', '${userId}', 'mock/l1.jpg', 800, 600, ${now - 3600});`,
        `INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES ('${randomUUID()}', '${event1Id}', '${userId}', 'mock/l2.jpg', 800, 600, ${now - 3600});`,
        `INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES ('${randomUUID()}', '${event1Id}', '${userId}', 'mock/l3.jpg', 800, 600, ${now - 3600});`,
        `INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES ('${randomUUID()}', '${event1Id}', '${userId}', 'mock/p1.jpg', 600, 800, ${now - 3600});`,
        `INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES ('${randomUUID()}', '${event1Id}', '${userId}', 'mock/p2.jpg', 600, 800, ${now - 3600});`,

        // Photos for Event 2
        `INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES ('${randomUUID()}', '${event2Id}', '${userId}', 'mock/p3.jpg', 600, 800, ${now - 7200});`,
        `INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES ('${randomUUID()}', '${event2Id}', '${userId}', 'mock/p4.jpg', 600, 800, ${now - 7200});`,
        `INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES ('${randomUUID()}', '${event2Id}', '${userId}', 'mock/p5.jpg', 600, 800, ${now - 7200});`,
        `INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES ('${randomUUID()}', '${event2Id}', '${userId}', 'mock/p6.jpg', 600, 800, ${now - 7200});`,
    ];

    for (const query of queries) {
        execSync(`npx wrangler d1 execute ${DB_NAME} --local --command "${query}"`);
    }

    console.log('Seeding complete. Note: Images are mock records and will not load in browser unless R2 objects exist.');
    console.log('To test with real images, use the "Upload Photos" button on the Activity page.');

  } catch (err) {
    console.error('Seeding failed:', err);
  }
}

seed();
