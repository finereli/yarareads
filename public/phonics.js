// Shared by the app (word breakdown, grown-ups section) and tools/ (decodability check).
//
// An inventory is { graphemes: [...], tricky: [...], names: [...] }: what Yara knows.
// CATALOG gives the sounds each grapheme makes, as ARPAbet without stress ("igh": ["AY"], "x": ["K S"]).
// A pronunciation is an ARPAbet array with stress digits, e.g. ["N", "AY1", "T"].

// Grouped as the grown-ups section shows them; TYM's own order within the first group.
export const CATALOG_GROUPS = [
  ['From Teach Your Monster to Read', [
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
  ]],
  // Split digraphs: the vowel and a final e make one long sound around a consonant (m-a_e-k: make).
  ['Silent e', [
    ['a_e', ['EY']], ['e_e', ['IY']], ['i_e', ['AY']], ['o_e', ['OW']], ['u_e', ['UW', 'Y UW']],
  ]],
  ['Coming later', [
    ['ew', ['UW', 'Y UW']], ['oe', ['OW']], ['au', ['AO']], ['ey', ['EY', 'IY']], ['gg', ['G']],
  ]],
];
export const CATALOG = CATALOG_GROUPS.flatMap(([, entries]) => entries);
const SOUNDS = Object.fromEntries(CATALOG);

export function normalize(word) {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
// Unstressed single vowels collapse to a schwa: the "o" in dragon, the "a" in asleep.
const SCHWA = new Set(['AH0', 'IH0']);

const isSplit = (g) => g.length === 3 && g[1] === '_';
const isConsonant = (g) => !/[aeiouy_]/.test(g);

// Split a word into graphemes Yara knows such that each grapheme makes one of its
// sounds, matching a real pronunciation. Returns null if impossible.
//
// The result is in spelling order: [{ text, g }], where text is the letters and g the grapheme.
// A silent-e pair spans the consonant between: make is m, a (g: a_e), k, e (g: a_e, silent).
export function decode(word, graphemes, pronunciation) {
  const w = normalize(word);
  const known = graphemes.filter((g) => SOUNDS[g]);
  const keys = known.filter((g) => !isSplit(g)).sort((a, b) => b.length - a.length);
  const splits = known.filter(isSplit);
  const consonants = keys.filter(isConsonant);
  const plain = pronunciation.map((p) => p.replace(/\d/g, ''));
  const matches = (g, j) => {
    const options = SOUNDS[g].map((s) => s.split(' '));
    if (VOWELS.has(g) && SCHWA.has(pronunciation[j])) options.push([plain[j]]);
    return options.filter((seq) => seq.every((p, k) => plain[j + k] === p)).map((seq) => seq.length);
  };
  const memo = new Map();

  function go(i, j) {
    if (i === w.length) return j === plain.length ? [] : null;
    const key = i * 100 + j;
    if (memo.has(key)) return memo.get(key);
    let found = null;
    // Silent e first: vowel, one consonant grapheme, then e (a_e in "make", i_e in "white").
    for (const g of splits) {
      if (found || w[i] !== g[0]) continue;
      for (const c of consonants) {
        const e = i + 1 + c.length;
        if (found || !w.startsWith(c, i + 1) || w[e] !== 'e') continue;
        for (const n of matches(g, j)) {
          for (const m of matches(c, j + n)) {
            const rest = go(e + 1, j + n + m);
            if (rest) { found = [{ text: g[0], g }, { text: c, g: c }, { text: 'e', g, silent: true }, ...rest]; break; }
          }
          if (found) break;
        }
      }
    }
    for (const g of keys) {
      if (found || !w.startsWith(g, i)) continue;
      for (const n of matches(g, j)) {
        const rest = go(i + g.length, j + n);
        if (rest) { found = [{ text: g, g }, ...rest]; break; }
      }
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
  if (w.length === 1 && inv.graphemes.includes(w)) return { kind: 'decodable', parts: [{ text: w, g: w }] }; // "a"
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

// The inventory as it applies inside one story: plus that story's own characters' names.
export function forStory(inv, story) {
  return story.names ? { ...inv, names: [...inv.names, ...story.names] } : inv;
}

// Words in a compiled story that Yara can't read with this inventory.
export function unreadable(story, inv) {
  const local = forStory(inv, story);
  return Object.entries(story.words)
    .filter(([w, prons]) => classify(w, local, prons).kind === 'unknown')
    .map(([w]) => w);
}
