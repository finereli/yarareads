// Pushes all stories to D1. Refuses if any story has words Yara can't read.
// The inventory lives in D1 (edited in the app); pass --inventory to overwrite it from
// content/inventory.json. Run `node tools/pull.mjs` first so you check against the live one.
// Usage: node tools/push.mjs [--local] [--inventory]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compile, storyFiles, inventory } from './build.mjs';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = [];
if (process.argv.includes('--inventory')) {
  const { _note, ...inv } = inventory;
  sql.push(`INSERT OR REPLACE INTO inventory (id, body, updated_at) VALUES (1, ${q(JSON.stringify(inv))}, CURRENT_TIMESTAMP);`);
}
let stories = 0;
for (const file of storyFiles()) {
  const { story, unknown } = compile(JSON.parse(readFileSync(file, 'utf8')));
  if (unknown.size) {
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
console.log(`pushed ${stories} stories${process.argv.includes('--inventory') ? ' + inventory' : ''} (${where})`);
