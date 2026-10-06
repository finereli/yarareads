// Checks every story against Yara's inventory. Any word she can't decode
// (and that isn't a tricky word or a name) fails the check.
// Usage: node tools/check.mjs [story.json ...]
import { readFileSync } from 'node:fs';
import { compile, storyFiles, inventory, isHomeBook } from './build.mjs';
import { classify } from '../public/phonics.js';

const files = process.argv.length > 2 ? process.argv.slice(2) : storyFiles();
let failed = false;
for (const file of files) {
  const { story, unknown, count } = compile(JSON.parse(readFileSync(file, 'utf8')));
  const tricky = Object.keys(story.words).filter((w) => classify(w, inventory).kind === 'tricky').length;
  if (isHomeBook(story)) {
    const known = count - [...unknown.values()].reduce((s, p) => s + p.length, 0);
    console.log(`book ${story.id}  "${story.title}"  ${count} words, she can read ${Math.round((100 * known) / count)}%`);
    console.log(`       not yet: ${[...unknown.keys()].join(', ')}`);
    continue;
  }
  console.log(`${unknown.size ? 'FAIL' : 'ok  '} ${story.id}  "${story.title}"  ${count} words, ${tricky} distinct tricky`);
  for (const [w, pages] of unknown) console.log(`       ✗ ${w} (page ${pages.join(', ')})`);
  if (unknown.size) failed = true;
}
process.exit(failed ? 1 : 0);
