// Shared by the app (word breakdown) and tools/ (decodability check).
//
// An inventory is { graphemes: { grapheme: [phonemes...] }, tricky: [...], names: [...] }.
// Phonemes are ARPAbet without stress, e.g. "igh": ["AY"], "x": ["K S"].
// A pronunciation is an ARPAbet array with stress digits, e.g. ["N", "AY1", "T"].

export function normalize(word) {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
// Unstressed single vowels collapse to a schwa: the "o" in dragon, the "a" in asleep.
const SCHWA = new Set(['AH0', 'IH0']);

// Split a word into graphemes Yara knows such that each grapheme makes one of the
// sounds she knows for it, matching a real pronunciation. Returns null if impossible.
export function decode(word, graphemes, pronunciation) {
  const w = normalize(word);
  const keys = Object.keys(graphemes).sort((a, b) => b.length - a.length);
  const plain = pronunciation.map((p) => p.replace(/\d/g, ''));
  const memo = new Map();

  function go(i, j) {
    if (i === w.length) return j === plain.length ? [] : null;
    const key = i * 100 + j;
    if (memo.has(key)) return memo.get(key);
    let found = null;
    for (const g of keys) {
      if (!w.startsWith(g, i)) continue;
      const options = graphemes[g].map((s) => s.split(' '));
      if (VOWELS.has(g) && SCHWA.has(pronunciation[j])) options.push([plain[j]]);
      for (const seq of options) {
        if (seq.every((p, k) => plain[j + k] === p)) {
          const rest = go(i + g.length, j + seq.length);
          if (rest) { found = [g, ...rest]; break; }
        }
      }
      if (found) break;
    }
    memo.set(key, found);
    return found;
  }
  return go(0, 0);
}

// Spelling-only split, longest grapheme first. Only used when no pronunciation is known.
export function segment(word, graphemes) {
  const w = normalize(word);
  const keys = Object.keys(graphemes).sort((a, b) => b.length - a.length);
  const out = [];
  for (let i = 0; i < w.length; ) {
    const g = keys.find((g) => w.startsWith(g, i));
    if (!g) return null;
    out.push(g);
    i += g.length;
  }
  return out;
}

// How Yara should approach a word: 'name', 'tricky', 'decodable' (with parts) or 'unknown'.
// pronunciations is a list of possible pronunciations for the word (may be empty).
export function classify(word, inv, pronunciations = []) {
  const w = normalize(word);
  const base = normalize(word.replace(/[’']s$/, ''));
  if (inv.names.map(normalize).includes(base)) return { kind: 'name' };
  if (inv.tricky.map(normalize).includes(w)) return { kind: 'tricky' };
  for (const p of pronunciations) {
    const parts = decode(w, inv.graphemes, p);
    if (parts) return { kind: 'decodable', parts };
  }
  return { kind: 'unknown' };
}

// Break page text into tokens: words (tappable) and the spaces/punctuation between them.
export function tokenize(text) {
  return text.match(/[A-Za-z’']+|[^A-Za-z’']+/g) || [];
}

export function isWord(token) {
  return /[A-Za-z]/.test(token);
}
