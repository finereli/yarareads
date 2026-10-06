// Re-saves page pictures at web quality (see webJpeg in illustrate.mjs). Safe to re-run: skips files
// already small. Usage: node tools/shrink.mjs [dir ...]   (default: content/pictures)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['content/pictures'];
const files = dirs.flatMap(function walk(d) {
  return readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.jpg') ? [join(d, f)] : []));
});
let before = 0, after = 0;
for (const f of files) {
  const buf = readFileSync(f);
  before += buf.length;
  if (buf.length < 150 * 1024) { after += buf.length; continue; }
  const out = await sharp(buf).jpeg({ quality: 80, progressive: true, mozjpeg: true }).toBuffer();
  writeFileSync(f, out);
  after += out.length;
}
console.log(`${files.length} pictures: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
