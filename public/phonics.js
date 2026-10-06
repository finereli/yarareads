// Shared by the app (word breakdown, grown-ups section) and tools/ (decodability check).
//
// An inventory is { graphemes: [...], tricky: [...], names: [...] }: what Yara knows.
// CATALOG gives the sounds each grapheme makes, as ARPAbet without stress ("igh": ["AY"], "x": ["K S"]).
// A pronunciation is an ARPAbet array with stress digits, e.g. ["N", "AY1", "T"].

// In Teach Your Monster to Read order. The last group isn't in TYM; it's there to switch on later.
export const CATALOG = [
  ['s', ['S', 'Z']], ['a', ['AE']], ['t', ['T']], ['p', ['P']], ['i', ['IH']], ['n', ['N', 'NG']],
  ['m', ['M']], ['d', ['D']], ['g', ['G']], ['o', ['AA', 'AO']], ['c', ['K']], ['k', ['K']],
  ['ck', ['K']], ['e', ['EH']], ['u', ['AH']], ['r', ['R']], ['h', ['HH']], ['b', ['B']],
  ['f', ['F']], ['ff', ['F']], ['l', ['L']], ['ll', ['L']], ['ss', ['S']], ['j', ['JH']],
  ['qu', ['K W']], ['v', ['V']], ['w', ['W']], ['x', ['K S']], ['y', ['Y']], ['z', ['Z']],
  ['zz', ['Z']], ['ch', ['CH']], ['sh', ['SH']], ['th', ['TH', 'DH']], ['ng', ['NG']],
  ['ai', ['EY']], ['ee', ['IY']], ['igh', ['AY']], ['oa', ['OW']], ['oo', ['UW', 'UH']],
  ['ar', ['AA R']], ['or', ['AO R']], ['ur', ['ER']], ['ow', ['AW']], ['oi', ['OY']], ['ear', ['IH R']],
  ['air', ['EH R']], ['ure', ['UH R']], ['er', ['ER']], ['ay', ['EY']], ['ou', ['AW']], ['ie', ['AY']],
  ['ea', ['IY']], ['oy', ['OY']], ['ir', ['ER']], ['ue', ['UW', 'Y UW']], ['aw', ['AO']], ['wh', ['W']],
  ['ph', ['F']],
  // Not in TYM yet.
  ['ew', ['UW', 'Y UW']], ['oe', ['OW']], ['au', ['AO']], ['ey', ['EY', 'IY']], ['gg', ['G']],
];
const SOUNDS = Object.fromEntries(CATALOG);

export function normalize(word) {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
// Unstressed single vowels collapse to a schwa: the "o" in dragon, the "a" in asleep.
const SCHWA = new Set(['AH0', 'IH0']);

// Split a word into graphemes Yara knows such that each grapheme makes one of its
// sounds, matching a real pronunciation. Returns null if impossible.
export function decode(word, graphemes, pronunciation) {
  const w = normalize(word);
  const keys = graphemes.filter((g) => SOUNDS[g]).sort((a, b) => b.length - a.length);
  const plain = pronunciation.map((p) => p.replace(/\d/g, ''));
  const memo = new Map();

  function go(i, j) {
    if (i === w.length) return j === plain.length ? [] : null;
    const key = i * 100 + j;
    if (memo.has(key)) return memo.get(key);
    let found = null;
    for (const g of keys) {
      if (!w.startsWith(g, i)) continue;
      const options = SOUNDS[g].map((s) => s.split(' '));
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

// How Yara should approach a word: 'name', 'tricky', 'decodable' (with parts) or 'unknown'.
// pronunciations is a list of possible pronunciations for the word (may be empty).
export function classify(word, inv, pronunciations = []) {
  const w = normalize(word);
  const base = normalize(word.replace(/[’']s$/, ''));
  const names = inv.names.map(normalize);
  // Possessives: "Yara's" arrives as "yaras" once stored without the apostrophe.
  if (names.includes(base) || (w.endsWith('s') && names.includes(w.slice(0, -1)))) return { kind: 'name' };
  if (inv.tricky.map(normalize).includes(w)) return { kind: 'tricky' };
  if (w.length === 1 && inv.graphemes.includes(w)) return { kind: 'decodable', parts: [w] }; // "a"
  // Weak forms with no stressed syllable ("into" as IH0 N T AH0) aren't how she'd sound it out.
  for (const p of pronunciations.filter((p) => p.some((ph) => ph.endsWith('1')))) {
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

// Words in a compiled story that Yara can't read with this inventory.
export function unreadable(story, inv) {
  return Object.entries(story.words)
    .filter(([w, prons]) => classify(w, inv, prons).kind === 'unknown')
    .map(([w]) => w);
}
