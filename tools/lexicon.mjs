// Pronunciations from the CMU dictionary (data/cmudict.dict), keyed by lowercase word.
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
let dict;

// data/extra.dict adds names and British pronunciations, in the same format.
// Words in neither are built from their stem when possible: pecked = peck + T.
export function pronunciations(word) {
  if (!dict) {
    dict = new Map();
    const lines = ['data/cmudict.dict', 'data/extra.dict'].flatMap((f) => readFileSync(root + f, 'utf8').split('\n'));
    for (const line of lines) {
      if (line.startsWith(';;;')) continue;
      const [head, ...phones] = line.split('#')[0].trim().split(/\s+/);
      if (!head || !phones.length) continue;
      // Keep apostrophes in the key: "we're" (W IY R) must not merge into "were" (W ER).
      const w = head.replace(/\(\d+\)$/, '').toLowerCase().replace(/[^a-z']/g, '');
      dict.set(w, [...(dict.get(w) || []), phones]);
    }
  }
  const w = word.toLowerCase().replace(/’/g, "'").replace(/[^a-z']/g, '');
  if (dict.has(w)) return dict.get(w); // includes contractions: let's, can't
  // Possessives CMU doesn't list: Toby's = Toby + Z.
  if (/'s$/.test(w)) return lookup(w.slice(0, -2)).map((p) => [...p, ending(p, 's')]);
  return lookup(w.replace(/'/g, ''));
}

function lookup(w) {
  if (dict.has(w)) return dict.get(w);
  for (const [suffix, stems] of SUFFIXES) {
    if (!w.endsWith(suffix)) continue;
    const root = w.slice(0, -suffix.length);
    for (const stem of stems(root)) {
      if (dict.has(stem)) return dict.get(stem).map((p) => [...p, ...[ending(p, suffix)].flat()]);
    }
  }
  return [];
}

// Possible stems: as is, with a silent e back (liked: like), or undoubled (sitting: sit).
const stems = (root) => [root, root + 'e', root.length > 2 && root.at(-1) === root.at(-2) ? root.slice(0, -1) : null].filter(Boolean);
const SUFFIXES = [['ing', stems], ['ed', stems], ['es', (r) => [r]], ['s', (r) => [r]]];

const VOICELESS = new Set(['P', 'K', 'F', 'TH', 'S', 'SH', 'CH']);
const SIBILANT = new Set(['S', 'Z', 'SH', 'ZH', 'CH', 'JH']);
function ending(p, suffix) {
  const last = p.at(-1).replace(/\d/g, '');
  if (suffix === 'ing') return ['IH0', 'NG'];
  if (suffix === 'ed') return last === 'T' || last === 'D' ? ['IH0', 'D'] : VOICELESS.has(last) ? 'T' : 'D';
  return SIBILANT.has(last) ? ['IH0', 'Z'] : VOICELESS.has(last) ? 'S' : 'Z';
}
