import fs from 'fs';
import path from 'path';

export async function get(context) {
  // Read markdown posts from src/content/blog and DB posts, merge and return
  const mdDir = path.resolve('./src/content/blog');
  let mdPosts = [];
  try {
    const files = fs.readdirSync(mdDir).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
    mdPosts = files.map((file) => {
      const content = fs.readFileSync(path.join(mdDir, file), 'utf-8');
      // naive frontmatter extraction can be improved; for MVP return filename and content
      return { id: `md-${file}`, source: 'markdown', filename: file, content };
    });
  } catch (e) {
    mdPosts = [];
  }

  const dbRows = await context.env.DB.prepare('SELECT p.*, u.name FROM posts p JOIN users u ON p.user_id = u.id ORDER BY created_at DESC LIMIT 50').bind().all();
  const dbPosts = dbRows.results || [];

  // merge: recent DB posts first, then markdown
  const merged = dbPosts.concat(mdPosts);
  return new Response(JSON.stringify({ posts: merged }), { status: 200 });
}
