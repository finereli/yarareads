// Stamps the build: public/version.json, which the installed app polls to know an update is out.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() ? '+' : '';
const built = new Date().toISOString();
const version = `${built.slice(0, 16).replace(/[-:T]/g, '')}-${sha}${dirty}`;
writeFileSync('public/version.json', JSON.stringify({ version, built }) + '\n');
console.log('version', version);
