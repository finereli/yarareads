// Pronunciations from the CMU dictionary (data/cmudict.dict), keyed by lowercase word.
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
let dict;

export function pronunciations(word) {
  if (!dict) {
    dict = new Map();
    for (const line of readFileSync(root + 'data/cmudict.dict', 'utf8').split('\n')) {
      const [head, ...phones] = line.split('#')[0].trim().split(/\s+/);
      if (!head || !phones.length) continue;
      const w = head.replace(/\(\d+\)$/, '').replace(/[^a-z]/g, '');
      dict.set(w, [...(dict.get(w) || []), phones]);
    }
  }
  return dict.get(word.toLowerCase().replace(/[^a-z]/g, '')) || [];
}
