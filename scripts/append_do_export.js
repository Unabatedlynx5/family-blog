import fs from 'fs';
import path from 'path';

const filePath = path.resolve('./dist/_worker.js/index.js');
const exportLine = "\n// Export Durable Object class so Wrangler can register it\nexport { GlobalChat } from '../../workers/GlobalChat.js';\n";

try {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes("export { GlobalChat }")) {
    content = content + exportLine;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Appended DO export to', filePath);
  } else {
    console.log('DO export already present');
  }
} catch (err) {
  console.error('Failed to append DO export:', err.message);
  process.exit(1);
}
