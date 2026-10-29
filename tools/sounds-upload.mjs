// Uploads the recorded sounds in content/sounds/recorded/<who>/ (and their words/, and the little words in say/) to R2, e.g. into the local R2
// that `wrangler dev` uses, so sounding out works locally.
// Usage: node tools/sounds-upload.mjs [who] [--local]
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const who = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'eli';
const where = process.argv.includes('--local') ? '--local' : '--remote';
const dir = join(new URL('..', import.meta.url).pathname, 'content/sounds/recorded', who);
const sub = (d) => (existsSync(join(dir, d)) ? readdirSync(join(dir, d)).filter((f) => f.endsWith('.mp3')).map((f) => `${d}/${f}`) : []);
const files = [...readdirSync(dir).filter((f) => f.endsWith('.mp3')), ...sub('words'), ...sub('say')]; // say/: the little words
const put = (f) => promisify(execFile)('npx', ['wrangler', 'r2', 'object', 'put', `yara-reads-pictures/sounds/recorded/${who}/${f}`,
  where, '--file', join(dir, f), '--content-type', 'audio/mpeg']);
// local R2 is one SQLite file: one at a time there
const batch = where === '--local' ? 1 : 8;
for (let i = 0; i < files.length; i += batch) await Promise.all(files.slice(i, i + batch).map(put));
console.log(`uploaded ${files.length} recordings (${where})`);
