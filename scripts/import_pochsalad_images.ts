import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USAGE = 'Usage: npx tsx scripts/import_pochsalad_images.ts <email> <password> <base_url>';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const baseUrl = process.argv[4] || 'http://localhost:4321';

  if (!email || !password) {
    console.error(USAGE);
    process.exit(1);
  }

  console.log(`🔌 Connecting to ${baseUrl}...`);

  // 1. Login
  console.log('🔑 Logging in...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  if (!loginRes.ok) {
    console.error('❌ Login failed:', await loginRes.text());
    process.exit(1);
  }

  const { accessToken } = (await loginRes.json()) as any;
  console.log('✅ Login successful!');

  // 2. Scan Directory
  const dir = path.join(__dirname, '../src/content/Pochsalad');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg'));
  console.log(`📂 Found ${files.length} files to process.`);

  for (const filename of files) {
    // Parser logic: PochsaladSourceDec21_25.jpg
    const datePart = filename.replace('PochsaladSource', '').replace('.jpg', '');
    const match = datePart.match(/([A-Za-z]+)(\d+)_(\d+)/);
    
    if (!match) {
      console.warn(`⚠️ Skipping ${filename} (invalid name format)`);
      continue;
    }

    const [_, monthStr, dayStr, yearStr] = match;
    // Assume year is 20xx
    const year = parseInt(`20${yearStr}`);
    const day = parseInt(dayStr);
    // Parse month
    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    const month = months[monthStr];
    
    if (month === undefined) {
      console.warn(`⚠️ Skipping ${filename} (unknown month: ${monthStr})`);
      continue;
    }

    const date = new Date(year, month, day);
    const contentDate = Math.floor(date.getTime() / 1000);
    
    console.log(`📤 Uploading ${filename} (${date.toDateString()})...`);

    const filePath = path.join(dir, filename);
    const fileData = fs.readFileSync(filePath);
    const blob = new Blob([fileData], { type: 'image/jpeg' });
    
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('category', 'pochsalad');
    formData.append('content_date', String(contentDate));

    const uploadRes = await fetch(`${baseUrl}/api/media/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: formData
    });

    if (uploadRes.ok) {
      console.log(`✅ Uploaded ${filename}`);
    } else {
      console.error(`❌ Failed to upload ${filename}:`, await uploadRes.text());
    }
  }
  
  console.log('🎉 Done!');
}

main();
