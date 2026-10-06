// How much real children's text Yara can read with her current inventory, and what's missing.
// Corpus: public-domain early readers from Project Gutenberg, downloaded to .build/corpus on first run.
// Usage: node tools/coverage.mjs [--top 40]
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { classify, tokenize, isWord, normalize } from '../public/phonics.js';
import { pronunciations } from './lexicon.mjs';
import { inventory as inv } from './build.mjs';

const BOOKS = {
  14640: "McGuffey's First Eclectic Reader", 14642: "McGuffey's Eclectic Primer",
  14838: 'The Tale of Peter Rabbit', 14407: 'The Tale of Benjamin Bunny', 14868: 'The Tailor of Gloucester',
  19994: 'The Aesop for Children', 15077: 'The Tale of Mr. Jeremy Fisher', 14220: 'The Tale of the Flopsy Bunnies',
  15661: 'The Golden Goose Book', 17089: 'The Tale of Mrs. Tittlemouse',
};
const dir = '.build/corpus';
mkdirSync(dir, { recursive: true });
for (const id of Object.keys(BOOKS)) {
  if (!existsSync(`${dir}/${id}.txt`)) {
    execFileSync('curl', ['-sL', '-m', '30', '-o', `${dir}/${id}.txt`, `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`]);
  }
}

const count = new Map(), books = new Map();
let total = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
  let t = readFileSync(`${dir}/${f}`, 'utf8');
  t = t.split(/\*\*\* ?START OF[^\n]*\n/)[1]?.split(/\*\*\* ?END OF/)[0] || t;
  t = t.replace(/\[Illustration[^\]]*\]/gi, ' ');
  const seen = new Set();
  for (const tok of tokenize(t).filter(isWord)) {
    const w = normalize(tok);
    total++;
    count.set(w, (count.get(w) || 0) + 1);
    seen.add(w);
  }
  for (const w of seen) books.set(w, (books.get(w) || 0) + 1);
}

const rows = [...count].map(([w, n]) => ({ w, n, b: books.get(w), kind: classify(w, inv, pronunciations(w)).kind }));
const pct = (n) => `${((100 * n) / total).toFixed(1)}%`;
const readable = rows.filter((r) => r.kind !== 'unknown').reduce((s, r) => s + r.n, 0);
console.log(`${Object.keys(BOOKS).length} books, ${total} words. Yara can read ${pct(readable)} of them.\n`);

// Why the rest is unreadable, by spelling pattern.
const unknown = rows.filter((r) => r.kind === 'unknown');
const CAUSES = [
  ['silent e she lacks, or irregular vowel + e (done, gone)', (w) => /[aeiou][bcdfgklmnprstvz]es?$/.test(w)],
  ['-ed endings (lived, jumped)', (w) => /ed$/.test(w)],
  ['y as "ee" or "igh" at the end (very, by)', (w) => /[^aeo]y$/.test(w)],
  ['doubled consonant before an ending (running)', (w) => /([bdgmnprt])\1(ing|er|y|ed)$/.test(w)],
  ['everything else', () => true],
];
const byCause = CAUSES.map(([label, test]) => {
  const words = unknown.filter((r) => test(r.w) && !r.claimed && (r.claimed = true));
  return [label, words.reduce((s, r) => s + r.n, 0)];
});
for (const [label, n] of byCause) console.log(`${pct(n).padStart(6)}  ${label}`);

// The most valuable single words: common, and in at least half the books (so not a character's name).
const top = Number(process.argv[process.argv.indexOf('--top') + 1]) || 40;
console.log(`\nMost common words she can't read yet (in 5+ of the books):`);
let cum = readable;
for (const r of unknown.filter((r) => r.b >= 5 && pronunciations(r.w).length).sort((a, b) => b.n - a.n).slice(0, top)) {
  cum += r.n;
  console.log(`  ${r.w.padEnd(10)} ${String(r.n).padStart(4)}  in ${r.b}/10   coverage -> ${pct(cum)}`);
}
