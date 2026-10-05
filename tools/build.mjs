// Compiles stories: attaches how each word breaks down, and lists words Yara can't read yet.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { classify, tokenize, isWord, normalize } from '../public/phonics.js';
import { pronunciations } from './lexicon.mjs';

const root = new URL('..', import.meta.url).pathname;
export const inventory = JSON.parse(readFileSync(join(root, 'content/inventory.json'), 'utf8'));

export function storyFiles() {
  const dir = join(root, 'content/stories');
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => join(dir, f));
}

export function compile(story, inv = inventory) {
  const words = {};
  const unknown = new Map();
  let count = 0;
  story.pages.forEach((page, n) => {
    for (const t of tokenize(page.text).filter(isWord)) {
      count++;
      const w = normalize(t);
      const c = classify(t, inv, pronunciations(t));
      words[w] = c;
      if (c.kind === 'unknown') unknown.set(w, [...(unknown.get(w) || []), n + 1]);
    }
  });
  return { story: { ...story, words }, unknown, count };
}
