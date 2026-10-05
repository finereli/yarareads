// Pushes the inventory and all stories to D1. Refuses if any story has words Yara can't read.
// Usage: node tools/push.mjs [--local]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compile, storyFiles, inventory } from './build.mjs';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = [
  `INSERT OR REPLACE INTO inventory (id, body, updated_at) VALUES (1, ${q(JSON.stringify(inventory))}, CURRENT_TIMESTAMP);`,
];
for (const file of storyFiles()) {
  const { story, unknown } = compile(JSON.parse(readFileSync(file, 'utf8')));
  if (unknown.size) {
    console.error(`${story.id}: unreadable words: ${[...unknown.keys()].join(', ')}`);
    process.exit(1);
  }
  sql.push(
    `INSERT OR REPLACE INTO stories (id, series, number, title, body, updated_at) VALUES (${q(story.id)}, ${q(story.series)}, ${story.number}, ${q(story.title)}, ${q(JSON.stringify(story))}, CURRENT_TIMESTAMP);`,
  );
}
mkdirSync('.build', { recursive: true });
writeFileSync('.build/push.sql', sql.join('\n'));
const where = process.argv.includes('--local') ? '--local' : '--remote';
execFileSync('npx', ['wrangler', 'd1', 'execute', 'yara-reads', where, '--file', '.build/push.sql'], { stdio: 'inherit' });
console.log(`pushed inventory + ${sql.length - 1} stories (${where})`);
