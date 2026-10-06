// Pushes all stories to D1, and their page images to R2. Refuses if one of our stories has words
// Yara can't read (books from home are exempt: they're what they are).
// The inventory lives in D1 (edited in the app); pass --inventory to overwrite it from
// content/inventory.json. Run `node tools/pull.mjs` first so you check against the live one.
// Usage: node tools/push.mjs [--local] [--inventory] [--images]   (--images uploads page pictures to R2)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compile, storyFiles, inventory, isHomeBook, imageFile } from './build.mjs';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = [];
if (process.argv.includes('--inventory')) {
  const { _note, ...inv } = inventory;
  sql.push(`INSERT OR REPLACE INTO inventory (id, body, updated_at) VALUES (1, ${q(JSON.stringify(inv))}, CURRENT_TIMESTAMP);`);
}
let stories = 0;
const images = new Set();
for (const file of storyFiles()) {
  const { story, unknown } = compile(JSON.parse(readFileSync(file, 'utf8')));
  for (const key of [story.coverImage, ...story.pages.map((p) => p.image)].filter(Boolean)) {
    if (!imageFile(key)) throw new Error(`${story.id}: missing image ${key}`);
    images.add(key);
  }
  if (unknown.size && !isHomeBook(story)) {
    console.error(`${story.id}: unreadable words: ${[...unknown.keys()].join(', ')}`);
    process.exit(1);
  }
  stories++;
  sql.push(
    `INSERT OR REPLACE INTO stories (id, series, number, title, body, updated_at) VALUES (${q(story.id)}, ${q(story.series)}, ${story.number}, ${q(story.title)}, ${q(JSON.stringify(story))}, CURRENT_TIMESTAMP);`,
  );
}
mkdirSync('.build', { recursive: true });
writeFileSync('.build/push.sql', sql.join('\n'));
const where = process.argv.includes('--local') ? '--local' : '--remote';
execFileSync('npx', ['wrangler', 'd1', 'execute', 'yara-reads', where, '--file', '.build/push.sql'], { stdio: 'inherit' });
if (process.argv.includes('--images')) {
  for (const key of images) {
    execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `yara-reads-pictures/${key}`, where,
      '--file', imageFile(key), '--content-type', 'image/jpeg'], { stdio: 'ignore' });
    console.log(`uploaded ${key}`);
  }
}
console.log(`pushed ${stories} stories${process.argv.includes('--inventory') ? ' + inventory' : ''} (${where})`);
